const express = require("express");
const { eq, and, gte } = require("drizzle-orm");
const { db } = require("../db");
const { medications, medicationLogs } = require("../db/schema");

const router = express.Router();

// GET /api/medications
router.get("/", async (req, res) => {
  try {
    const meds = await db.select().from(medications)
      .where(and(
        eq(medications.patientId, req.user.userId),
        eq(medications.isActive, true),
      ));

    // Get today's logs
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const logs = await db.select().from(medicationLogs)
      .where(and(
        eq(medicationLogs.patientId, req.user.userId),
        gte(medicationLogs.scheduledAt, todayStart),
      ));

    const medsWithLogs = meds.map((med) => ({
      ...med,
      todayLogs: logs.filter((l) => l.medicationId === med.id),
    }));

    res.json(medsWithLogs);
  } catch (err) {
    console.error("Medications fetch error:", err);
    res.status(500).json({ error: "Failed to fetch medications" });
  }
});

// POST /api/medications/confirm
router.post("/confirm", async (req, res) => {
  try {
    const { medicationId, scheduledAt } = req.body;
    if (!medicationId || !scheduledAt) {
      return res.status(400).json({ error: "medicationId and scheduledAt required" });
    }

    const [log] = await db.insert(medicationLogs).values({
      medicationId,
      patientId: req.user.userId,
      scheduledAt: new Date(scheduledAt),
      takenAt: new Date(),
      status: "taken",
    }).returning();

    res.status(201).json(log);
  } catch (err) {
    console.error("Med confirm error:", err);
    res.status(500).json({ error: "Failed to confirm medication" });
  }
});

module.exports = router;
