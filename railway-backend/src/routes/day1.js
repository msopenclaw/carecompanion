const express = require("express");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { messages, userProfiles, userCoordinator, careCoordinators } = require("../db/schema");

const router = express.Router();

// POST /api/day1/trigger — send Day 1 intro messages from coordinator
router.post("/trigger", async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user profile and coordinator
    const [profile] = await db.select().from(userProfiles)
      .where(eq(userProfiles.userId, userId));

    const [uc] = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, userId));

    let coordinatorName = "your coordinator";
    if (uc) {
      const [coord] = await db.select().from(careCoordinators)
        .where(eq(careCoordinators.id, uc.coordinatorId));
      if (coord) coordinatorName = coord.name;
    }

    const firstName = profile?.firstName || "there";

    // Send intro messages
    const introMessages = [
      {
        userId,
        sender: "ai",
        messageType: "check_in",
        content: `Hey ${firstName}! It's ${coordinatorName} — I just went through everything you shared during setup and I already have some thoughts.`,
      },
      {
        userId,
        sender: "ai",
        messageType: "call_request",
        content: `Can I give you a quick call? 2 minutes, I promise. I want to introduce myself properly and make sure I take care of you the right way.`,
      },
    ];

    const inserted = [];
    for (const msg of introMessages) {
      const [row] = await db.insert(messages).values(msg).returning();
      inserted.push(row);
    }

    res.json({ messages: inserted, coordinatorName });
  } catch (err) {
    console.error("Day1 trigger error:", err);
    res.status(500).json({ error: "Failed to trigger Day 1 messages" });
  }
});

module.exports = router;
