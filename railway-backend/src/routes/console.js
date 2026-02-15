const express = require("express");
const { eq, desc, and, gte, sql, count } = require("drizzle-orm");
const { db } = require("../db");
const {
  users, userProfiles, messages, aiActions, voiceSessions,
  escalations, vitals, medications, medicationLogs, engagementConfig,
  userCoordinator, careCoordinators,
} = require("../db/schema");

const router = express.Router();

// GET /api/console/patients — list all patients with status summaries
router.get("/patients", async (req, res) => {
  try {
    const allUsers = await db.select().from(users)
      .where(eq(users.role, "patient"));

    const patientList = [];
    for (const user of allUsers) {
      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, user.id));

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

      patientList.push({
        id: user.id,
        email: user.email,
        isActive: user.isActive,
        profile,
        coordinator,
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

    res.json({
      user,
      profile,
      coordinator,
      engagementConfig: engConfig,
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

    const calls = await db.select().from(voiceSessions)
      .orderBy(desc(voiceSessions.startedAt))
      .limit(limit);

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

module.exports = router;
