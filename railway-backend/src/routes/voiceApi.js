const express = require("express");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { careCoordinators, userCoordinator } = require("../db/schema");

const router = express.Router();

// Map coordinator names to env var agent IDs
const AGENT_ID_MAP = {
  sarah: () => process.env.ELEVENLABS_AGENT_ID_SARAH,
  michael: () => process.env.ELEVENLABS_AGENT_ID_MICHAEL,
  hope: () => process.env.ELEVENLABS_AGENT_ID_HOPE,
  james: () => process.env.ELEVENLABS_AGENT_ID_JAMES,
};

// GET /api/voice/signed-url — get ElevenLabs conversation token (JWT for LiveKit)
router.get("/signed-url", async (req, res) => {
  try {
    const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

    if (!ELEVENLABS_API_KEY) {
      return res.status(503).json({ error: "Voice service unavailable (no API key)" });
    }

    // Look up the user's assigned coordinator to pick the right agent
    let agentId = process.env.ELEVENLABS_AGENT_ID; // fallback
    let coordinatorName = "Sarah";

    const [uc] = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, req.user.userId));

    if (uc) {
      const [coord] = await db.select().from(careCoordinators)
        .where(eq(careCoordinators.id, uc.coordinatorId));
      if (coord) {
        coordinatorName = coord.name;
        const lookup = AGENT_ID_MAP[coord.name.toLowerCase()];
        if (lookup) {
          agentId = lookup() || agentId;
        }
      }
    }

    if (!agentId) {
      return res.status(503).json({ error: "Voice service unavailable (no agent configured)" });
    }

    console.log(`[Voice] User ${req.user.userId} → coordinator ${coordinatorName} → agent ${agentId}`);

    // Get conversation token (JWT) from ElevenLabs — GET request with agent_id
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${agentId}`,
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
    // Return token + userId so iOS can pass user_id as override to the SDK
    res.json({ signedUrl: data.token, userId: req.user.userId });
  } catch (err) {
    console.error("Voice token error:", err);
    res.status(500).json({ error: "Voice service error" });
  }
});

module.exports = router;
