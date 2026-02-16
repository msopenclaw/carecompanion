require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const helmet = require("helmet");
const { WebSocketServer } = require("ws");
const cron = require("node-cron");

const { authMiddleware, adminMiddleware } = require("./middleware/auth");
const { rateLimiter, authRateLimiter } = require("./middleware/rateLimit");

const authRoutes = require("./routes/auth");
const profileRoutes = require("./routes/profile");
const coordinatorRoutes = require("./routes/coordinators");
const messagesRoutes = require("./routes/messages");
const vitalsRoutes = require("./routes/vitals");
const medicationsRoutes = require("./routes/medications");
const chatRoutes = require("./routes/chat");
const ttsRoutes = require("./routes/tts");
const pushRoutes = require("./routes/push");
const consentsRoutes = require("./routes/consents");
const consoleRoutes = require("./routes/console");
const preferencesRoutes = require("./routes/preferences");
const day1Routes = require("./routes/day1");
const voiceHandler = require("./routes/voice");
const voiceApiRoutes = require("./routes/voiceApi");
const { runHourlyMonologue } = require("./cron/hourlyMonologue");

const app = express();
app.set("trust proxy", 1);
const server = http.createServer(app);

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

app.use(helmet());
app.use(cors({
  origin: [
    "https://carecompanion.earlygod.ai",
    "http://localhost:3000",
    "http://localhost:3001",
  ],
  credentials: true,
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimiter);

// ---------------------------------------------------------------------------
// Health Check
// ---------------------------------------------------------------------------

app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// Public Routes (no auth)
// ---------------------------------------------------------------------------

app.use("/api/auth", authRateLimiter, authRoutes);

// ---------------------------------------------------------------------------
// Protected Routes (JWT required)
// ---------------------------------------------------------------------------

app.use("/api/profile", authMiddleware, profileRoutes);
app.use("/api/coordinators", coordinatorRoutes);
app.use("/api/messages", authMiddleware, messagesRoutes);
app.use("/api/vitals", authMiddleware, vitalsRoutes);
app.use("/api/medications", authMiddleware, medicationsRoutes);
app.use("/api/chat", authMiddleware, chatRoutes);
app.use("/api/tts", authMiddleware, ttsRoutes);
app.use("/api/push", authMiddleware, pushRoutes);
app.use("/api/consents", authMiddleware, consentsRoutes);
app.use("/api/preferences", authMiddleware, preferencesRoutes);
app.use("/api/day1", authMiddleware, day1Routes);
app.use("/api/voice", authMiddleware, voiceApiRoutes);

// ---------------------------------------------------------------------------
// Admin Routes (JWT + admin role required)
// ---------------------------------------------------------------------------

app.use("/api/console", authMiddleware, adminMiddleware, consoleRoutes);

// ---------------------------------------------------------------------------
// AI Trigger (admin only)
// ---------------------------------------------------------------------------

app.post("/api/ai/trigger", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "userId required" });
    const result = await runHourlyMonologue(userId);
    res.json(result);
  } catch (err) {
    console.error("AI trigger error:", err);
    res.status(500).json({ error: "AI trigger failed" });
  }
});

// ---------------------------------------------------------------------------
// WebSocket — Voice Calls
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ server, path: "/ws/voice" });
wss.on("connection", voiceHandler);

// ---------------------------------------------------------------------------
// Cron — Hourly Monologue
// ---------------------------------------------------------------------------

const cronInterval = process.env.CRON_INTERVAL_MINUTES || "60";
cron.schedule(`0 */${cronInterval} * * *`, async () => {
  console.log(`[CRON] Running hourly monologue at ${new Date().toISOString()}`);
  try {
    await runHourlyMonologue();
    console.log("[CRON] Hourly monologue complete");
  } catch (err) {
    console.error("[CRON] Hourly monologue failed:", err);
  }
});

// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Startup Migrations
// ---------------------------------------------------------------------------

async function runStartupMigrations() {
  try {
    const { neon } = require("@neondatabase/serverless");
    const sql = neon(process.env.DATABASE_URL);
    await sql`ALTER TYPE vital_type ADD VALUE IF NOT EXISTS 'hydration'`;
    await sql`ALTER TYPE vital_type ADD VALUE IF NOT EXISTS 'steps'`;
    console.log("[MIGRATION] vital_type enum updated");
  } catch (err) {
    // IF NOT EXISTS not supported on older PG, enum value may already exist
    if (err.message && err.message.includes("already exists")) {
      console.log("[MIGRATION] vital_type hydration already exists");
    } else {
      console.error("[MIGRATION] Warning:", err.message);
    }
  }
}

const PORT = process.env.PORT || 3000;
runStartupMigrations().then(() => {
  server.listen(PORT, () => {
    console.log(`CareCompanion backend running on port ${PORT}`);
  });
});
