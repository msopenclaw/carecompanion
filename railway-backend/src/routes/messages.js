const express = require("express");
const { eq, desc, and, lt } = require("drizzle-orm");
const { db } = require("../db");
const { messages } = require("../db/schema");

const router = express.Router();

// GET /api/messages?limit=50&before=<timestamp>
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const before = req.query.before ? new Date(req.query.before) : null;

    let query = db.select().from(messages)
      .where(
        before
          ? and(eq(messages.userId, req.user.userId), lt(messages.createdAt, before))
          : eq(messages.userId, req.user.userId),
      )
      .orderBy(desc(messages.createdAt))
      .limit(limit);

    const rows = await query;
    res.json(rows);
  } catch (err) {
    console.error("Messages fetch error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// POST /api/messages — patient sends message
router.post("/", async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ error: "content required" });
    }

    const [msg] = await db.insert(messages).values({
      userId: req.user.userId,
      sender: "patient",
      messageType: "text",
      content,
      isRead: true,
    }).returning();

    res.status(201).json(msg);
  } catch (err) {
    console.error("Message send error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// PUT /api/messages/:id/read
router.put("/:id/read", async (req, res) => {
  try {
    const [updated] = await db.update(messages)
      .set({ isRead: true })
      .where(and(eq(messages.id, req.params.id), eq(messages.userId, req.user.userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error("Message read error:", err);
    res.status(500).json({ error: "Failed to mark message as read" });
  }
});

module.exports = router;
