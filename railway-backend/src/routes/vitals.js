const express = require("express");
const { eq, desc, and, gte } = require("drizzle-orm");
const { db } = require("../db");
const { vitals } = require("../db/schema");

const router = express.Router();

// POST /api/vitals — patient logs vital readings
router.post("/", async (req, res) => {
  try {
    const { readings } = req.body;
    if (!readings || !Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: "readings array required" });
    }

    const rows = readings.map((r) => ({
      patientId: req.user.userId,
      vitalType: r.vitalType,
      value: r.value,
      unit: r.unit,
      source: r.source || "manual",
      recordedAt: r.recordedAt ? new Date(r.recordedAt) : new Date(),
    }));

    const inserted = await db.insert(vitals).values(rows).returning();
    res.status(201).json(inserted);
  } catch (err) {
    console.error("Vitals log error:", err);
    res.status(500).json({ error: "Failed to log vitals" });
  }
});

// GET /api/vitals?range=7&type=weight
router.get("/", async (req, res) => {
  try {
    const range = parseInt(req.query.range) || 7;
    const type = req.query.type;
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

    let conditions = [
      eq(vitals.patientId, req.user.userId),
      gte(vitals.recordedAt, since),
    ];

    if (type) {
      conditions.push(eq(vitals.vitalType, type));
    }

    const rows = await db.select().from(vitals)
      .where(and(...conditions))
      .orderBy(desc(vitals.recordedAt));

    res.json(rows);
  } catch (err) {
    console.error("Vitals fetch error:", err);
    res.status(500).json({ error: "Failed to fetch vitals" });
  }
});

// POST /api/vitals/log — single vital log (iOS client)
router.post("/log", async (req, res) => {
  try {
    const { vitalType, value, unit, source } = req.body;
    if (!vitalType || value === undefined || !unit) {
      return res.status(400).json({ error: "vitalType, value, and unit required" });
    }

    const [inserted] = await db.insert(vitals).values({
      patientId: req.user.userId,
      vitalType,
      value,
      unit,
      source: source || "manual",
      recordedAt: new Date(),
    }).returning();

    res.status(201).json(inserted);
  } catch (err) {
    console.error("Vital log error:", err);
    res.status(500).json({ error: "Failed to log vital" });
  }
});

// GET /api/vitals/latest — returns array of latest readings
router.get("/latest", async (req, res) => {
  try {
    const vitalTypes = [
      "weight", "blood_pressure_systolic", "blood_pressure_diastolic",
      "heart_rate", "blood_glucose", "oxygen_saturation", "temperature",
      "hydration", "steps",
    ];

    const results = [];
    for (const type of vitalTypes) {
      const [row] = await db.select().from(vitals)
        .where(and(
          eq(vitals.patientId, req.user.userId),
          eq(vitals.vitalType, type),
        ))
        .orderBy(desc(vitals.recordedAt))
        .limit(1);
      if (row) results.push(row);
    }

    res.json(results);
  } catch (err) {
    console.error("Latest vitals error:", err);
    res.status(500).json({ error: "Failed to fetch latest vitals" });
  }
});

module.exports = router;
