const express = require("express");
const { eq, and } = require("drizzle-orm");
const { db } = require("../db");
const { pushTokens } = require("../db/schema");

const router = express.Router();

// POST /api/push/register — register APNs device token
router.post("/register", async (req, res) => {
  try {
    const { deviceToken, platform } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ error: "deviceToken required" });
    }

    // Upsert: deactivate old tokens for this user/device combo, then insert
    const existing = await db.select().from(pushTokens)
      .where(and(
        eq(pushTokens.userId, req.user.userId),
        eq(pushTokens.deviceToken, deviceToken),
      ));

    if (existing.length > 0) {
      await db.update(pushTokens)
        .set({ isActive: true, updatedAt: new Date() })
        .where(and(
          eq(pushTokens.userId, req.user.userId),
          eq(pushTokens.deviceToken, deviceToken),
        ));
    } else {
      await db.insert(pushTokens).values({
        userId: req.user.userId,
        deviceToken,
        platform: platform || "ios",
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Push register error:", err);
    res.status(500).json({ error: "Failed to register push token" });
  }
});

// POST /api/push/unregister — deactivate token
router.post("/unregister", async (req, res) => {
  try {
    const { deviceToken } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ error: "deviceToken required" });
    }

    await db.update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(pushTokens.userId, req.user.userId),
        eq(pushTokens.deviceToken, deviceToken),
      ));

    res.json({ success: true });
  } catch (err) {
    console.error("Push unregister error:", err);
    res.status(500).json({ error: "Failed to unregister push token" });
  }
});

module.exports = router;
