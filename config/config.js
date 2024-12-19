require("dotenv").config();
const DB_USERNAME = process.env.DB_USERNAME;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_HOST = process.env.DB_HOST;
const DB_DIALECT = process.env.DB_DIALECT;
const DB_PORT = process.env.DB_PORT;
const DB = process.env.DB;

module.exports = {
  development: {
    username: "user",
    password: "testpassword",
    database: "dev-db",
    dialect: "sqlite",
    storage: "./dev.sqlite",
    logging: false,
  },
  test: {
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_USERNAME,
    database: DB,
    host: DB_HOST,
    dialect: DB_DIALECT,
    logging: false,
    port: DB_PORT,
    sslmode: "REQUIRED",
    ssl: true,
    dialectOptions: {
      ssl: true,
    },
  },
  production: {
    username: DB_USERNAME,
    password: DB_PASSWORD,
    database: DB_USERNAME,
    host: DB_HOST,
    dialect: DB_DIALECT,
    logging: false,
  },
};
