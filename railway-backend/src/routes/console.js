const express = require("express");
const { eq, desc, and, gte, sql, count, inArray } = require("drizzle-orm");
const { db } = require("../db");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const {
  users, userProfiles, messages, aiActions, voiceSessions,
  escalations, vitals, medications, medicationLogs, engagementConfig,
  userCoordinator, careCoordinators, userPreferences, patientMemory,
  healthRecords,
} = require("../db/schema");
const { decrypt, decryptJson } = require("../services/encryption");
const { sendPush } = require("../services/pushService");
const { processHealthRecord } = require("../services/ehrCompaction");

// Multer for health record uploads
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + path.extname(file.originalname)),
});
const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/png", "image/heic", "application/xml", "text/xml"];
    cb(null, allowed.includes(file.mimetype));
  },
});

const router = express.Router();

/** Decrypt encrypted PII fields on a profile object (mutates in place) */
function decryptProfile(profile) {
  if (!profile) return;
  profile.firstName = decrypt(profile.firstName);
  profile.lastName = decrypt(profile.lastName);
  if (profile.phone) profile.phone = decrypt(profile.phone);
  if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
  if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
}

// GET /api/console/patients — list all patients with status summaries
router.get("/patients", async (req, res) => {
  try {
    const allUsers = await db.select().from(users)
      .where(eq(users.role, "patient"));

    const patientList = [];
    for (const user of allUsers) {
      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, user.id));
      decryptProfile(profile);

      // Last message
      const [lastMsg] = await db.select().from(messages)
        .where(eq(messages.userId, user.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      // Last AI action
      const [lastAction] = await db.select().from(aiActions)
        .where(eq(aiActions.userId, user.id))
        .orderBy(desc(aiActions.createdAt))
        .limit(1);

      // Unread messages count
      const [unreadResult] = await db.select({ count: count() }).from(messages)
        .where(and(eq(messages.userId, user.id), eq(messages.isRead, false)));

      // Get coordinator
      let coordinator = null;
      const [uc] = await db.select().from(userCoordinator)
        .where(eq(userCoordinator.userId, user.id));
      if (uc) {
        const [coord] = await db.select().from(careCoordinators)
          .where(eq(careCoordinators.id, uc.coordinatorId));
        coordinator = coord;
      }

      // Preferences
      const [prefs] = await db.select().from(userPreferences)
        .where(eq(userPreferences.userId, user.id));

      patientList.push({
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        createdAt: user.createdAt,
        profile,
        coordinator,
        preferences: prefs || null,
        lastMessage: lastMsg || null,
        lastAiAction: lastAction || null,
        unreadCount: unreadResult?.count || 0,
      });
    }

    res.json(patientList);
  } catch (err) {
    console.error("Console patients error:", err);
    res.status(500).json({ error: "Failed to fetch patients" });
  }
});

// GET /api/console/patients/:id — full patient detail
router.get("/patients/:id", async (req, res) => {
  try {
    const userId = req.params.id;

    const [user] = await db.select().from(users)
      .where(eq(users.id, userId));
    if (!user) return res.status(404).json({ error: "Patient not found" });

    const [profile] = await db.select().from(userProfiles)
      .where(eq(userProfiles.userId, userId));
    decryptProfile(profile);

    // Recent vitals
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentVitals = await db.select().from(vitals)
      .where(and(eq(vitals.patientId, userId), gte(vitals.recordedAt, since7d)))
      .orderBy(desc(vitals.recordedAt))
      .limit(50);

    // Medications
    const meds = await db.select().from(medications)
      .where(and(eq(medications.patientId, userId), eq(medications.isActive, true)));

    // Get coordinator
    let coordinator = null;
    const [uc] = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, userId));
    if (uc) {
      const [coord] = await db.select().from(careCoordinators)
        .where(eq(careCoordinators.id, uc.coordinatorId));
      coordinator = coord;
    }

    // Engagement config
    let engConfig = null;
    if (profile?.ageBracket) {
      const [ec] = await db.select().from(engagementConfig)
        .where(eq(engagementConfig.ageBracket, profile.ageBracket));
      engConfig = ec;
    }

    // Preferences
    const [prefs] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, userId));

    res.json({
      user,
      profile,
      coordinator,
      engagementConfig: engConfig,
      preferences: prefs || null,
      recentVitals,
      medications: meds,
    });
  } catch (err) {
    console.error("Console patient detail error:", err);
    res.status(500).json({ error: "Failed to fetch patient detail" });
  }
});

// GET /api/console/patients/:id/timeline — touchpoint timeline
router.get("/patients/:id/timeline", async (req, res) => {
  try {
    const userId = req.params.id;
    const limit = parseInt(req.query.limit) || 50;

    // Messages
    const msgs = await db.select().from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    // Voice sessions
    const calls = await db.select().from(voiceSessions)
      .where(eq(voiceSessions.userId, userId))
      .orderBy(desc(voiceSessions.startedAt))
      .limit(20);

    // Escalations
    const escs = await db.select().from(escalations)
      .where(eq(escalations.userId, userId))
      .orderBy(desc(escalations.createdAt))
      .limit(20);

    // Build unified timeline
    const timeline = [
      ...msgs.map((m) => ({ type: "message", timestamp: m.createdAt, data: m })),
      ...calls.map((c) => ({ type: "voice_call", timestamp: c.startedAt, data: c })),
      ...escs.map((e) => ({ type: "escalation", timestamp: e.createdAt, data: e })),
    ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(timeline);
  } catch (err) {
    console.error("Console timeline error:", err);
    res.status(500).json({ error: "Failed to fetch timeline" });
  }
});

// GET /api/console/patients/:id/monologue — AI actions for patient
router.get("/patients/:id/monologue", async (req, res) => {
  try {
    const userId = req.params.id;
    const limit = parseInt(req.query.limit) || 50;
    const urgency = req.query.urgency;

    let conditions = [eq(aiActions.userId, userId)];
    if (urgency) {
      conditions.push(eq(aiActions.urgency, urgency));
    }

    const actions = await db.select().from(aiActions)
      .where(and(...conditions))
      .orderBy(desc(aiActions.createdAt))
      .limit(limit);

    res.json(actions);
  } catch (err) {
    console.error("Console monologue error:", err);
    res.status(500).json({ error: "Failed to fetch monologue" });
  }
});

// GET /api/console/monologue — global AI actions feed
router.get("/monologue", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const urgency = req.query.urgency;

    let conditions = [];
    if (urgency) {
      conditions.push(eq(aiActions.urgency, urgency));
    }

    const actions = await db.select().from(aiActions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(aiActions.createdAt))
      .limit(limit);

    res.json(actions);
  } catch (err) {
    console.error("Console global monologue error:", err);
    res.status(500).json({ error: "Failed to fetch monologue" });
  }
});

// GET /api/console/calls — voice call log
router.get("/calls", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const userId = req.query.userId;

    let query = db.select().from(voiceSessions);
    if (userId) {
      query = query.where(eq(voiceSessions.userId, userId));
    }
    const calls = await query.orderBy(desc(voiceSessions.startedAt)).limit(limit);

    res.json(calls);
  } catch (err) {
    console.error("Console calls error:", err);
    res.status(500).json({ error: "Failed to fetch calls" });
  }
});

// POST /api/console/override/message — send message as coordinator
router.post("/override/message", async (req, res) => {
  try {
    const { userId, content, messageType } = req.body;
    if (!userId || !content) {
      return res.status(400).json({ error: "userId and content required" });
    }

    // Log AI action
    const [action] = await db.insert(aiActions).values({
      userId,
      observation: "Manual override by admin",
      reasoning: "Admin sent a direct message to the patient",
      assessment: "Admin-initiated outreach",
      urgency: "low",
      action: "send_message",
      messageContent: content,
      source: "manual_override",
    }).returning();

    // Create message
    const [msg] = await db.insert(messages).values({
      userId,
      sender: "admin",
      messageType: messageType || "text",
      content,
      triggeredBy: action.id,
    }).returning();

    res.json({ action, message: msg });
  } catch (err) {
    console.error("Console override message error:", err);
    res.status(500).json({ error: "Failed to send override message" });
  }
});

// POST /api/console/override/escalate — escalate to provider
router.post("/override/escalate", async (req, res) => {
  try {
    const { userId, reason, escalationType } = req.body;
    if (!userId || !reason) {
      return res.status(400).json({ error: "userId and reason required" });
    }

    const [action] = await db.insert(aiActions).values({
      userId,
      observation: "Manual escalation by admin",
      reasoning: reason,
      assessment: "Admin-initiated escalation",
      urgency: "high",
      action: "escalate",
      escalationTarget: escalationType || "provider",
      source: "manual_override",
    }).returning();

    const [esc] = await db.insert(escalations).values({
      userId,
      aiActionId: action.id,
      escalationType: escalationType || "provider",
      reason,
    }).returning();

    res.json({ action, escalation: esc });
  } catch (err) {
    console.error("Console override escalate error:", err);
    res.status(500).json({ error: "Failed to escalate" });
  }
});

// GET /api/console/stats — dashboard stats
router.get("/stats", async (req, res) => {
  try {
    const [patientCount] = await db.select({ count: count() }).from(users)
      .where(eq(users.role, "patient"));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [todayActions] = await db.select({ count: count() }).from(aiActions)
      .where(gte(aiActions.createdAt, today));

    const [todayCalls] = await db.select({ count: count() }).from(voiceSessions)
      .where(gte(voiceSessions.startedAt, today));

    const [openEscalations] = await db.select({ count: count() }).from(escalations)
      .where(eq(escalations.status, "open"));

    res.json({
      activePatients: patientCount?.count || 0,
      todayAiActions: todayActions?.count || 0,
      todayCalls: todayCalls?.count || 0,
      openEscalations: openEscalations?.count || 0,
    });
  } catch (err) {
    console.error("Console stats error:", err);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/console/patients/:id/chart-data — vitals grouped by type for charts (30d)
router.get("/patients/:id/chart-data", async (req, res) => {
  try {
    const userId = req.params.id;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const allVitals = await db.select().from(vitals)
      .where(and(eq(vitals.patientId, userId), gte(vitals.recordedAt, since30d)))
      .orderBy(vitals.recordedAt);

    const grouped = {};
    for (const v of allVitals) {
      if (!grouped[v.vitalType]) grouped[v.vitalType] = [];
      grouped[v.vitalType].push({
        date: v.recordedAt.toISOString().split("T")[0],
        value: v.value,
        unit: v.unit,
      });
    }

    res.json(grouped);
  } catch (err) {
    console.error("Console chart-data error:", err);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// GET /api/console/patients/:id/adherence — medication adherence (30d)
router.get("/patients/:id/adherence", async (req, res) => {
  try {
    const userId = req.params.id;
    const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const logs = await db.select().from(medicationLogs)
      .where(and(eq(medicationLogs.patientId, userId), gte(medicationLogs.scheduledAt, since30d)));

    const totalScheduled = logs.length;
    const totalTaken = logs.filter(l => l.status === "taken" || l.status === "late").length;
    const totalMissed = logs.filter(l => l.status === "missed").length;

    // Group by date
    const daily = {};
    for (const l of logs) {
      const date = l.scheduledAt.toISOString().split("T")[0];
      if (!daily[date]) daily[date] = { date, taken: 0, missed: 0, total: 0 };
      daily[date].total++;
      if (l.status === "taken" || l.status === "late") daily[date].taken++;
      if (l.status === "missed") daily[date].missed++;
    }

    res.json({
      totalScheduled,
      totalTaken,
      totalMissed,
      rate: totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 100,
      daily: Object.values(daily).sort((a, b) => a.date.localeCompare(b.date)),
    });
  } catch (err) {
    console.error("Console adherence error:", err);
    res.status(500).json({ error: "Failed to fetch adherence" });
  }
});

// GET /api/console/patients/:id/encounters — encounter summaries
router.get("/patients/:id/encounters", async (req, res) => {
  try {
    const userId = req.params.id;
    const limit = parseInt(req.query.limit) || 30;

    const encounters = await db.select().from(aiActions)
      .where(and(
        eq(aiActions.userId, userId),
        inArray(aiActions.source, ["chat_summary", "cron"]),
      ))
      .orderBy(desc(aiActions.createdAt))
      .limit(limit);

    res.json(encounters);
  } catch (err) {
    console.error("Console encounters error:", err);
    res.status(500).json({ error: "Failed to fetch encounters" });
  }
});

// POST /api/console/push — send push notification to a patient
router.post("/push", async (req, res) => {
  try {
    const { userId, title, body, category } = req.body;
    if (!userId || !title || !body) {
      return res.status(400).json({ error: "userId, title, and body required" });
    }

    const result = await sendPush(userId, {
      title,
      body,
      data: { route: "messages", ...(category ? { category } : {}) },
    });

    // Log as AI action
    await db.insert(aiActions).values({
      userId,
      observation: "Admin sent push notification from console",
      reasoning: `Push: "${title}" — "${body}"`,
      assessment: "Admin-initiated push notification",
      urgency: "low",
      action: "send_message",
      messageContent: body,
      source: "manual_override",
    });

    res.json({ success: result.sent > 0, ...result });
  } catch (err) {
    console.error("Console push error:", err);
    res.status(500).json({ error: "Failed to send push" });
  }
});

// POST /api/console/call-request — request a call (sends push to open call screen)
router.post("/call-request", async (req, res) => {
  try {
    const { userId, reason } = req.body;
    if (!userId) {
      return res.status(400).json({ error: "userId required" });
    }

    // Get coordinator name for the push title
    let coordinatorName = "Care Coordinator";
    const [uc] = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, userId));
    if (uc) {
      const [coord] = await db.select().from(careCoordinators)
        .where(eq(careCoordinators.id, uc.coordinatorId));
      if (coord) coordinatorName = coord.name;
    }

    const result = await sendPush(userId, {
      title: coordinatorName,
      body: reason || "Your care coordinator would like to speak with you. Tap to start a call.",
      data: { route: "call", category: "call_request" },
    });

    // Log
    await db.insert(aiActions).values({
      userId,
      observation: "Admin requested call from console",
      reasoning: reason || "Admin wants to speak with patient",
      assessment: "Admin-initiated call request",
      urgency: "medium",
      action: "call",
      source: "manual_override",
    });

    res.json({ success: result.sent > 0, ...result });
  } catch (err) {
    console.error("Console call-request error:", err);
    res.status(500).json({ error: "Failed to send call request" });
  }
});

// GET /api/console/patients/:id/pipeline — pipeline log + first-call prep data
router.get("/patients/:id/pipeline", async (req, res) => {
  try {
    const userId = req.params.id;
    const [mem] = await db.select().from(patientMemory)
      .where(eq(patientMemory.userId, userId));

    if (!mem) {
      return res.json({ pipelineLog: [], firstCallPrep: null, compactedAt: null });
    }

    const tier2 = mem.tier2 || {};
    res.json({
      pipelineLog: tier2.pipeline_log || [],
      pipelineRuns: tier2.pipeline_runs || [],
      firstCallPrep: tier2.first_call_prep || null,
      compactedAt: mem.compactedAt,
      hasTier1: !!mem.tier1,
      hasTier2: !!mem.tier2,
      hasTier3: !!mem.tier3,
    });
  } catch (err) {
    console.error("Console pipeline error:", err);
    res.status(500).json({ error: "Failed to fetch pipeline data" });
  }
});

// POST /api/console/patients/:id/run-pipeline — trigger pipeline for a patient
router.post("/patients/:id/run-pipeline", async (req, res) => {
  try {
    const userId = req.params.id;
    const { runOnboardingPipeline } = require("../services/onboardingPipeline");
    // Run async — respond immediately
    runOnboardingPipeline(userId).catch(err => {
      console.error(`[CONSOLE] Pipeline failed for ${userId}:`, err);
    });
    res.json({ status: "pipeline_started", userId });
  } catch (err) {
    console.error("Console run-pipeline error:", err);
    res.status(500).json({ error: "Failed to start pipeline" });
  }
});

// ---------------------------------------------------------------------------
// Health Records — upload on behalf of patient + list
// ---------------------------------------------------------------------------

// GET /api/console/patients/:id/health-records — list uploaded records
router.get("/patients/:id/health-records", async (req, res) => {
  try {
    const userId = req.params.id;
    const records = await db.select({
      id: healthRecords.id,
      filename: healthRecords.filename,
      contentType: healthRecords.contentType,
      sizeBytes: healthRecords.sizeBytes,
      status: healthRecords.status,
      createdAt: healthRecords.createdAt,
    }).from(healthRecords)
      .where(eq(healthRecords.userId, userId))
      .orderBy(desc(healthRecords.createdAt));
    res.json(records);
  } catch (err) {
    console.error("Console health-records list error:", err);
    res.status(500).json({ error: "Failed to list records" });
  }
});

// POST /api/console/patients/:id/health-records/upload — upload on behalf of patient
router.post("/patients/:id/health-records/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.params.id;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    const [record] = await db.insert(healthRecords).values({
      userId,
      filename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      storageKey: file.filename,
      status: "pending",
    }).returning();

    // Process async
    processHealthRecord(record.id, userId).catch(err => {
      console.error(`[CONSOLE] Health record processing failed for ${record.id}:`, err);
    });

    res.json({ id: record.id, filename: record.filename, status: "processing" });
  } catch (err) {
    console.error("Console health-records upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

module.exports = router;
