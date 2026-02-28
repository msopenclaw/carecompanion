const express = require("express");
const { eq, and, gte, desc, sql } = require("drizzle-orm");
const { db } = require("../db");
const { medications, medicationLogs, userProfiles } = require("../db/schema");

const router = express.Router();

// GET /api/medications
router.get("/", async (req, res) => {
  try {
    const meds = await db.select().from(medications)
      .where(and(
        eq(medications.patientId, req.user.userId),
        eq(medications.isActive, true),
      ));

    // Get user's timezone for correct "today" boundary
    const [profile] = await db.select({ tz: userProfiles.timezone })
      .from(userProfiles).where(eq(userProfiles.userId, req.user.userId));
    const tz = profile?.tz || "America/New_York";
    // Get today's date string in user's timezone, then compute midnight UTC equivalent
    const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: tz }); // "2026-02-20"
    const midnightUTC = new Date(dateStr + "T12:00:00Z"); // noon UTC as safe reference
    const utcRef = new Date(midnightUTC.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzRef = new Date(midnightUTC.toLocaleString("en-US", { timeZone: tz }));
    const offsetMs = utcRef.getTime() - tzRef.getTime();
    const todayStart = new Date(new Date(dateStr + "T00:00:00Z").getTime() + offsetMs);

    const logs = await db.select().from(medicationLogs)
      .where(and(
        eq(medicationLogs.patientId, req.user.userId),
        gte(medicationLogs.scheduledAt, todayStart),
      ));

    const medsWithLogs = meds.map((med) => ({
      id: med.id,
      name: med.name,
      dosage: med.dosage,
      frequency: med.frequency,
      isGlp1: med.isGlp1 || false,
      takenToday: logs.some(l => l.medicationId === med.id && (l.status === "taken" || l.status === "late")),
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
    const { medicationId } = req.body;
    if (!medicationId) {
      return res.status(400).json({ error: "medicationId required" });
    }

    const [log] = await db.insert(medicationLogs).values({
      medicationId,
      patientId: req.user.userId,
      scheduledAt: new Date(),
      takenAt: new Date(),
      status: "taken",
    }).returning();

    res.status(201).json(log);
  } catch (err) {
    console.error("Med confirm error:", err);
    res.status(500).json({ error: "Failed to confirm medication" });
  }
});

// POST /api/medications/unconfirm — undo today's confirmation
router.post("/unconfirm", async (req, res) => {
  try {
    const { medicationId } = req.body;
    if (!medicationId) {
      return res.status(400).json({ error: "medicationId required" });
    }

    // Find today's boundary in user's timezone
    const [profile] = await db.select({ tz: userProfiles.timezone })
      .from(userProfiles).where(eq(userProfiles.userId, req.user.userId));
    const tz = profile?.tz || "America/New_York";
    const dateStr = new Date().toLocaleDateString("en-CA", { timeZone: tz });
    const midnightUTC = new Date(dateStr + "T12:00:00Z");
    const utcRef = new Date(midnightUTC.toLocaleString("en-US", { timeZone: "UTC" }));
    const tzRef = new Date(midnightUTC.toLocaleString("en-US", { timeZone: tz }));
    const offsetMs = utcRef.getTime() - tzRef.getTime();
    const todayStart = new Date(new Date(dateStr + "T00:00:00Z").getTime() + offsetMs);

    // Delete today's "taken" log for this medication
    const deleted = await db.delete(medicationLogs)
      .where(and(
        eq(medicationLogs.medicationId, medicationId),
        eq(medicationLogs.patientId, req.user.userId),
        gte(medicationLogs.scheduledAt, todayStart),
        eq(medicationLogs.status, "taken"),
      ))
      .returning();

    res.json({ success: true, removed: deleted.length });
  } catch (err) {
    console.error("Med unconfirm error:", err);
    res.status(500).json({ error: "Failed to unconfirm medication" });
  }
});

// POST /api/medications — add a new medication
router.post("/", async (req, res) => {
  try {
    const { name, dosage, frequency, isGlp1 } = req.body;
    if (!name || !dosage) {
      return res.status(400).json({ error: "name and dosage required" });
    }

    const [inserted] = await db.insert(medications).values({
      patientId: req.user.userId,
      name,
      dosage,
      frequency: frequency || "daily",
      isGlp1: isGlp1 || false,
      scheduledTimes: [],
      startDate: new Date().toISOString().split("T")[0],
    }).returning();

    res.status(201).json({
      id: inserted.id,
      name: inserted.name,
      dosage: inserted.dosage,
      frequency: inserted.frequency,
      isGlp1: inserted.isGlp1,
      takenToday: false,
    });
  } catch (err) {
    console.error("Add medication error:", err);
    res.status(500).json({ error: "Failed to add medication" });
  }
});

// GET /api/medications/history?days=30 — medication logs for past N days
router.get("/history", async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const logs = await db.select().from(medicationLogs)
      .where(and(
        eq(medicationLogs.patientId, req.user.userId),
        gte(medicationLogs.scheduledAt, since),
      ))
      .orderBy(desc(medicationLogs.scheduledAt));

    res.json(logs);
  } catch (err) {
    console.error("Med history error:", err);
    res.status(500).json({ error: "Failed to fetch medication history" });
  }
});

module.exports = router;
