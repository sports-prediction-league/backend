require("dotenv").config({ path: "./.env" });
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { sequelize } = require("./models");
const cors = require("cors");
const morgan = require("morgan");
const { get_profile_pic } = require("./controllers/user/user.controller");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SERVER_URL = process.env.SERVER_URL;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("common"));

const bot = new TelegramBot(BOT_TOKEN, { webHook: true });
bot.setWebHook(`${SERVER_URL}/bot${BOT_TOKEN}`);

app.get("/profile_pic", get_profile_pic);

bot.on("message", async (msg) => {
  try {
  } catch (error) {
    console.log(error);
  }
});

bot.onText(/\/start/, async (msg) => {});

app.post(`/bot${BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

bot.on("polling_error", (error) => {
  console.log("Polling error:", error); // Log polling errors
});

bot.on("webhook_error", (error) => {
  console.log("Webhook error:", error); // Log webhook errors
});

app.get("/", (_, res) => {
  res.status(200).send("server running successfully");
});

const server = app;
const PORT = 5000 || process.env.PORT;
server.listen(PORT, async () => {
  await sequelize.authenticate();
  console.log("Connected to database");
  console.log("server running on port ", PORT);
});
