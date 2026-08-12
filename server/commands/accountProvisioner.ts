import path from "node:path";
import { readFile } from "fs-extra";
import invariant from "invariant";
import { toError, errToString } from "@shared/utils/error";
import { CollectionPermission, GroupPermission, UserRole } from "@shared/types";
import env from "@server/env";
import {
  InvalidAuthenticationError,
  AuthenticationProviderDisabledError,
} from "@server/errors";
import Logger from "@server/logging/Logger";
import { traceFunction } from "@server/logging/tracing";
import type { User } from "@server/models";
import {
  AuthenticationProvider,
  Collection,
  Document,
  Event,
  Group,
  GroupUser,
  Team,
} from "@server/models";
import AuthenticationHelper from "@server/models/helpers/AuthenticationHelper";
import { DocumentHelper } from "@server/models/helpers/DocumentHelper";
import { sequelize } from "@server/storage/database";
import { PluginManager } from "@server/utils/PluginManager";
import groupsSyncer from "./groupsSyncer";
import teamProvisioner from "./teamProvisioner";
import userProvisioner from "./userProvisioner";
import type { APIContext } from "@server/types";
import { addSeconds } from "date-fns";
import { createContext } from "@server/context";

type Props = {
  /** Details of the user logging in from SSO provider */
  user: {
    /** The displayed name of the user */
    name: string;
    /** The email address of the user */
    email: string;
    /** Whether the provider has verified the user owns the email address */
    emailVerified?: boolean;
    /** The public url of an image representing the user */
    avatarUrl?: string | null;
    /** The language of the user, if known */
    language?: string;
  };
  /** Details of the team the user is logging into */
  team: {
    /**
     * The internal ID of the team that is being logged into based on the
     * subdomain that the request came from, if any.
     */
    teamId?: string;
    /** The displayed name of the team */
    name?: string;
    /** The domain name from the email of the user logging in */
    domain?: string;
    /** The preferred subdomain to provision for the team if not yet created */
    subdomain: string;
    /** The public url of an image representing the team */
    avatarUrl?: string | null;
  };
  /** Details of the authentication provider being used */
  authenticationProvider: {
    /** The name of the authentication provider, eg "google" */
    name: string;
    /** External identifier of the authentication provider */
    providerId: string;
  };
  /** Details of the authentication from SSO provider */
  authentication: {
    /** External identifier of the user in the authentication provider  */
    providerId: string;
    /** The scopes granted by the access token */
    scopes: string[];
    /** The token provided by the authentication provider */
    accessToken?: string;
    /** The refresh token provided by the authentication provider */
    refreshToken?: string;
    /** A number of seconds that the given access token expires in */
    expiresIn?: number;
  };
  /**
   * An explicit role to assign to the user during provisioning. Auth
   * providers can use this to map external claims (e.g. OIDC group
   * membership) to Outline roles.
   *
   * - `undefined` (or absent): role mapping not configured; leave untouched.
   * - `UserRole.Admin`: promote to admin.
   * - `null`: role mapping is configured but the user does not match the
   *   admin claim — demote to the default role.
   */
  role?: UserRole | null;
  /**
   * Group names claimed by the auth provider (e.g. from an OIDC group
   * claim). When provided, the user's membership in existing Outline groups
   * matching these names is fully synced on every login (users removed from
   * a claimed group are removed from the linked Outline group). Never
   * auto-creates groups. `undefined` (or absent): group sync not configured.
   * `[]`: remove all previously-synced memberships.
   */
  groupNames?: string[];
};

export type AccountProvisionerResult = {
  user: User;
  team: Team;
  isNewTeam: boolean;
  isNewUser: boolean;
};

async function accountProvisioner(
  ctx: APIContext,
  {
    user: userParams,
    team: teamParams,
    authenticationProvider: authenticationProviderParams,
    authentication: authenticationParams,
    role,
    groupNames,
  }: Props
): Promise<AccountProvisionerResult> {
  let result;
  let emailMatchOnly;

  const actor = ctx.state.auth?.user;

  // If the user is already logged in and is an admin of the team then we
  // allow them to connect a new authentication provider.
  if (actor && actor.teamId === teamParams.teamId && actor.isAdmin) {
    const team = actor.team;
    const authenticationProvider = await AuthenticationProvider.findOne({
      where: {
        ...authenticationProviderParams,
        teamId: team.id,
      },
    });

    if (!authenticationProvider) {
      await team.$create<AuthenticationProvider>(
        "authenticationProvider",
        authenticationProviderParams
      );
    }

    return {
      user: actor,
      team,
      isNewUser: false,
      isNewTeam: false,
    };
  }

  try {
    result = await teamProvisioner(ctx, {
      ...teamParams,
      name: teamParams.name || "Wiki",
      authenticationProvider: authenticationProviderParams,
    });
  } catch (err) {
    // The account could not be provisioned for the provided teamId
    // check to see if we can try authentication using email matching only
    if (
      err instanceof Error &&
      "id" in err &&
      err.id === "invalid_authentication"
    ) {
      const authProvider = await AuthenticationProvider.findOne({
        where: {
          name: authenticationProviderParams.name,
          teamId: teamParams.teamId,
        },
        include: [
          {
            model: Team,
            as: "team",
            required: true,
          },
        ],
        order: [["enabled", "DESC"]],
      });

      if (authProvider) {
        emailMatchOnly = true;
        result = {
          authenticationProvider: authProvider,
          team: authProvider.team,
          isNewTeam: false,
        };
      }
    }

    if (!result) {
      if (err instanceof Error && "id" in err && err.id) {
        throw err;
      } else {
        throw InvalidAuthenticationError(errToString(err));
      }
    }
  }

  invariant(result, "Team creator result must exist");
  const { authenticationProvider, team, isNewTeam } = result;

  if (!authenticationProvider.enabled) {
    throw AuthenticationProviderDisabledError();
  }

  // For userProvisioner (new users), null means "use the default role".
  const provisionerRole = role === null ? undefined : role;

  result = await userProvisioner(ctx, {
    name: userParams.name,
    email: userParams.email,
    emailVerified: userParams.emailVerified,
    authenticationProviderName: AuthenticationHelper.getProviderName(
      authenticationProviderParams.name
    ),
    language: userParams.language,
    role: provisionerRole ?? (isNewTeam ? UserRole.Admin : undefined),
    avatarUrl: userParams.avatarUrl,
    teamId: team.id,
    authentication: emailMatchOnly
      ? undefined
      : {
          authenticationProviderId: authenticationProvider.id,
          ...authenticationParams,
          expiresAt: authenticationParams.expiresIn
            ? addSeconds(Date.now(), authenticationParams.expiresIn)
            : undefined,
        },
  });
  const { isNewUser, user } = result;

  // When the caller provides an explicit role override (e.g. from OIDC
  // claims), apply it to both new and existing users. `null` means the
  // provider has role mapping configured but the user does not match the
  // admin claim — demote to the default role. `undefined` means role mapping
  // is not configured; leave the existing role untouched.
  if (role !== undefined) {
    const newRole: UserRole =
      role ??
      (env.DEFAULT_USER_ROLE as UserRole | undefined) ??
      team?.defaultUserRole ??
      UserRole.Member;

    if (user.role !== newRole) {
      const previousRole = user.role;

      try {
        await user.update({ role: newRole });
        user.role = newRole;
        Logger.info(
          "authentication",
          `Role updated via provider mapping for user ${user.id}`,
          { previousRole, newRole }
        );

        // Sync "Default" default group membership inline when the role
        // crosses the guest boundary. The async event processor also handles
        // this, but inline ensures immediate consistency.
        const wasGuest = previousRole === UserRole.Guest;
        const isGuest = newRole === UserRole.Guest;

        if (wasGuest && !isGuest) {
          try {
            const defaultGroup = await Group.findDefaultGroup(team.id, user.id);
            await GroupUser.findOrCreate({
              where: { groupId: defaultGroup.id, userId: user.id },
              defaults: {
                createdById: user.id,
                permission: GroupPermission.Member,
              },
            });
          } catch (err) {
            Logger.warn(
              `Could not add user ${user.id} to "Default" group after role promotion`,
              { ...toError(err), label: "authentication" }
            );
          }
        } else if (!wasGuest && isGuest) {
          try {
            const defaultGroup = await Group.findOne({
              where: { teamId: team.id, isDefault: true },
            });
            if (defaultGroup) {
              await GroupUser.destroy({
                where: { groupId: defaultGroup.id, userId: user.id },
              });
            }
          } catch (err) {
            Logger.warn(
              `Could not remove user ${user.id} from "Default" group after guest demotion`,
              { ...toError(err), label: "authentication" }
            );
          }
        }
      } catch (err) {
        // The User model enforces "at least one admin per team". If demotion
        // would violate that constraint, skip the role update and warn so
        // the login still succeeds. The admin should add another admin
        // before removing themselves from the IdP group.
        Logger.warn(
          `Could not update role for user ${user.id} from ${previousRole} to ${newRole}`,
          { ...toError(err), label: "authentication" }
        );
      }
    }
  }

  if (isNewUser && user.isInvited) {
    await Event.createFromContext(ctx, {
      name: "users.invite_accepted",
      userId: user.id,
    });
  }

  if (isNewUser || isNewTeam) {
    let provision = isNewTeam;

    // accounts for the case where a team is provisioned, but the user creation
    // failed. In this case we have a valid previously created team but no
    // onboarding collection.
    if (!isNewTeam) {
      const count = await Collection.count({
        where: {
          teamId: team.id,
        },
      });
      provision = count === 0;
    }

    if (provision) {
      await provisionFirstCollection(ctx, team, user);
    }
  }

  // Sync group memberships from the authentication provider if enabled
  if (authenticationParams.accessToken) {
    const settings = authenticationProvider.settings;

    if (settings?.groupSyncEnabled) {
      const syncProvider = PluginManager.getGroupSyncProvider(
        authenticationProviderParams.name
      );

      if (syncProvider) {
        try {
          const externalGroups = await syncProvider.fetchUserGroups(
            authenticationParams.accessToken,
            settings
          );

          await sequelize.transaction(async (transaction) => {
            const groupSyncCtx = createContext({
              user,
              ip: ctx.context?.ip,
              transaction,
            });

            await groupsSyncer(groupSyncCtx, {
              user,
              team,
              authenticationProvider,
              externalGroups,
            });
          });
        } catch (err) {
          // Group sync failure should never block login
          Logger.error("Group sync failed during login", toError(err), {
            userId: user.id,
            provider: authenticationProviderParams.name,
          });
        }
      }
    }
  }

  // Sync group memberships derived from env-configured OIDC group claims.
  // Separate from the settings-based GroupSyncProvider path above: driven
  // purely by claim values already present in the login, so it needs no
  // access token or provider settings.
  if (groupNames !== undefined) {
    try {
      const externalGroups = groupNames.map((name) => ({ id: name, name }));
      await sequelize.transaction(async (transaction) => {
        const groupSyncCtx = createContext({
          user,
          ip: ctx.context?.ip,
          transaction,
        });

        await groupsSyncer(groupSyncCtx, {
          user,
          team,
          authenticationProvider,
          externalGroups,
          createMissing: false,
        });
      });
    } catch (err) {
      // Group sync failure should never block login
      Logger.error("OIDC group sync failed during login", toError(err), {
        userId: user.id,
        provider: authenticationProviderParams.name,
      });
    }
  }

  return {
    user,
    team,
    isNewUser,
    isNewTeam,
  };
}

async function provisionFirstCollection(
  ctx: APIContext,
  team: Team,
  user: User
) {
  await sequelize.transaction(async (transaction) => {
    const context = createContext({
      ...ctx,
      transaction,
      user,
    });

    const collection = await Collection.createWithCtx(context, {
      name: "Welcome",
      description: `This collection is a quick guide to what ${env.APP_NAME} is all about. Feel free to delete this collection once your team is up to speed with the basics!`,
      teamId: team.id,
      createdById: user.id,
      sort: Collection.DEFAULT_SORT,
      permission: CollectionPermission.ReadWrite,
    });

    // For the first collection we go ahead and create some initial documents to get
    // the team started. You can edit these in /server/onboarding/x.md
    const onboardingDocs = [
      "Integrations & API",
      "Our Editor",
      "Getting Started",
      "What is Outline",
    ];

    for (const title of onboardingDocs) {
      const text = await readFile(
        path.join(process.cwd(), "server", "onboarding", `${title}.md`),
        "utf8"
      );
      const document = await Document.createWithCtx(context, {
        version: 2,
        isWelcome: true,
        parentDocumentId: null,
        collectionId: collection.id,
        teamId: collection.teamId,
        lastModifiedById: collection.createdById,
        createdById: collection.createdById,
        title,
        text,
      });

      document.content = await DocumentHelper.toJSON(document);

      await document.publish(context, {
        collectionId: collection.id,
        silent: true,
      });
    }
  });
}

export default traceFunction({
  spanName: "accountProvisioner",
})(accountProvisioner);
