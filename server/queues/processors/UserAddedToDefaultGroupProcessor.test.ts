import { GroupPermission, UserRole } from "@shared/types";
import { Group, GroupUser } from "@server/models";
import {
  buildUser,
  buildAdmin,
  buildViewer,
  buildGuestUser,
  buildGroup,
} from "@server/test/factories";
import UserAddedToDefaultGroupProcessor from "./UserAddedToDefaultGroupProcessor";

const ip = "127.0.0.1";

describe("UserAddedToDefaultGroupProcessor", () => {
  describe("users.create", () => {
    it("should add a new admin to the Default group", async () => {
      const user = await buildAdmin();

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.create",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
      });

      const group = await Group.findOne({
        where: { teamId: user.teamId, isDefault: true },
      });
      expect(group).not.toBeNull();

      const membership = await GroupUser.findOne({
        where: { groupId: group!.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
      expect(membership!.permission).toBe(GroupPermission.Member);
    });

    it("should add a new member to the Default group", async () => {
      const user = await buildUser();

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.create",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
      });

      const group = await Group.findOne({
        where: { teamId: user.teamId, isDefault: true },
      });
      expect(group).not.toBeNull();

      const membership = await GroupUser.findOne({
        where: { groupId: group!.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
    });

    it("should add a viewer to the Default group", async () => {
      const user = await buildViewer();

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.create",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
      });

      const group = await Group.findOne({
        where: { teamId: user.teamId, isDefault: true },
      });
      expect(group).not.toBeNull();

      const membership = await GroupUser.findOne({
        where: { groupId: group!.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
    });

    it("should not add a guest to the Default group", async () => {
      const user = await buildGuestUser();

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.create",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
      });

      const group = await Group.findOne({
        where: { teamId: user.teamId, isDefault: true },
      });
      expect(group).toBeNull();
    });

    it("should be idempotent", async () => {
      const user = await buildUser();

      const processor = new UserAddedToDefaultGroupProcessor();

      // Run twice.
      await processor.perform({
        name: "users.create",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
      });
      await processor.perform({
        name: "users.create",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
      });

      const group = await Group.findOne({
        where: { teamId: user.teamId, isDefault: true },
      });
      expect(group).not.toBeNull();

      const count = await GroupUser.count({
        where: { groupId: group!.id, userId: user.id },
      });
      expect(count).toBe(1);
    });
  });

  describe("users.invite_accepted", () => {
    it("should add the user to the Default group", async () => {
      const user = await buildUser();

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.invite_accepted",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
      });

      const group = await Group.findOne({
        where: { teamId: user.teamId, isDefault: true },
      });
      expect(group).not.toBeNull();

      const membership = await GroupUser.findOne({
        where: { groupId: group!.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
    });
  });

  describe("users.suspend", () => {
    it("should remove the user from the Default group", async () => {
      const user = await buildUser();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });
      await GroupUser.create({
        groupId: group.id,
        userId: user.id,
        createdById: user.id,
        permission: GroupPermission.Member,
      });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.suspend",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).toBeNull();
    });
  });

  describe("users.activate", () => {
    it("should add a non-guest user back to the Default group", async () => {
      const user = await buildUser();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.activate",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
    });

    it("should not add a guest back to the Default group", async () => {
      const user = await buildGuestUser();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.activate",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).toBeNull();
    });
  });

  describe("users.update (guest boundary crossing)", () => {
    it("should add user when promoted from guest to member", async () => {
      const user = await buildGuestUser();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });
      // The role change event fires after the role is already updated in the DB.
      await user.update({ role: UserRole.Member });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.update",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        changes: {
          attributes: { role: UserRole.Member },
          previous: { role: UserRole.Guest },
        },
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
    });

    it("should remove user when demoted from member to guest", async () => {
      const user = await buildUser();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });
      await GroupUser.create({
        groupId: group.id,
        userId: user.id,
        createdById: user.id,
        permission: GroupPermission.Member,
      });
      // The role change event fires after the role is already updated in the DB.
      await user.update({ role: UserRole.Guest });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.update",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        changes: {
          attributes: { role: UserRole.Guest },
          previous: { role: UserRole.Member },
        },
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).toBeNull();
    });
  });

  describe("users.promote / users.demote (admin role changes)", () => {
    describe("shouldQueue", () => {
      it("should queue when crossing the guest boundary", async () => {
        const user = await buildUser();
        const queued = await UserAddedToDefaultGroupProcessor.shouldQueue({
          name: "users.promote",
          userId: user.id,
          actorId: user.id,
          teamId: user.teamId,
          ip,
          data: { name: user.name },
          changes: {
            attributes: { role: UserRole.Member },
            previous: { role: UserRole.Guest },
          },
        });
        expect(queued).toBe(true);
      });

      it("should not queue when the guest boundary is not crossed", async () => {
        const user = await buildUser();
        const queued = await UserAddedToDefaultGroupProcessor.shouldQueue({
          name: "users.promote",
          userId: user.id,
          actorId: user.id,
          teamId: user.teamId,
          ip,
          data: { name: user.name },
          changes: {
            attributes: { role: UserRole.Admin },
            previous: { role: UserRole.Member },
          },
        });
        expect(queued).toBe(false);
      });
    });

    it("should add the user when promoted from guest", async () => {
      const user = await buildGuestUser();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });
      // The role change event fires after the role is already updated in the DB.
      await user.update({ role: UserRole.Viewer });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.promote",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
        changes: {
          attributes: { role: UserRole.Viewer },
          previous: { role: UserRole.Guest },
        },
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).not.toBeNull();
    });

    it("should remove the user when demoted to guest", async () => {
      const user = await buildViewer();
      const group = await buildGroup({
        teamId: user.teamId,
        name: "Default",
        isDefault: true,
      });
      await GroupUser.create({
        groupId: group.id,
        userId: user.id,
        createdById: user.id,
        permission: GroupPermission.Member,
      });
      await user.update({ role: UserRole.Guest });

      const processor = new UserAddedToDefaultGroupProcessor();
      await processor.perform({
        name: "users.demote",
        userId: user.id,
        actorId: user.id,
        teamId: user.teamId,
        ip,
        data: { name: user.name },
        changes: {
          attributes: { role: UserRole.Guest },
          previous: { role: UserRole.Viewer },
        },
      });

      const membership = await GroupUser.findOne({
        where: { groupId: group.id, userId: user.id },
      });
      expect(membership).toBeNull();
    });
  });
});
