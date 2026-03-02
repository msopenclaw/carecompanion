const { compactMemory } = require("./ehrCompaction");
const { prepareFirstCall } = require("./firstCallPrep");
const { generateOnboardingTriggers } = require("./triggerEngine");
const { initiateOutboundCall } = require("./outboundCall");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { userProfiles, messages, patientMemory, scheduledActions } = require("../db/schema");
const { decrypt } = require("./encryption");
const { sendPush } = require("./pushService");
const { emitPipelineEvent } = require("./pipelineEmitter");

/**
 * runOnboardingPipeline — Full engagement pipeline for a new patient.
 * All steps are logged to patient_memory.tier2.pipeline_log for console display.
 */
async function runOnboardingPipeline(userId, options = {}) {
  const { skipOutboundCall = false } = options;
  console.log(`[PIPELINE] Starting onboarding pipeline for ${userId}`);
  const result = { userId, steps: {} };

  // Helper to append events to the pipeline_log in patient_memory
  // Pipeline runs are stored as: pipeline_runs = [{ startedAt, events[] }, ...]
  // Legacy pipeline_log (flat array) is preserved as the current run's events for backward compat.
  const runId = new Date().toISOString();

  async function appendPipelineEvent(step, status, detail) {
    const event = { step, status, timestamp: new Date().toISOString(), ...detail };
    console.log(`[PIPELINE] [${step}] ${status}: ${JSON.stringify(detail)}`);
    // Emit to SSE listeners instantly
    emitPipelineEvent(userId, event);
    try {
      const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
      if (mem) {
        const tier2 = mem.tier2 || {};

        // Maintain pipeline_runs array (versioned runs)
        const runs = tier2.pipeline_runs || [];
        let currentRun = runs.find(r => r.startedAt === runId);
        if (!currentRun) {
          currentRun = { startedAt: runId, events: [] };
          runs.push(currentRun);
        }
        currentRun.events.push(event);
        tier2.pipeline_runs = runs;

        // Also maintain flat pipeline_log for backward compat (current run only)
        tier2.pipeline_log = currentRun.events;

        await db.update(patientMemory).set({ tier2, updatedAt: new Date() })
          .where(eq(patientMemory.userId, userId));
      } else {
        // No patient_memory row yet (e.g. records were deleted) — create one so
        // the pipeline-status endpoint returns "running" instead of "none"
        const tier2 = {
          pipeline_runs: [{ startedAt: runId, events: [event] }],
          pipeline_log: [event],
        };
        await db.insert(patientMemory).values({ userId, tier2 });
      }
    } catch (e) {
      // Don't fail pipeline for logging errors
      console.error("[PIPELINE] Failed to append event:", e.message);
    }
  }

  await appendPipelineEvent("pipeline_start", "started", {
    userId,
    steps: ["ehr_compaction", "first_call_prep", "trigger_generation", "outbound_call"],
  });

  // Step 1: Compact memory
  await appendPipelineEvent("ehr_compaction", "running", { detail: "Analyzing health records and building 3-tier patient memory" });
  try {
    const compacted = await compactMemory(userId, appendPipelineEvent);
    result.steps.compaction = {
      success: true,
      insights: compacted.top_3_insights?.length || 0,
      careGaps: compacted.care_gaps?.length || 0,
    };
    await appendPipelineEvent("ehr_compaction", "completed", {
      insights: result.steps.compaction.insights,
      careGaps: result.steps.compaction.careGaps,
      tiers: { tier1: "constitutional", tier2: "strategic", tier3: "operational" },
    });
  } catch (err) {
    console.error("[PIPELINE] Compaction failed:", err);
    result.steps.compaction = { success: false, error: err.message };
    await appendPipelineEvent("ehr_compaction", "error", { error: err.message });
  }

  // Step 2: Prepare first call (this writes its own detailed events to pipeline_log)
  await appendPipelineEvent("first_call_prep", "running", {
    detail: "Generating call script via dual-agent loop (Gemini + Claude Sonnet 4.6)",
  });
  try {
    const prep = await prepareFirstCall(userId);
    result.steps.firstCallPrep = {
      success: true,
      judgeScore: prep.judge_score,
      iterations: prep.iterations,
    };
    // firstCallPrep already logs its own detailed events — just log the wrapper completion
    await appendPipelineEvent("first_call_prep", "completed", {
      judgeScore: prep.judge_score,
      iterations: prep.iterations,
      hookAnchor: prep.hook_anchor,
    });
  } catch (err) {
    console.error("[PIPELINE] First-call prep failed:", err);
    result.steps.firstCallPrep = { success: false, error: err.message };
    await appendPipelineEvent("first_call_prep", "error", { error: err.message });
  }

  // Step 3: Generate onboarding triggers
  await appendPipelineEvent("trigger_generation", "running", { detail: "Generating 48-hour engagement trigger sequence" });
  try {
    const triggerList = await generateOnboardingTriggers(userId);
    result.steps.triggers = {
      success: true,
      count: triggerList.length,
    };
    await appendPipelineEvent("trigger_generation", "completed", {
      count: triggerList.length,
      types: triggerList.map(t => t.type),
    });
  } catch (err) {
    console.error("[PIPELINE] Trigger generation failed:", err);
    result.steps.triggers = { success: false, error: err.message };
    await appendPipelineEvent("trigger_generation", "error", { error: err.message });
  }

  // Step 3b: Seed daily hook regeneration actions (6am and 5pm)
  try {
    const [hookProfile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    const patientTz = hookProfile?.timezone || "America/New_York";
    const hookActions = [
      { actionType: "hook_regeneration", scheduledTime: "06:00", label: "scheduled_6am", recurrence: "daily" },
      { actionType: "hook_regeneration", scheduledTime: "17:00", label: "scheduled_5pm", recurrence: "daily" },
    ];
    for (const ha of hookActions) {
      await db.insert(scheduledActions).values({
        userId,
        actionType: ha.actionType,
        scheduledTime: ha.scheduledTime,
        recurrence: ha.recurrence,
        label: ha.label,
        timezone: patientTz,
        isActive: true,
      });
    }
    await appendPipelineEvent("hook_schedule_seeded", "completed", {
      detail: "Created daily hook regeneration actions at 6am and 5pm",
      times: ["06:00", "17:00"],
      timezone: patientTz,
    });
  } catch (err) {
    console.error("[PIPELINE] Hook schedule seeding failed:", err.message);
    await appendPipelineEvent("hook_schedule_seeded", "error", { error: err.message });
  }

  // Step 4: Patient engagement — call or in-app nudge
  if (skipOutboundCall) {
    result.steps.engagement = { method: "call_already_initiated" };
  } else {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    const hasPhone = profile?.phone && decrypt(profile.phone)?.length > 3;

    if (hasPhone) {
      await appendPipelineEvent("outbound_call", "running", { detail: "Initiating outbound call via ElevenLabs + Twilio" });
      try {
        const callResult = await initiateOutboundCall(userId);
        result.steps.engagement = { method: "outbound_call", ...callResult };
        await appendPipelineEvent("outbound_call", callResult.success ? "completed" : "error", {
          method: "elevenlabs_twilio",
          ...callResult,
        });
      } catch (err) {
        console.error("[PIPELINE] Outbound call failed:", err);
        result.steps.engagement = { method: "outbound_call", success: false, error: err.message };
        await appendPipelineEvent("outbound_call", "error", { error: err.message });
      }
    } else {
      // No phone — send in-app nudge instead (NOT a call)
      const firstName = profile ? decrypt(profile.firstName) : "there";
      await db.insert(messages).values({
        userId,
        sender: "ai",
        messageType: "call_request",
        content: `Hey ${firstName}! I've been looking at your health data and found some interesting things I'd love to share with you. Tap the call button when you're ready for a quick chat!`,
      });
      await sendPush(userId, {
        title: "Sarah wants to chat",
        body: "I found some interesting things in your health data. Ready for a quick call?",
        data: { route: "call" },
      });
      result.steps.engagement = { method: "in_app_nudge" };
      await appendPipelineEvent("patient_nudge", "completed", {
        method: "in_app_message_and_push",
        detail: "Sent in-app message + push notification (no phone number on file for outbound call)",
      });
    }
  }

  await appendPipelineEvent("pipeline_complete", "completed", {
    summary: result.steps,
  });

  console.log(`[PIPELINE] Pipeline complete for ${userId}:`, JSON.stringify(result.steps));
  return result;
}

module.exports = { runOnboardingPipeline };
