require("dotenv").config({ path: "./.env" });
const cron = require("node-cron");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { sequelize } = require("./models");
const cors = require("cors");
const morgan = require("morgan");
const {
  get_profile_pic,
  register_user,
  get_leaderboard_images,
} = require("./controllers/user/user.controller");
const {
  set_next_matches,
  set_scores,
  get_matches,
} = require("./controllers/match/match.controller");
const { parse_data_into_table_structure } = require("./helpers/helpers");
const {
  register_matches,
  get_current_round,
  register_scores,
} = require("./controllers/controller/contract.controller");

const BOT_TOKEN =
  process.env.NODE_ENV === "production"
    ? process.env.BOT_TOKEN
    : process.env.TEST_BOT_TOKEN;
const SERVER_URL = process.env.SERVER_URL;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("common"));

// Extend the TelegramBot class to customize behavior
class CustomTelegramBot extends TelegramBot {
  // Override the request method
  _request(path, options = {}) {
    // Modify the API URL to append /test to the path
    const testPath = `test/${path}`;
    return super._request(testPath, options);
  }
}

const bot =
  process.env.NODE_ENV === "production"
    ? new TelegramBot(BOT_TOKEN, {
        webhook: true,
      })
    : new CustomTelegramBot(BOT_TOKEN, {
        webHook: true,
      });
bot.setWebHook(`${SERVER_URL}/bot${BOT_TOKEN}`);

app.get("/profile_pic", get_profile_pic);
app.get("/leaderboard_images", get_leaderboard_images);

bot.on("message", async (msg) => {
  console.log(msg);
});

bot.onText(/\/start/, register_user);

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

function handle_callback(payload) {
  // bot.sendMessage(
  //   ADMIN_CHAT_ID,
  //   parse_data_into_table_structure(payload.data, payload.msg)
  // );
  console.log(
    parse_data_into_table_structure(payload.data, payload.msg),
    "payload"
  );
}

async function handle_cron() {
  try {
    const current_round = await get_current_round();
    const converted_round = Number(current_round);

    if (converted_round > 0) {
      await set_scores(async (payload) => {
        handle_callback(payload);
        if (payload.success) {
          register_scores(payload.data, handle_callback);
        }
      });
    }
    await set_next_matches(async (payload) => {
      handle_callback(payload);
      if (payload.success) {
        await register_matches(payload.data, handle_callback);
      }
    }, converted_round);
  } catch (error) {
    handle_callback({ success: false, msg: JSON.stringify(error), data: {} });
  }
}

// cron.schedule("*/1 * * * *", () => {
//   handle_cron();

//   console.log("running a task every two minutes");
// });

// Schedule the cron job for 12 AM UTC every day
cron.schedule("0 0 * * *", () => {}, {
  timezone: "UTC", // Ensure the timezone is set to UTC
});

app.get("/", (_, res) => {
  res.status(200).send("server running successfully");
});

app.get("/matches", get_matches);

const server = app;
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  await sequelize.authenticate();
  console.log("Connected to database");
  console.log("server running on port ", PORT);
});
