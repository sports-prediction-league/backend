"use strict";
const { Model } = require("sequelize");
module.exports = (sequelize, DataTypes) => {
  class Match extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {}
    toJSON() {
      return {
        ...this.get(),
        createdAt: undefined,
        updatedAt: undefined,
      };
    }

    getDetails(hidden = true) {
      const jsonString = this.getDataValue("details");
      const parsedData = jsonString ? JSON.parse(jsonString) : null;

      // Perform additional checks using extraParam

      if (hidden && parsedData) {
        return { ...parsedData, events: undefined, goals: undefined };
      }

      return parsedData;
    }
  }
  Match.init(
    {
      id: {
        type: DataTypes.STRING,
        allowNull: false,
        primaryKey: true,
      },
      round: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      date: {
        type: DataTypes.BIGINT,
        allowNull: false,
      },
      scored: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      type: {
        type: DataTypes.ENUM("LIVE", "VIRTUAL"),
        allowNull: false,
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: true,
        // get() {
        //   // Custom getter for parsing JSON when retrieved from the database
        //   const jsonString = this.getDataValue("details");
        //   return jsonString ? JSON.parse(jsonString) : null;
        // },
        set(value) {
          // Custom setter for stringifying JSON when stored in the database
          this.setDataValue("details", value ? JSON.stringify(value) : null);
        },
      },
    },
    {
      sequelize,
      tableName: "matches",
      modelName: "Match",
    }
  );

  return Match;
};
