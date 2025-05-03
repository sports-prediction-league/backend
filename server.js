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

    console.log("Initializing matches...");
    await initializeMatches();
    console.log("Matches initialized successfully");
  } catch (error) {
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

    console.log(`Server running on port ${PORT}`);
  } catch (error) {
    console.error("Failed to start server:", error);
    await cleanup();
  }
});
