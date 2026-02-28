const express = require("express");
const { eq, desc } = require("drizzle-orm");
const { db } = require("../db");
const { careCoordinators, userCoordinator, userProfiles, medications, userPreferences, vitals } = require("../db/schema");
const { decrypt, decryptJson } = require("../services/encryption");

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

    // Build patient context for the voice agent
    let patientContext = "";
    try {
      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, req.user.userId));
      const meds = await db.select().from(medications)
        .where(eq(medications.patientId, req.user.userId));
      const [prefs] = await db.select().from(userPreferences)
        .where(eq(userPreferences.userId, req.user.userId));
      const recentVitals = await db.select().from(vitals)
        .where(eq(vitals.patientId, req.user.userId))
        .orderBy(desc(vitals.recordedAt))
        .limit(10);

      // Decrypt encrypted PII fields
      if (profile) {
        profile.firstName = decrypt(profile.firstName);
        profile.lastName = decrypt(profile.lastName);
        if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
        if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
      }

      const parts = [];
      if (profile) {
        parts.push(`Patient: ${profile.firstName || ""} ${profile.lastName || ""}`.trim());
        if (profile.glp1Medication) parts.push(`GLP-1: ${profile.glp1Medication} ${profile.glp1Dosage || ""}`);
        if (profile.injectionDay) parts.push(`Injection day: ${profile.injectionDay}`);
        if (profile.conditions?.length) parts.push(`Conditions: ${profile.conditions.join(", ")}`);
        if (profile.currentSideEffects?.length) parts.push(`Side effects: ${profile.currentSideEffects.join(", ")}`);
        if (profile.goals?.length) parts.push(`Goals: ${profile.goals.join(", ")}`);
      }
      if (meds.length) {
        const medList = meds.filter(m => m.isActive).map(m => `${m.name} ${m.dosage} (${m.frequency})`);
        if (medList.length) parts.push(`Medications: ${medList.join(", ")}`);
      }
      if (prefs) {
        parts.push(`Check-in: ${prefs.checkinFrequency}, ${prefs.checkinTimePreference}`);
        if (prefs.preferredChannel) parts.push(`Preferred channel: ${prefs.preferredChannel}`);
      }
      if (recentVitals.length) {
        const vitalSummary = recentVitals.map(v => `${v.vitalType}: ${v.value}${v.unit}`).join(", ");
        parts.push(`Recent vitals: ${vitalSummary}`);
      }
      patientContext = parts.join(". ") + ".";
    } catch (ctxErr) {
      console.error("[Voice] Failed to build patient context:", ctxErr.message);
    }

    res.json({ signedUrl: data.token, userId: req.user.userId, patientContext });
  } catch (err) {
    console.error("Voice token error:", err);
    res.status(500).json({ error: "Voice service error" });
  }
});

// POST /api/voice/outbound-call — Initiate an outbound call to the patient
router.post("/outbound-call", async (req, res) => {
  try {
    const { initiateOutboundCall } = require("../services/outboundCall");
    const userId = req.user.userId;
    const result = await initiateOutboundCall(userId);

    // Auto-trigger engagement pipeline if it hasn't been run yet
    try {
      const { runOnboardingPipeline } = require("../services/onboardingPipeline");
      const { patientMemory } = require("../db/schema");
      const { eq } = require("drizzle-orm");
      const { db } = require("../db");
      const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
      const pipelineLog = mem?.tier2?.pipeline_log;
      const hasRun = pipelineLog && pipelineLog.length > 0;
      if (!hasRun) {
        console.log(`[VOICE_API] Auto-triggering pipeline for ${userId}`);
        runOnboardingPipeline(userId, { skipOutboundCall: true }).catch(err => {
          console.error(`[VOICE_API] Pipeline auto-trigger failed:`, err.message);
        });
      }
    } catch (pipeErr) {
      console.error(`[VOICE_API] Pipeline check failed:`, pipeErr.message);
    }

    res.json(result);
  } catch (err) {
    console.error("Outbound call error:", err);
    res.status(500).json({ error: "Outbound call failed" });
  }
});

module.exports = router;
