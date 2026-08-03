import type { InferAttributes, InferCreationAttributes } from "sequelize";
import { Op } from "sequelize";
import {
  BelongsTo,
  Column,
  ForeignKey,
  Table,
  HasMany,
  BelongsToMany,
  DataType,
  Scopes,
} from "sequelize-typescript";
import { GroupValidation, DEFAULT_GROUP_NAME } from "@shared/validations";
import ExternalGroup from "./ExternalGroup";
import GroupMembership from "./GroupMembership";
import GroupUser from "./GroupUser";
import Team from "./Team";
import User from "./User";
import ParanoidModel from "./base/ParanoidModel";
import { CounterCache } from "./decorators/CounterCache";
import Fix from "./decorators/Fix";
import Length from "./validators/Length";
import NotContainsUrl from "./validators/NotContainsUrl";

@Scopes(() => ({
  withMembership: (userId: string) => ({
    include: [
      {
        association: "groupUsers",
        required: true,
        where: {
          userId,
        },
      },
    ],
  }),
}))
@Table({
  tableName: "groups",
  modelName: "group",
  validate: {
    async isUniqueNameInTeam(this: Group) {
      const foundItem = await Group.findOne({
        where: {
          teamId: this.teamId,
          name: {
            [Op.iLike]: this.name,
          },
          id: {
            [Op.not]: this.id,
          },
        },
      });

      if (foundItem) {
        throw new Error("The name of this group is already in use");
      }
    },
  },
})
@Fix
class Group extends ParanoidModel<
  InferAttributes<Group>,
  Partial<InferCreationAttributes<Group>>
> {
  @Length({
    min: 0,
    max: GroupValidation.maxNameLength,
    msg: `name must be ${GroupValidation.maxNameLength} characters or less`,
  })
  @NotContainsUrl
  @Column(DataType.STRING)
  name: string;

  @Length({
    min: 0,
    max: GroupValidation.maxDescriptionLength,
    msg: `description must be ${GroupValidation.maxDescriptionLength} characters or less`,
  })
  @Column(DataType.TEXT)
  description: string;

  @Column(DataType.STRING)
  externalId: string;

  @Column(DataType.BOOLEAN)
  disableMentions: boolean;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  isDefault: boolean;

  /**
   * Find the default group for a team. Creates it if it does not
   * exist.
   *
   * @param teamId The team to find or create the default group for.
   * @param createdById The user to attribute creation to.
   * @returns The default group for the team.
   */
  static async findDefaultGroup(
    teamId: string,
    createdById: string
  ): Promise<Group> {
    const [group] = await this.findOrCreate({
      where: {
        teamId,
        name: DEFAULT_GROUP_NAME,
      },
      defaults: {
        teamId,
        createdById,
        isDefault: true,
        description:
          "Automatically managed group containing all workspace members.",
      },
    });

    return group;
  }

  static filterByMember(userId: string | undefined) {
    return userId
      ? this.scope({ method: ["withMembership", userId] })
      : this.scope("defaultScope");
  }

  // associations

  @HasMany(() => GroupUser, "groupId")
  groupUsers: GroupUser[];

  @HasMany(() => ExternalGroup, "groupId")
  externalGroups: ExternalGroup[];

  @HasMany(() => GroupMembership, "groupId")
  groupMemberships: GroupMembership[];

  @BelongsTo(() => Team, "teamId")
  team: Team;

  @ForeignKey(() => Team)
  @Column(DataType.UUID)
  teamId: string;

  @BelongsTo(() => User, "createdById")
  createdBy: User;

  @ForeignKey(() => User)
  @Column(DataType.UUID)
  createdById: string;

  @BelongsToMany(() => User, () => GroupUser)
  users: User[];

  @CounterCache(() => GroupUser, {
    as: "members",
    foreignKey: "groupId",
    include: [
      {
        association: "user",
        required: true,
        attributes: [],
        where: {
          suspendedAt: { [Op.is]: null },
        },
      },
    ],
  })
  memberCount: Promise<number>;
}

export default Group;
