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
const agentToolsRoutes = require("./routes/agentTools");
const tipsRoutes = require("./routes/tips");
const nutritionRoutes = require("./routes/nutrition");
const healthRecordsRoutes = require("./routes/healthRecords");
const { runHourlyMonologue } = require("./cron/hourlyMonologue");
const { runScheduledActions } = require("./cron/scheduledActions");
const { deliverDueTriggers } = require("./services/triggerEngine");

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
app.use(express.json({ limit: "5mb" }));
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
app.use("/api/agent-tools", agentToolsRoutes);
app.use("/api/tips", authMiddleware, tipsRoutes);
app.use("/api/nutrition", authMiddleware, nutritionRoutes);
app.use("/api/health-records", authMiddleware, healthRecordsRoutes);

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

// Hourly AI monologue — runs every hour at :00
const cronIntervalMin = parseInt(process.env.CRON_INTERVAL_MINUTES || "60", 10);
const monologueCron = cronIntervalMin <= 59 ? `*/${cronIntervalMin} * * * *` : "0 * * * *";
cron.schedule(monologueCron, async () => {
  console.log(`[CRON] Running hourly monologue at ${new Date().toISOString()}`);
  try {
    await runHourlyMonologue();
    console.log("[CRON] Hourly monologue complete");
  } catch (err) {
    console.error("[CRON] Hourly monologue failed:", err);
  }
});

// Scheduled actions — every minute
cron.schedule("* * * * *", async () => {
  try {
    await runScheduledActions();
  } catch (err) {
    console.error("[CRON] Scheduled actions failed:", err);
  }
});

// Trigger delivery — every minute (alongside scheduled actions)
cron.schedule("* * * * *", async () => {
  try {
    await deliverDueTriggers();
  } catch (err) {
    console.error("[CRON] Trigger delivery failed:", err);
  }
});

console.log(`[CRON] Registered: monologue (${monologueCron}), scheduled actions (every minute), trigger delivery (every minute)`);

// ---------------------------------------------------------------------------
// Startup Self-Healing — ensure scheduled actions survive restarts
// ---------------------------------------------------------------------------

async function selfHealOnStartup() {
  try {
    const { db } = require("./db");
    const { patientMemory, scheduledActions, userProfiles } = require("./db/schema");
    const { eq, and } = require("drizzle-orm");

    // 1. Find all patients with memory (uploaded health records = started onboarding)
    const allMemory = await db.select().from(patientMemory);
    let seeded = 0;

    for (const mem of allMemory) {

      // Check if they have hook_regeneration scheduled actions
      const existing = await db.select({ id: scheduledActions.id }).from(scheduledActions)
        .where(and(
          eq(scheduledActions.userId, mem.userId),
          eq(scheduledActions.actionType, "hook_regeneration"),
          eq(scheduledActions.isActive, true),
        ));

      if (existing.length >= 2) continue; // already has both

      // Get patient timezone
      const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, mem.userId));
      const tz = profile?.timezone || "America/New_York";

      // Seed missing hook_regeneration actions
      const needed = [
        { scheduledTime: "06:00", label: "scheduled_6am" },
        { scheduledTime: "17:00", label: "scheduled_5pm" },
      ];
      const existingTimes = new Set();
      if (existing.length > 0) {
        const rows = await db.select().from(scheduledActions)
          .where(and(eq(scheduledActions.userId, mem.userId), eq(scheduledActions.actionType, "hook_regeneration")));
        rows.forEach(r => existingTimes.add(r.scheduledTime));
      }

      for (const n of needed) {
        if (existingTimes.has(n.scheduledTime)) continue;
        await db.insert(scheduledActions).values({
          userId: mem.userId,
          actionType: "hook_regeneration",
          scheduledTime: n.scheduledTime,
          recurrence: "daily",
          label: n.label,
          timezone: tz,
          isActive: true,
        });
        seeded++;
      }
    }

    if (seeded > 0) {
      console.log(`[STARTUP] Self-healed: seeded ${seeded} missing hook_regeneration action(s)`);
    }

    // 2. Mark any pipeline runs left in "running" state as interrupted
    for (const mem of allMemory) {
      if (!mem.tier2?.pipeline_runs) continue;
      const runs = mem.tier2.pipeline_runs;
      let changed = false;
      for (const run of runs) {
        const events = run.events || [];
        const isComplete = events.some(e => e.step === "pipeline_complete");
        const hasError = events.some(e => e.status === "error");
        if (!isComplete && !hasError && events.length > 0) {
          run.events.push({
            step: "pipeline_interrupted",
            status: "error",
            timestamp: new Date().toISOString(),
            detail: "Server restarted while pipeline was running",
          });
          changed = true;
        }
      }
      if (changed) {
        const tier2 = { ...mem.tier2, pipeline_runs: runs };
        await db.update(patientMemory).set({ tier2, updatedAt: new Date() })
          .where(eq(patientMemory.userId, mem.userId));
      }
    }

    console.log("[STARTUP] Self-healing complete");
  } catch (err) {
    console.error("[STARTUP] Self-healing error (non-fatal):", err.message);
  }
}

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
    await sql`CREATE TABLE IF NOT EXISTS scheduled_actions (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      action_type VARCHAR(30) NOT NULL,
      label VARCHAR(200),
      scheduled_time VARCHAR(5) NOT NULL,
      recurrence VARCHAR(20) NOT NULL DEFAULT 'daily',
      recurrence_day VARCHAR(10),
      timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_triggered_at TIMESTAMPTZ,
      created_via VARCHAR(20) NOT NULL DEFAULT 'voice',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`ALTER TABLE scheduled_actions ADD COLUMN IF NOT EXISTS interval_days INTEGER NOT NULL DEFAULT 1`;
    await sql`ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS goals JSONB DEFAULT '[]'`;
    await sql`ALTER TYPE vital_type ADD VALUE IF NOT EXISTS 'sleep'`;
    await sql`ALTER TYPE vital_type ADD VALUE IF NOT EXISTS 'mood'`;

    // Daily tips cache table
    await sql`CREATE TABLE IF NOT EXISTS daily_tips (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      tip_date DATE NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS daily_tips_user_date ON daily_tips (user_id, tip_date)`;
    await sql`ALTER TABLE medications ADD COLUMN IF NOT EXISTS is_glp1 BOOLEAN NOT NULL DEFAULT false`;

    // Create user_preferences table if it doesn't exist
    await sql`CREATE TABLE IF NOT EXISTS user_preferences (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      checkin_frequency VARCHAR(20) NOT NULL DEFAULT 'once_daily',
      checkin_time_preference VARCHAR(20) NOT NULL DEFAULT 'morning',
      med_reminder_enabled BOOLEAN NOT NULL DEFAULT true,
      med_reminder_prep_night_before BOOLEAN NOT NULL DEFAULT true,
      hydration_nudges_enabled BOOLEAN NOT NULL DEFAULT true,
      hydration_nudges_per_day INTEGER NOT NULL DEFAULT 3,
      weighin_prompt VARCHAR(20) NOT NULL DEFAULT 'daily_morning',
      exercise_nudges_enabled BOOLEAN NOT NULL DEFAULT false,
      preferred_channel VARCHAR(20) NOT NULL DEFAULT 'both',
      voice_call_frequency VARCHAR(20) NOT NULL DEFAULT 'every_2_days',
      glucose_alert_mode VARCHAR(20),
      quiet_start VARCHAR(5) NOT NULL DEFAULT '22:00',
      quiet_end VARCHAR(5) NOT NULL DEFAULT '07:00',
      set_via VARCHAR(20) NOT NULL DEFAULT 'day1_chat',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    // Backfill: create patients rows for users who don't have one (needed for FK constraints)
    await sql`
      INSERT INTO patients (id, first_name, last_name, date_of_birth, gender)
      SELECT u.id, COALESCE(p.first_name, 'User'), COALESCE(p.last_name, ''), COALESCE(p.date_of_birth, '2000-01-01'), 'prefer_not_to_say'
      FROM users u
      LEFT JOIN user_profiles p ON p.user_id = u.id
      WHERE u.id NOT IN (SELECT id FROM patients)
    `;

    // Meal logs table for nutrition tracking
    await sql`CREATE TABLE IF NOT EXISTS meal_logs (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      calories REAL,
      protein_g REAL,
      carbs_g REAL,
      fat_g REAL,
      fiber_g REAL,
      description VARCHAR(500),
      meal_type VARCHAR(20),
      source VARCHAR(20) NOT NULL DEFAULT 'photo_ai',
      analyzed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    // Apple user ID for Apple Sign In duplicate prevention
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_user_id VARCHAR(255) UNIQUE`;

    // Engagement agent pipeline tables
    await sql`CREATE TABLE IF NOT EXISTS patient_memory (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL UNIQUE REFERENCES users(id),
      tier1 JSONB,
      tier2 JSONB,
      tier3 JSONB,
      raw_records JSONB,
      compacted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS health_records (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      filename VARCHAR(255) NOT NULL,
      content_type VARCHAR(100) NOT NULL,
      size_bytes INTEGER,
      storage_key VARCHAR(500) NOT NULL,
      extracted_data JSONB,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    await sql`CREATE TABLE IF NOT EXISTS triggers (
      id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id),
      type VARCHAR(50) NOT NULL,
      hook_element VARCHAR(20),
      title VARCHAR(200) NOT NULL,
      body TEXT NOT NULL,
      evidence JSONB,
      priority VARCHAR(10) DEFAULT 'medium',
      scheduled_for TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;

    // Widen encrypted PII columns to fit encrypted values
    await sql`ALTER TABLE user_profiles ALTER COLUMN phone TYPE VARCHAR(255)`;
    await sql`ALTER TABLE user_profiles ALTER COLUMN first_name TYPE VARCHAR(255)`;
    await sql`ALTER TABLE user_profiles ALTER COLUMN last_name TYPE VARCHAR(255)`;

    console.log("[MIGRATION] All tables migrated (including engagement pipeline)");
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
    if (!process.env.ENCRYPTION_KEY) {
      console.warn("[SECURITY] ENCRYPTION_KEY not set — PII encryption disabled");
    }
    // Run self-healing after server is up (non-blocking)
    selfHealOnStartup().catch(err => console.error("[STARTUP] Self-heal failed:", err.message));
  });
});
