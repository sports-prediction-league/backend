// Load environment variables
require("dotenv").config(
  process.env.NODE_ENV === "development" ? { path: "./dev.env" } : undefined
);

// Core imports
const express = require("express");
const http = require("http");
const cors = require("cors");
const morgan = require("morgan");
const { sequelize } = require("./models");

// Import controllers
const {
  getMatches,
  checkAndScore,
  initializeMatches,
} = require("./controllers/match/match.controller");
const {
  execute_contract_call,
} = require("./controllers/contract/contract.controller");

// Import custom socket handler
const ServerSocket = require("./socket/socket");

// Create Express app
const app = express();

// Configure middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("common"));

// API Routes
app.get("/", (_, res) => {
  res.status(200).send("Server running successfully");
});

app.get("/matches", getMatches);

// Contract execution endpoint
app.post("/execute", async (req, res) => {
  try {
    const tx = await execute_contract_call(req.body);
    res.status(200).send(tx);
  } catch (error) {
    console.error("Execute contract error:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      data: {},
    });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Initialize socket server
const socket = new ServerSocket(server);

// Periodic task management
let isRunning = false;

/**
 * Periodic task to check and score matches
 */
const matchCheckTask = async () => {
  // Skip if paused
  if (process.env.PAUSE_TASKS === "YES") {
    console.log("Tasks paused by environment variable");
    return;
  }

  // Skip if already running
  if (isRunning) {
    console.log("Previous task still running, skipping this iteration");
    return;
  }

  isRunning = true;
  console.log(`Task started at: ${new Date().toISOString()}`);

  try {
    const result = await checkAndScore();

    if (result.newMatches.length > 0 || result.fetchLeaderboard) {
      console.log(`Emitting ${result.newMatches.length} new matches`);
      socket.io.emit("new-matches", result);
    }
    isRunning = false;
  } catch (error) {
    console.error("Error during match check task:", error);
    isRunning = false;
  } finally {
    isRunning = false;
    console.log(`Task completed at: ${new Date().toISOString()}`);
  }
};

let isRunningOutsideCalls = false;

// NEW CODE START - 1-second interval implementation
/**
 * Function to be executed every second
 */
const outsideExecutionTask = async () => {
  if (isRunningOutsideCalls) {
    console.log("Previous execution still running, skipping this iteration");
    return;
  }

  const request = socket.getOlderRequest();
  if (!request) {
    // console.log("No calls for execution");
    return;
  }

  isRunningOutsideCalls = true;
  console.log(`OutsideExecution Task started at: ${new Date().toISOString()}`);
  try {
    // Skip if already running

    const tx = await execute_contract_call(request.call.payload);

    console.log(`Executed ${request}`, "\n\n\n\n\n\n\n\n\n");
    console.log(`transaction`, tx);

    socket.io
      .to(request.socketId)
      .emit("execution-response", { type: request.call.type, tx });
    isRunningOutsideCalls = false;
  } catch (error) {
    socket.io.to(request.socketId).emit("execution-response", {
      type: request.call.type,
      tx: {
        success: false,
        message: "Internal server error",
        data: {},
      },
    });

    console.error("Error during OutsideExecution task:", error);
    isRunningOutsideCalls = false;
  } finally {
    isRunningOutsideCalls = false;
    console.log(
      `OutsideExecution Task completed at: ${new Date().toISOString()}`
    );
  }
};

// Store the 1-second interval reference
let outsideExecutionInterval = null;

/**
 * Start the 1-second interval
 */
const startOutsideExecutionInterval = () => {
  if (outsideExecutionInterval) {
    clearInterval(outsideExecutionInterval);
  }
  outsideExecutionInterval = setInterval(outsideExecutionTask, 500);
  // console.log("One-second interval task started");
};
// NEW CODE END

/**
 * Initialize server
 */
const initializeServer = async () => {
  try {
    // Skip initialization if paused
    if (process.env.PAUSE_TASKS === "YES") {
      console.log("Server initialization paused by environment variable");
      return;
    }
    isRunning = true;
    console.log("Initializing matches...");
    await initializeMatches();
    isRunning = false;
    console.log("Matches initialized successfully");
  } catch (error) {
    isRunning = false;
    console.error("Failed to initialize matches:", error);
  }
};

/**
 * Graceful shutdown handler
 */
const cleanup = async () => {
  console.log("Shutting down server gracefully...");

  // Clear running task interval
  clearInterval(taskInterval);

  // NEW: Clear the 1-second interval
  if (outsideExecutionInterval) {
    clearInterval(outsideExecutionInterval);
    outsideExecutionInterval = null;
  }

  // Close database connection
  await sequelize.close();
  console.log("Database connection closed");

  // Close socket connection
  socket.io.close();
  console.log("Socket connections closed");

  // Exit process
  process.exit(0);
};

// Set up task interval (configurable via env var)
const taskIntervalTime = parseInt(process.env.TASK_INTERVAL_MS) || 60000; // Default 1 minute
const taskInterval = setInterval(matchCheckTask, taskIntervalTime);

// Register cleanup handlers
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, async () => {
  try {
    // Connect to database
    await sequelize.authenticate();
    console.log("Connected to database successfully");

    // Initialize server components
    await initializeServer();

    // NEW: Start the 1-second interval
    startOutsideExecutionInterval();

    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    await cleanup();
  }
});
