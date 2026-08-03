"use strict";

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable("documents");
    if (!tableInfo.inheritPermission) {
      await queryInterface.addColumn("documents", "inheritPermission", {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        allowNull: false,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn("documents", "inheritPermission");
  },
};
