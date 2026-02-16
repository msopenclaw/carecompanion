const express = require("express");
const { eq, and, gte } = require("drizzle-orm");
const { db } = require("../db");
const { scheduledActions, vitals, userPreferences, userProfiles, medications, medicationLogs } = require("../db/schema");

const router = express.Router();

// Middleware: validate agent secret
function validateAgentSecret(req, res, next) {
  const secret = req.headers["x-agent-secret"];
  if (!secret || secret !== process.env.AGENT_TOOLS_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

router.use(validateAgentSecret);

// POST /api/agent-tools/schedule-call
router.post("/schedule-call", async (req, res) => {
  try {
    const { user_id, time, recurrence } = req.body;
    if (!user_id || !time) {
      return res.status(400).json({ error: "user_id and time required" });
    }

    const [row] = await db.insert(scheduledActions).values({
      userId: user_id,
      actionType: "daily_call",
      label: "Daily check-in call",
      scheduledTime: time,
      recurrence: recurrence || "daily",
      createdVia: "voice",
    }).returning();

    console.log(`[AgentTools] Scheduled call for ${user_id} at ${time} (${recurrence || "daily"})`);
    res.json({ success: true, message: `Daily call scheduled at ${time}`, id: row.id });
  } catch (err) {
    console.error("Schedule call error:", err);
    res.status(500).json({ error: "Failed to schedule call" });
  }
});

// POST /api/agent-tools/set-reminder
router.post("/set-reminder", async (req, res) => {
  try {
    const { user_id, reminder_type, time, label } = req.body;
    if (!user_id || !reminder_type || !time) {
      return res.status(400).json({ error: "user_id, reminder_type, and time required" });
    }

    const actionTypeMap = {
      medication: "med_reminder",
      hydration: "hydration_reminder",
      checkin: "checkin_reminder",
      custom: "custom_reminder",
    };

    const [row] = await db.insert(scheduledActions).values({
      userId: user_id,
      actionType: actionTypeMap[reminder_type] || "custom_reminder",
      label: label || `${reminder_type} reminder`,
      scheduledTime: time,
      recurrence: "daily",
      createdVia: "voice",
    }).returning();

    console.log(`[AgentTools] Set ${reminder_type} reminder for ${user_id} at ${time}`);
    res.json({ success: true, message: `${reminder_type} reminder set for ${time} daily`, id: row.id });
  } catch (err) {
    console.error("Set reminder error:", err);
    res.status(500).json({ error: "Failed to set reminder" });
  }
});

// POST /api/agent-tools/log-vital
router.post("/log-vital", async (req, res) => {
  try {
    const { user_id, vital_type, value, unit } = req.body;
    if (!user_id || !vital_type || value === undefined || !unit) {
      return res.status(400).json({ error: "user_id, vital_type, value, and unit required" });
    }

    const [inserted] = await db.insert(vitals).values({
      patientId: user_id,
      vitalType: vital_type,
      value: parseFloat(value),
      unit,
      source: "voice",
      recordedAt: new Date(),
    }).returning();

    console.log(`[AgentTools] Logged ${vital_type}: ${value} ${unit} for ${user_id}`);
    res.json({ success: true, message: `${vital_type} logged: ${value} ${unit}`, id: inserted.id });
  } catch (err) {
    console.error("Log vital error:", err);
    res.status(500).json({ error: "Failed to log vital" });
  }
});

// POST /api/agent-tools/update-preference
router.post("/update-preference", async (req, res) => {
  try {
    const { user_id, preference, value } = req.body;
    if (!user_id || !preference || value === undefined) {
      return res.status(400).json({ error: "user_id, preference, and value required" });
    }

    const allowedPrefs = [
      "checkinFrequency", "checkinTimePreference", "medReminderEnabled",
      "hydrationNudgesEnabled", "hydrationNudgesPerDay", "voiceCallFrequency",
      "quietStart", "quietEnd", "preferredChannel", "exerciseNudgesEnabled",
    ];

    if (!allowedPrefs.includes(preference)) {
      return res.status(400).json({ error: `Unknown preference: ${preference}` });
    }

    const [existing] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, user_id));

    if (existing) {
      await db.update(userPreferences)
        .set({ [preference]: value, updatedAt: new Date() })
        .where(eq(userPreferences.userId, user_id));
    } else {
      await db.insert(userPreferences).values({
        userId: user_id,
        [preference]: value,
      });
    }

    console.log(`[AgentTools] Updated preference ${preference}=${value} for ${user_id}`);
    res.json({ success: true, message: `Preference updated: ${preference}` });
  } catch (err) {
    console.error("Update preference error:", err);
    res.status(500).json({ error: "Failed to update preference" });
  }
});

// POST /api/agent-tools/confirm-medication
router.post("/confirm-medication", async (req, res) => {
  try {
    const { user_id, medication_name } = req.body;
    if (!user_id) return res.status(400).json({ error: "user_id required" });

    const meds = await db.select().from(medications)
      .where(and(eq(medications.patientId, user_id), eq(medications.isActive, true)));

    let med = meds[0];
    if (medication_name) {
      const match = meds.find(m => m.name.toLowerCase().includes(medication_name.toLowerCase()));
      if (match) med = match;
    }

    if (!med) return res.status(404).json({ error: "No active medications found" });

    const [log] = await db.insert(medicationLogs).values({
      medicationId: med.id,
      patientId: user_id,
      scheduledAt: new Date(),
      takenAt: new Date(),
      status: "taken",
    }).returning();

    console.log(`[AgentTools] Confirmed ${med.name} for ${user_id}`);
    res.json({ success: true, message: `${med.name} confirmed as taken`, id: log.id });
  } catch (err) {
    console.error("Confirm medication error:", err);
    res.status(500).json({ error: "Failed to confirm medication" });
  }
});

// POST /api/agent-tools/manage-goal
router.post("/manage-goal", async (req, res) => {
  try {
    const { user_id, action, goal } = req.body;
    if (!user_id || !action || !goal) {
      return res.status(400).json({ error: "user_id, action, and goal required" });
    }

    const [profile] = await db.select().from(userProfiles)
      .where(eq(userProfiles.userId, user_id));

    if (!profile) return res.status(404).json({ error: "Profile not found" });

    let goals = profile.goals || [];
    if (action === "add" && !goals.includes(goal)) {
      goals.push(goal);
    } else if (action === "remove") {
      goals = goals.filter(g => g !== goal);
    }

    await db.update(userProfiles)
      .set({ goals, updatedAt: new Date() })
      .where(eq(userProfiles.userId, user_id));

    console.log(`[AgentTools] ${action} goal "${goal}" for ${user_id}`);
    res.json({ success: true, message: `Goal ${action === "add" ? "added" : "removed"}: ${goal}`, goals });
  } catch (err) {
    console.error("Manage goal error:", err);
    res.status(500).json({ error: "Failed to manage goal" });
  }
});

module.exports = router;
