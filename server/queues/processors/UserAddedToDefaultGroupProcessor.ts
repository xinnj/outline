import { GroupPermission, UserRole } from "@shared/types";
import { Group, GroupUser, User } from "@server/models";
import type { Event, UserEvent } from "@server/types";
import Logger from "@server/logging/Logger";
import BaseProcessor from "./BaseProcessor";

export default class UserAddedToDefaultGroupProcessor extends BaseProcessor {
  static applicableEvents: Event["name"][] = [
    "users.create",
    "users.invite_accepted",
    "users.suspend",
    "users.activate",
    "users.update",
    "users.promote",
    "users.demote",
  ];

  /**
   * Skip irrelevant events to avoid empty jobs.
   *
   * @param event The event about to be queued.
   * @returns true if a job should be queued for this processor.
   */
  static async shouldQueue(event: Event): Promise<boolean> {
    switch (event.name) {
      case "users.create":
      case "users.invite_accepted":
      case "users.suspend":
      case "users.activate":
        return true;
      case "users.update":
      case "users.promote":
      case "users.demote": {
        const prevRole = event.changes?.previous?.role as UserRole | undefined;
        const newRole = event.changes?.attributes?.role as UserRole | undefined;

        // Only queue if the guest boundary was crossed.
        if (!newRole || !prevRole || prevRole === newRole) {
          return false;
        }

        const wasGuest = prevRole === UserRole.Guest;
        const isGuest = newRole === UserRole.Guest;
        return wasGuest !== isGuest;
      }
      default:
        return false;
    }
  }

  /**
   * Ensure users are added to or removed from the "Default" default group
   * based on eligibility changes.
   *
   * @param event The user event to process.
   */
  async perform(event: UserEvent) {
    switch (event.name) {
      case "users.create":
      case "users.invite_accepted":
      case "users.activate":
        await this.addToDefaultGroup(event);
        break;
      case "users.suspend":
        await this.removeFromDefaultGroup(event);
        break;
      case "users.update":
      case "users.promote":
      case "users.demote":
        await this.handleRoleChange(event);
        break;
    }
  }

  private async addToDefaultGroup(event: UserEvent) {
    const user = await User.findByPk(event.userId);

    if (!user || user.isGuest || user.isSuspended) {
      return;
    }

    const group = await Group.findDefaultGroup(event.teamId, user.id);

    const [, created] = await GroupUser.findOrCreate({
      where: {
        groupId: group.id,
        userId: user.id,
      },
      defaults: {
        createdById: user.id,
        permission: GroupPermission.Member,
      },
    });

    if (created) {
      Logger.info(
        "processor",
        `Added user ${event.userId} to "Default" group (event: ${event.name})`
      );
    }
  }

  private async removeFromDefaultGroup(event: UserEvent) {
    const group = await Group.findOne({
      where: {
        teamId: event.teamId,
        isDefault: true,
      },
    });

    if (!group) {
      return;
    }

    const destroyed = await GroupUser.destroy({
      where: {
        groupId: group.id,
        userId: event.userId,
      },
    });

    if (destroyed) {
      Logger.info(
        "processor",
        `Removed user ${event.userId} from "Default" group (event: ${event.name})`
      );
    }
  }

  private async handleRoleChange(event: UserEvent) {
    const prevRole = event.changes?.previous?.role as UserRole | undefined;
    const newRole = event.changes?.attributes?.role as UserRole | undefined;

    if (!newRole || !prevRole) {
      return;
    }

    const wasGuest = prevRole === UserRole.Guest;
    const isGuest = newRole === UserRole.Guest;

    if (wasGuest && !isGuest) {
      // Promoted from guest to member/viewer/admin.
      await this.addToDefaultGroup(event);
    } else if (!wasGuest && isGuest) {
      // Demoted from member/viewer/admin to guest.
      await this.removeFromDefaultGroup(event);
    }
  }
}
