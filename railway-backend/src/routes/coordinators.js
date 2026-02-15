const express = require("express");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { careCoordinators, userCoordinator } = require("../db/schema");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

// GET /api/coordinators — list all active personas (public, no auth needed)
router.get("/", async (req, res) => {
  try {
    const coordinators = await db.select().from(careCoordinators)
      .where(eq(careCoordinators.isActive, true));
    res.json(coordinators);
  } catch (err) {
    console.error("Coordinators fetch error:", err);
    res.status(500).json({ error: "Failed to fetch coordinators" });
  }
});

// GET /api/coordinators/:id/sample — get voice sample audio
router.get("/:id/sample", async (req, res) => {
  try {
    const [coordinator] = await db.select().from(careCoordinators)
      .where(eq(careCoordinators.id, req.params.id));

    if (!coordinator) {
      return res.status(404).json({ error: "Coordinator not found" });
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: "TTS service unavailable" });
    }

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${coordinator.elevenlabsVoiceId}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: coordinator.sampleGreeting,
          model_id: "eleven_multilingual_v2",
          voice_settings: coordinator.voiceSettings,
        }),
      },
    );

    if (!ttsResponse.ok) {
      return res.status(502).json({ error: "TTS generation failed" });
    }

    res.setHeader("Content-Type", "audio/mpeg");
    const buffer = await ttsResponse.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Coordinator sample error:", err);
    res.status(500).json({ error: "Failed to generate voice sample" });
  }
});

// POST /api/coordinators/select — assign coordinator to user (auth required)
router.post("/select", authMiddleware, async (req, res) => {
  try {
    const { coordinatorId } = req.body;
    if (!coordinatorId) {
      return res.status(400).json({ error: "coordinatorId required" });
    }

    // Verify coordinator exists
    const [coordinator] = await db.select().from(careCoordinators)
      .where(eq(careCoordinators.id, coordinatorId));
    if (!coordinator) {
      return res.status(404).json({ error: "Coordinator not found" });
    }

    // Upsert
    const existing = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, req.user.userId));

    if (existing.length > 0) {
      await db.update(userCoordinator)
        .set({ coordinatorId, selectedAt: new Date() })
        .where(eq(userCoordinator.userId, req.user.userId));
    } else {
      await db.insert(userCoordinator).values({
        userId: req.user.userId,
        coordinatorId,
      });
    }

    res.json({ success: true, coordinator });
  } catch (err) {
    console.error("Coordinator select error:", err);
    res.status(500).json({ error: "Failed to select coordinator" });
  }
});

module.exports = router;
