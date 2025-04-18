require("dotenv").config(
  process.env.NODE_ENV === "development"
    ? {
        path: "./dev.env",
      }
    : undefined
);
const express = require("express");
const TelegramBot = require("node-telegram-bot-api");
const { sequelize } = require("./models");
const cors = require("cors");
const http = require("http");
const morgan = require("morgan");

const {
  getMatches,
  checkAndScore,
  initializeMatches,
} = require("./controllers/match/match.controller");
const { feltToString } = require("./helpers/helpers");
const ServerSocket = require("./socket/socket");
const {
  get_user_points,
  get_first_position,
  execute_contract_call,
  deploy_account,
} = require("./controllers/contract/contract.controller");

const BOT_TOKEN = process.env.BOT_TOKEN;
const SERVER_URL = process.env.SERVER_URL;

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("common"));

// Extend the TelegramBot class to customize behavior
// class CustomTelegramBot extends TelegramBot {
//   // Override the request method
//   _request(path, options = {}) {
//     // Modify the API URL to append /test to the path
//     const testPath = `test/${path}`;
//     return super._request(testPath, options);
//   }
// }

// const bot =
//   process.env.NODE_ENV === "production"
// ? new TelegramBot(BOT_TOKEN, {
//     webhook: true,
//   })
//     : new CustomTelegramBot(BOT_TOKEN, {
//         webHook: true,
//       });

const bot = new TelegramBot(BOT_TOKEN, {
  webhook: true,
});
bot.setWebHook(`${SERVER_URL}/bot${BOT_TOKEN}`);

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

bot.on("message", async (_) => {});

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

app.get("/", (_, res) => {
  res.status(200).send("server running successfully");
});

app.get("/matches", getMatches);

const server = http.createServer(app, {
  cors: {
    origin: "*",
  },
});

const socket = new ServerSocket(server);

let isRunning = false;

const task = async () => {
  if (process.env.pause === "YES") {
    console.log("PAUSED");
    return;
  }
  if (isRunning) {
    console.log("Previous task still running, skipping this iteration.");
    return;
  }
  isRunning = true;
  console.log("Task started at:", new Date().toISOString());

  try {
    const new_matches = await checkAndScore();
    // console.log(
    //   new_matches.map((mp) => mp.date),
    //   new_matches.length
    // );
    if (new_matches.length) {
      socket.io.emit("new-matches", new_matches);
    }
  } catch (error) {
    console.error("Error during task execution:", error);
  } finally {
    isRunning = false;
    console.log("Task completed at:", new Date().toISOString());
  }
};

(async function () {
  try {
    if (process.env.pause === "YES") {
      console.log("PAUSED");
      return;
    }
    await initializeMatches();
    // await checkAndScore();
  } catch (error) {
    console.log(error);
  }
})();

// Run the task every 10 minutes
const interval = 1 * 60 * 1000; // 2 minutes in milliseconds
const job = setInterval(task, interval);

// Graceful Shutdown
const cleanup = async () => {
  console.log("Cleaning up resources...");
  // await redisClient.del("cron-job-isRunning");
  clearInterval(job);
  await sequelize.close();
  socket.io.close();
  process.exit(0);
};

process.on("SIGINT", cleanup);

process.on("SIGTERM", cleanup);

// const server = app;
const PORT = process.env.PORT || 8000;
server.listen(PORT, async () => {
  await sequelize.authenticate();
  console.log("Connected to database");
  console.log("server running on port ", PORT);
});
