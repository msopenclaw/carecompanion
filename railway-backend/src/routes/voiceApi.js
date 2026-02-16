const express = require("express");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { careCoordinators, userCoordinator } = require("../db/schema");

const router = express.Router();

// GET /api/voice/signed-url — get ElevenLabs conversation token (JWT for LiveKit)
router.get("/signed-url", async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
    const ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

    if (!ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: "Voice service unavailable (no API key)" });
    }
    if (!ELEVENLABS_AGENT_ID) {
      return res.status(503).json({ error: "Voice service unavailable (no agent configured)" });
    }

    // Get conversation token (JWT) from ElevenLabs — required by the Swift SDK
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${ELEVENLABS_AGENT_ID}`,
      {
        headers: { "xi-api-key": ELEVENLABS_API_KEY },
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs token error:", response.status, errorText);
      return res.status(502).json({ error: "Failed to get voice connection" });
    }

    const data = await response.json();
    // SDK expects this as "signedUrl" but it's actually a JWT token
    res.json({ signedUrl: data.token });
  } catch (err) {
    console.error("Voice token error:", err);
    res.status(500).json({ error: "Voice service error" });
  }
});

module.exports = router;
