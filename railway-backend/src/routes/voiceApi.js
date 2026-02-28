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

// GET /api/voice/signed-url — get ElevenLabs conversation token + dynamic variables
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

    // Build dynamic variables for the ElevenLabs agent prompt template
    // These populate {{variable_name}} placeholders in the agent's system prompt
    let dynamicVariables = {};
    try {
      const { getCompactedContext } = require("../services/ehrCompaction");
      const { patientMemory: patientMemoryTable } = require("../db/schema");

      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, req.user.userId));
      const firstName = profile ? decrypt(profile.firstName) : "there";

      // Get compacted 3-tier memory
      const compacted = await getCompactedContext(req.user.userId) || "";

      // Get first-call prep from patient memory
      const [mem] = await db.select().from(patientMemoryTable)
        .where(eq(patientMemoryTable.userId, req.user.userId));
      const prep = mem?.tier2?.first_call_prep || null;

      const fallbackOpening = `Hey ${firstName}, this is ${coordinatorName} from your care team. How are you doing today?`;

      // Format conversation flow as a readable script
      let conversationGuide = "";
      if (prep?.conversation_flow?.length) {
        conversationGuide = prep.conversation_flow.map((phase, i) => {
          let s = `Phase ${i + 1}: ${phase.phase || phase.name || ""}`;
          if (phase.purpose) s += `\nPurpose: ${phase.purpose}`;
          if (phase.script) s += `\nScript: ${phase.script}`;
          if (phase.patient_signals_to_listen_for) s += `\nListen for: ${phase.patient_signals_to_listen_for}`;
          if (phase.pivot_if) s += `\nPivot if: ${phase.pivot_if}`;
          return s;
        }).join("\n\n");
      }

      // Format hook candidates
      let hookOptions = "";
      if (prep?.hook_candidates?.length) {
        hookOptions = prep.hook_candidates
          .filter(h => h.type !== "negative")
          .map(h => `- ${h.hook} (strength: ${h.strength || "medium"}, use when: ${h.when_to_use || "anytime"})`)
          .join("\n");
      }

      // Format anticipated responses
      let anticipatedResponses = "";
      if (prep?.anticipated_responses?.length) {
        anticipatedResponses = prep.anticipated_responses.map(r =>
          `If patient says: "${r.patient_says || r.response || r}" → Respond: ${r.agent_responds || r.suggestion || ""}`
        ).join("\n");
      }

      // Build patient context (compacted memory + basic profile fallback)
      let patientContext = compacted;
      if (!compacted && profile) {
        const parts = [];
        parts.push(`Patient: ${firstName}.`);
        if (profile.glp1Medication) parts.push(`Medication: ${profile.glp1Medication} ${profile.glp1Dosage || ""}`);
        if (profile.conditions) {
          const conditions = decryptJson(profile.conditions);
          if (conditions?.length) parts.push(`Conditions: ${conditions.join(", ")}`);
        }
        if (profile.goals?.length) parts.push(`Goals: ${profile.goals.join(", ")}`);
        const meds = await db.select().from(medications)
          .where(eq(medications.patientId, req.user.userId));
        if (meds.length) {
          parts.push(`Medications: ${meds.filter(m => m.isActive).map(m => `${m.name} ${m.dosage}`).join(", ")}`);
        }
        patientContext = parts.join("\n");
      }

      dynamicVariables = {
        patient_name: firstName,
        coordinator_name: coordinatorName,
        opening_script: prep?.opening_script || fallbackOpening,
        hook_anchor: prep?.hook_anchor || "medication management",
        talking_points: prep?.talking_points?.join("; ") || "",
        follow_up_question: prep?.follow_up_question || "",
        conversation_guide: conversationGuide,
        hook_options: hookOptions,
        anticipated_responses: anticipatedResponses,
        notes_for_this_call: prep?.notes_for_next_call || "",
        patient_context: patientContext,
        care_gaps: mem?.rawRecords?.care_gaps?.map(g => `[${g.urgency}] ${g.description}`).join("; ") || "",
        top_insights: mem?.rawRecords?.top_3_insights?.join("; ") || "",
      };
    } catch (ctxErr) {
      console.error("[Voice] Failed to build dynamic variables:", ctxErr.message);
      dynamicVariables = {
        patient_name: "there",
        coordinator_name: coordinatorName,
        opening_script: `Hey, this is ${coordinatorName} from your care team. How are you doing today?`,
      };
    }

    res.json({
      signedUrl: data.token,
      userId: req.user.userId,
      dynamicVariables,
      // Keep patientContext for backward compat
      patientContext: dynamicVariables.patient_context || "",
    });
  } catch (err) {
    console.error("Voice token error:", err);
    res.status(500).json({ error: "Voice service error" });
  }
});

// POST /api/voice/outbound-call — Trigger engagement pipeline → script gen → call
// The pipeline runs: EHR compaction → dual-agent script gen → trigger gen → outbound call.
// The call only happens AFTER the script passes the 90% judge threshold.
router.post("/outbound-call", async (req, res) => {
  try {
    const { runOnboardingPipeline } = require("../services/onboardingPipeline");
    const { patientMemory } = require("../db/schema");
    const userId = req.user.userId;

    // Dedup: check if a pipeline is already running or recently completed
    const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
    const runs = mem?.tier2?.pipeline_runs || [];
    const recentRun = runs.find(r => {
      const started = new Date(r.startedAt).getTime();
      return Date.now() - started < 10 * 60 * 1000;
    });
    const hasCompletedRun = runs.some(r =>
      r.events?.some(e => e.step === "pipeline_complete")
    );

    if (recentRun) {
      console.log(`[VOICE_API] Pipeline already running for ${userId}, skipping duplicate`);
      return res.json({ success: true, status: "pipeline_already_running" });
    }

    if (hasCompletedRun) {
      // Pipeline already ran — just trigger the outbound call directly
      console.log(`[VOICE_API] Pipeline already completed for ${userId}, triggering call directly`);
      const { initiateOutboundCall } = require("../services/outboundCall");
      const callResult = await initiateOutboundCall(userId);
      return res.json(callResult);
    }

    // No pipeline run yet — trigger the full pipeline (includes outbound call as final step)
    console.log(`[VOICE_API] Triggering engagement pipeline for ${userId}`);
    runOnboardingPipeline(userId).catch(err => {
      console.error(`[VOICE_API] Pipeline failed:`, err.message);
    });

    // Respond immediately — pipeline runs in background, call happens at the end
    res.json({ success: true, status: "pipeline_started" });
  } catch (err) {
    console.error("Outbound call error:", err);
    res.status(500).json({ error: "Failed to start engagement pipeline" });
  }
});

module.exports = router;
