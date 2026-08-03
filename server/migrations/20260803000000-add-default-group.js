"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Guard against re-running after a previous partial execution.
    const tableInfo = await queryInterface.describeTable("groups");
    if (!tableInfo.isDefault) {
      await queryInterface.addColumn("groups", "isDefault", {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
    }

    // Create an "Default" group for each existing team and add all
    // non-guest, non-suspended workspace members to it.
    const [teams] = await queryInterface.sequelize.query(
      `SELECT DISTINCT "teamId" FROM users`
    );

    for (const { teamId } of teams) {
      // Find the first user in the team to attribute group creation to.
      const [users] = await queryInterface.sequelize.query(
        `SELECT "id" FROM users WHERE "teamId" = :teamId ORDER BY "createdAt" ASC LIMIT 1`,
        { replacements: { teamId } }
      );

      if (!users.length) {
        continue;
      }

      const createdById = users[0].id;

      // Check if a default group already exists for this team.
      const [existing] = await queryInterface.sequelize.query(
        `SELECT "id" FROM groups WHERE "teamId" = :teamId AND "name" = :name LIMIT 1`,
        { replacements: { teamId, name: "Default" } }
      );

      let groupId;

      if (existing.length > 0) {
        groupId = existing[0].id;
      } else {
        // Create the default group.
        const [created] = await queryInterface.sequelize.query(
          `INSERT INTO groups ("id", "name", "teamId", "createdById", "isDefault", "description", "createdAt", "updatedAt")
           VALUES (gen_random_uuid(), :name, :teamId, :createdById, true, :description, NOW(), NOW())
           RETURNING "id"`,
          {
            replacements: {
              name: "Default",
              teamId,
              createdById,
              description:
                "Automatically managed group containing all workspace members.",
            },
          }
        );
        groupId = created[0].id;
      }

      // Add all non-guest, non-suspended users to the default group.
      await queryInterface.sequelize.query(
        `INSERT INTO group_users ("groupId", "userId", "createdById", "permission", "createdAt", "updatedAt")
         SELECT :groupId, "id", "id", 'member', NOW(), NOW()
         FROM users
         WHERE "teamId" = :teamId
           AND "role" != 'guest'
           AND "suspendedAt" IS NULL
           AND "id" NOT IN (
             SELECT "userId" FROM group_users WHERE "groupId" = :groupId
           )`,
        { replacements: { groupId, teamId } }
      );
    }
  },

  async down(queryInterface) {
    // Remove all default group memberships.
    await queryInterface.sequelize.query(
      `DELETE FROM group_users WHERE "groupId" IN (SELECT "id" FROM groups WHERE "isDefault" = true)`
    );

    // Remove all default groups.
    await queryInterface.sequelize.query(
      `DELETE FROM groups WHERE "isDefault" = true`
    );

    await queryInterface.removeColumn("groups", "isDefault");
  },
};
