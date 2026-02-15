const express = require("express");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { careCoordinators, userCoordinator } = require("../db/schema");

const router = express.Router();

// POST /api/tts — text-to-speech with per-persona voice
router.post("/", async (req, res) => {
  try {
    const { text, voiceId } = req.body;
    if (!text) {
      return res.status(400).json({ error: "text required" });
    }

    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    if (!ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: "TTS service unavailable" });
    }

    // Get user's coordinator voice, or use provided voiceId
    let voice = voiceId || "21m00Tcm4TlvDq8ikWAM"; // default Rachel
    let voiceSettings = { stability: 0.65, similarity_boost: 0.80, style: 0.15 };

    if (!voiceId && req.user) {
      const [uc] = await db.select().from(userCoordinator)
        .where(eq(userCoordinator.userId, req.user.userId));
      if (uc) {
        const [coord] = await db.select().from(careCoordinators)
          .where(eq(careCoordinators.id, uc.coordinatorId));
        if (coord) {
          voice = coord.elevenlabsVoiceId;
          voiceSettings = coord.voiceSettings;
        }
      }
    }

    const ttsResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: voiceSettings,
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
    console.error("TTS error:", err);
    res.status(500).json({ error: "TTS failed" });
  }
});

module.exports = router;
