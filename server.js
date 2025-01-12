require("dotenv").config({ path: "./.env" });
const cron = require("node-cron");
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { sequelize, Status } = require("./models");
const cors = require("cors");
const morgan = require("morgan");
const {
  get_profile_pic,
  register_user,
  get_leaderboard_images,
  get_user_by_id,
} = require("./controllers/user/user.controller");
const {
  set_next_matches,
  set_scores,
  get_matches,
} = require("./controllers/match/match.controller");
const {
  parse_data_into_table_structure,
  feltToString,
} = require("./helpers/helpers");
const {
  register_matches,
  get_current_round,
  register_scores,
  get_user_points,
  get_first_position,
  execute_contract_call,
  deploy_account,
} = require("./controllers/contract/contract.controller");

const BOT_TOKEN =
  process.env.NODE_ENV === "production"
    ? process.env.PROD_BOT_TOKEN
    : process.env.NODE_ENV === "test"
    ? process.env.TEST_BOT_TOKEN
    : process.env.DEV_BOT_TOKEN;
const SERVER_URL =
  process.env.NODE_ENV === "production"
    ? process.env.PROD_SERVER_URL
    : process.env.NODE_ENV === "test"
    ? process.env.TEST_SERVER_URL
    : process.env.DEV_SERVER_URL;
const ADMIN_CHAT_ID =
  process.env.NODE_ENV === "production"
    ? process.env.PROD_ADMIN_CHAT_ID
    : process.env.NODE_ENV === "test"
    ? process.env.TEST_ADMIN_CHAT_ID
    : process.env.DEV_ADMIN_CHAT_ID;

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
app.post("/execute", async (req, res) => {
  try {
    const tx = await execute_contract_call(req.body);
    res.status(200).send(tx);
  } catch (error) {
    res
      .status(500)
      .send({ success: false, message: "Internal server error", data: {} });
  }
});

app.post("/deploy-account", async (req, res) => {
  try {
    const { account_payload, user_id } = req.body;
    if (!account_payload || !user_id) {
      res
        .status(400)
        .send({ success: false, message: "Invalid payload", data: {} });
      return;
    }
    const user = await get_user_by_id(user_id);
    if (!user) {
      res
        .status(400)
        .send({ success: false, message: "Invalid user", data: {} });
      return;
    }
    const tx = await deploy_account(req.body.account_payload);
    res.status(200).send(tx);
  } catch (error) {
    res
      .status(500)
      .send({ success: false, message: "Internal server error", data: {} });
  }
});

bot.on("message", async (msg) => {
  // console.log(msg);
});

bot.onText(/\/start/, register_user);
bot.onText(/\/status (.+)/, async (msg, match) => {
  try {
    if (msg.chat?.id.toString() !== ADMIN_CHAT_ID.toString()) {
      bot.sendMessage(msg.chat.id, "UNAUTHORIZED!");
      return;
    }
    const new_status = match[1].trim();
    const check_status_exist = await Status.findOne();
    if (new_status !== "1" && new_status !== "0") {
      console.log(new_status, typeof new_status);
      bot.sendMessage(msg.chat.id, "INVALID PARAMS");
      return;
    }
    if (!check_status_exist) {
      await Status.create({ match_open: Boolean(Number(new_status)) });
    } else {
      await check_status_exist.update({
        match_open: Boolean(Number(new_status)),
      });
    }
    bot.sendMessage(msg.chat.id, "Status set");
  } catch (error) {
    bot.sendMessage(msg.chat.id, "AN ERROR OCCURED. PLS TRY AGAIN");
  }
});
bot.onText(/\/top/, async (msg) => {
  try {
    const response = await get_first_position(msg.from.id.toString());
    if (response?.Some) {
      const user = feltToString(response.Some.user);
      const score = Number(response.Some.total_score);
      bot.sendMessage(
        msg.chat.id,
        `${user} is leading with a total points of ${score}`
      );
    } else {
      bot.sendMessage(msg.chat.id, "NO LEADERBOARD YET");
    }
  } catch (error) {
    console.log(error);
    bot.sendMessage(msg.chat.id, "AN ERROR OCCURED. PLS TRY AGAIN");
  }
});
bot.onText(/\/my_points/, async (msg) => {
  try {
    const value = await get_user_points(msg.from.id.toString());
    bot.sendMessage(
      msg.chat.id,
      `You have a total of ${Number(value)} points.`
    );
  } catch (error) {
    bot.sendMessage(msg.chat.id, "AN ERROR OCCURED. PLS TRY AGAIN");
  }
});

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
  bot.sendMessage(
    ADMIN_CHAT_ID,
    parse_data_into_table_structure(payload.data, payload.msg)
  );
  // console.log(
  //   parse_data_into_table_structure(payload.data, payload.msg),
  //   "payload"
  // );
}

async function handle_set_matches() {
  try {
    let is_match_commited = false;

    const match_transaction = await sequelize.transaction();
    const current_round = await get_current_round();
    const converted_round = Number(current_round);
    await set_next_matches(
      match_transaction,
      async (payload) => {
        handle_callback(payload);
        if (payload.success) {
          if (payload.data.length) {
            const success = await register_matches(
              payload.data,
              handle_callback
            );
            if (success) {
              await match_transaction.commit();
              is_match_commited = true;
            }
          }
        }
      },
      converted_round
    );
  } catch (error) {
    console.log(error);
    handle_callback({ success: false, msg: error, data: {} });
    if (!is_match_commited) {
      await match_transaction.rollback();
    }
  }
}

async function handle_cron() {
  const score_transaction = await sequelize.transaction();
  const match_transaction = await sequelize.transaction();
  let is_score_commited = false;
  let is_match_commited = false;
  let can_rollback_score = false;
  try {
    const current_round = await get_current_round();
    const converted_round = Number(current_round);
    if (converted_round > 0) {
      can_rollback_score = true;
      await set_scores(score_transaction, async (payload) => {
        handle_callback(payload);
        if (payload.success) {
          if (payload.data.length) {
            const success = await register_scores(
              payload.data,
              handle_callback
            );
            if (success) {
              await score_transaction.commit();
              is_score_commited = true;
            }
          }
        }
      });
    }
    const status = await Status.findOne();
    if (!status?.match_open) {
      handle_callback({ success: false, msg: "MATCH NOT OPENED", data: {} });
      return;
    }
    await set_next_matches(
      match_transaction,
      async (payload) => {
        handle_callback(payload);
        if (payload.success) {
          if (payload.data.length) {
            const success = await register_matches(
              payload.data,
              handle_callback
            );
            if (success) {
              await match_transaction.commit();
              is_match_commited = true;
            }
          }
        }
      },
      converted_round
    );
  } catch (error) {
    console.log(error);
    handle_callback({ success: false, msg: error, data: {} });
    if (!is_match_commited) {
      await match_transaction.rollback();
    }

    if (!is_score_commited) {
      if (can_rollback_score) {
        await score_transaction.rollback();
      }
    }
  }
}

bot.onText(/\/set_matches/, async (msg) => {
  try {
    if (msg.chat?.id.toString() !== ADMIN_CHAT_ID.toString()) {
      bot.sendMessage(msg.chat.id, "UNAUTHORIZED!");
      return;
    }
    await handle_set_matches();
  } catch (error) {
    bot.sendMessage(msg.chat.id, "AN ERROR OCCURED. PLS TRY AGAIN");
  }
});

// cron.schedule("*/1 * * * *", () => {
//   handle_cron();

//   console.log("running a task every two minutes");
// });

// Schedule the cron job for 12 AM UTC every day
// cron.schedule(
//   "0 0 * * *",
//   async () => {
//     await handle_cron();
//   },
//   {
//     timezone: "UTC", // Ensure the timezone is set to UTC
//   }
// );

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
