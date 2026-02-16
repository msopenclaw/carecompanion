const express = require("express");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { userPreferences } = require("../db/schema");
const { syncScheduledActions } = require("../services/preferenceScheduler");

const router = express.Router();

// GET /api/preferences
router.get("/", async (req, res) => {
  try {
    const [prefs] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, req.user.userId));
    res.json(prefs || null);
  } catch (err) {
    console.error("Preferences fetch error:", err);
    res.status(500).json({ error: "Failed to fetch preferences" });
  }
});

// POST /api/preferences — create or update
router.post("/", async (req, res) => {
  try {
    const data = req.body;
    const [existing] = await db.select().from(userPreferences)
      .where(eq(userPreferences.userId, req.user.userId));

    let result;
    if (existing) {
      [result] = await db.update(userPreferences)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(userPreferences.userId, req.user.userId))
        .returning();
    } else {
      [result] = await db.insert(userPreferences).values({
        userId: req.user.userId,
        ...data,
      }).returning();
    }

    // Sync scheduled actions based on new preferences
    try {
      await syncScheduledActions(req.user.userId, result);
    } catch (syncErr) {
      console.error("Scheduled actions sync error:", syncErr);
      // Don't fail the preference save if sync fails
    }

    res.json(result);
  } catch (err) {
    console.error("Preferences save error:", err);
    res.status(500).json({ error: "Failed to save preferences" });
  }
});

module.exports = router;
