const { eq, and, gte, desc } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require("@anthropic-ai/sdk");
const { db } = require("../db");
const { patientMemory, userProfiles, messages, vitals, medicationLogs, userPreferences, scheduledActions } = require("../db/schema");
const { getUserContext } = require("./userContext");
const { runDualAgentLoop, buildPatientContext, buildGeneratorPrompt, judgeScript } = require("./firstCallPrep");
const { getCompactedContext } = require("./ehrCompaction");
const { decrypt } = require("./encryption");
const { emitPipelineEvent } = require("./pipelineEmitter");
const { initiateOutboundCall } = require("./outboundCall");
const { sendPush } = require("./pushService");

/**
 * runDailyHookForUser — Regenerate the hook/script for a single patient.
 * Called by: scheduledActions (6am/5pm), chat tool (on-demand).
 *
 * @param {string} userId
 * @param {string} runType — "scheduled_6am", "scheduled_5pm", "on_demand"
 */
async function runDailyHookForUser(userId, runType = "scheduled") {
  console.log(`[DAILY_HOOK] Starting ${runType} hook regeneration for ${userId}`);

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error("[DAILY_HOOK] No GEMINI_API_KEY — skipping");
    return null;
  }

  // Load existing memory and previous script
  const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

  if (!profile) {
    console.log(`[DAILY_HOOK] No profile for ${userId} — skipping`);
    return null;
  }

  const previousScript = mem?.tier2?.first_call_prep || null;
  if (!previousScript) {
    console.log(`[DAILY_HOOK] No previous script for ${userId} — skipping (onboarding not complete)`);
    return null;
  }

  const firstName = decrypt(profile.firstName);

  // Initialize pipeline run tracking
  const runId = new Date().toISOString();
  const pipelineLog = [];
  const logEvent = async (step, status, detail) => {
    const event = { step, status, timestamp: new Date().toISOString(), runType, ...detail };
    pipelineLog.push(event);
    console.log(`[DAILY_HOOK] [${step}] ${status}: ${JSON.stringify(detail).substring(0, 200)}`);
    emitPipelineEvent(userId, event);
    // Persist events to pipeline_runs
    try {
      const [m] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
      if (m) {
        const tier2 = m.tier2 || {};
        const runs = tier2.pipeline_runs || [];
        let currentRun = runs.find(r => r.startedAt === runId);
        if (!currentRun) {
          currentRun = { startedAt: runId, runType, events: [] };
          runs.push(currentRun);
        }
        currentRun.events.push(event);
        tier2.pipeline_runs = runs;
        tier2.pipeline_log = currentRun.events;
        await db.update(patientMemory).set({ tier2, updatedAt: new Date() })
          .where(eq(patientMemory.userId, userId));
      }
    } catch (e) {
      console.error("[DAILY_HOOK] Failed to persist event:", e.message);
    }
  };

  await logEvent("daily_hook_start", "running", {
    detail: `${runType} hook regeneration — building delta context from last run`,
    previousScore: previousScript.judge_score,
    previousPreparedAt: previousScript.prepared_at,
  });

  // Build delta context — what changed since last run
  const lastRunTime = previousScript.prepared_at
    ? new Date(previousScript.prepared_at)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  const deltaContext = await buildDeltaContext(userId, lastRunTime);

  await logEvent("delta_context", "completed", {
    detail: "Gathered changes since last hook run",
    newMessages: deltaContext.newMessageCount,
    newVitals: deltaContext.newVitalCount,
    medAdherenceChange: deltaContext.medAdherenceChange,
    sinceLastRun: lastRunTime.toISOString(),
  });

  // Build patient context (same format as firstCallPrep)
  const compactedCtx = await getCompactedContext(userId);
  const hookAnchor = mem?.rawRecords?.hook_anchor || null;
  const careGaps = mem?.rawRecords?.care_gaps || [];
  const insights = mem?.rawRecords?.top_3_insights || [];

  let currentFocus = "general health and medication management";
  if (careGaps.length > 0) {
    const topGap = [...careGaps].sort((a, b) => {
      const ord = { high: 0, medium: 1, low: 2 };
      return (ord[a.urgency] || 2) - (ord[b.urgency] || 2);
    })[0];
    currentFocus = topGap.description;
  } else if (profile.glp1Medication) {
    currentFocus = `medication adherence and wellness (currently on ${profile.glp1Medication})`;
  }

  const patientContext = buildPatientContext(firstName, compactedCtx, hookAnchor, currentFocus, insights, careGaps);

  // Init AI models
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const gemini = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const hasJudge = !!ANTHROPIC_API_KEY;
  let claude = null;
  if (hasJudge) {
    claude = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  }

  await logEvent("agents_init", "completed", {
    generator: "gemini-3-flash-preview",
    judge: hasJudge ? "claude-sonnet-4-6" : null,
    mode: hasJudge ? "dual-agent adversarial" : "single-pass",
  });

  // Run the dual-agent loop with previous script context
  const { bestPrep, bestScore, iterations } = await runDualAgentLoop({
    userId,
    gemini,
    claude,
    hasJudge,
    patientContext,
    logEvent,
    firstName,
    previousScript,
    deltaContext: deltaContext.summary,
  });

  // Finalize result
  bestPrep.prepared_at = new Date().toISOString();
  bestPrep.judge_score = bestScore;
  bestPrep.judge_score_max = 40;
  bestPrep.judge_score_percentage = Math.round((bestScore / 40) * 100);
  bestPrep.iterations = iterations;
  bestPrep.run_type = runType;

  // Store: update first_call_prep + append to hook_versions
  const [currentMem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  if (currentMem) {
    const tier2 = currentMem.tier2 || {};
    tier2.first_call_prep = bestPrep;
    const hookVersions = tier2.hook_versions || [];
    hookVersions.push({
      prepared_at: bestPrep.prepared_at,
      run_type: runType,
      judge_score: bestScore,
      opening_script: bestPrep.opening_script,
      hook_anchor: bestPrep.hook_anchor,
      iterations,
    });
    // Keep last 20 versions to avoid unbounded growth
    if (hookVersions.length > 20) {
      tier2.hook_versions = hookVersions.slice(-20);
    } else {
      tier2.hook_versions = hookVersions;
    }
    await db.update(patientMemory).set({ tier2, updatedAt: new Date() })
      .where(eq(patientMemory.userId, userId));
  }

  await logEvent("daily_hook_complete", "completed", {
    score: bestScore,
    iterations,
    runType,
    openingPreview: bestPrep.opening_script?.substring(0, 100),
  });

  // Deliver based on preferences
  await deliverHookResult(userId, bestPrep, runType);

  console.log(`[DAILY_HOOK] Completed ${runType} for ${userId}: score=${bestScore}/40, iterations=${iterations}`);
  return bestPrep;
}

/**
 * Build a delta context string — what changed since the last hook run.
 */
async function buildDeltaContext(userId, sinceDate) {
  const [newMessages, newVitals, newMedLogs] = await Promise.all([
    db.select().from(messages)
      .where(and(eq(messages.userId, userId), gte(messages.createdAt, sinceDate)))
      .orderBy(desc(messages.createdAt)).limit(20),
    db.select().from(vitals)
      .where(and(eq(vitals.patientId, userId), gte(vitals.recordedAt, sinceDate)))
      .orderBy(desc(vitals.recordedAt)).limit(20),
    db.select().from(medicationLogs)
      .where(and(eq(medicationLogs.patientId, userId), gte(medicationLogs.scheduledAt, sinceDate))),
  ]);

  const parts = [];

  // Summarize new messages
  if (newMessages.length > 0) {
    const patientMsgs = newMessages.filter(m => m.sender === "user");
    const aiMsgs = newMessages.filter(m => m.sender === "ai");
    parts.push(`CONVERSATIONS: ${patientMsgs.length} patient messages, ${aiMsgs.length} AI messages since last run.`);
    // Include recent patient messages for context
    const recentPatient = patientMsgs.slice(0, 5).map(m => `- "${m.content?.substring(0, 100)}"`);
    if (recentPatient.length > 0) {
      parts.push(`Recent patient messages:\n${recentPatient.join("\n")}`);
    }
  }

  // Summarize new vitals
  if (newVitals.length > 0) {
    const vitalSummary = {};
    for (const v of newVitals) {
      if (!vitalSummary[v.vitalType]) vitalSummary[v.vitalType] = [];
      vitalSummary[v.vitalType].push(v.value);
    }
    const vitalLines = Object.entries(vitalSummary)
      .map(([type, values]) => `${type}: ${values.join(", ")}`)
      .join("; ");
    parts.push(`NEW VITALS: ${vitalLines}`);
  }

  // Medication adherence
  if (newMedLogs.length > 0) {
    const taken = newMedLogs.filter(l => l.status === "taken" || l.status === "late").length;
    const missed = newMedLogs.filter(l => l.status === "missed").length;
    const total = newMedLogs.length;
    const adherence = total > 0 ? Math.round((taken / total) * 100) : 0;
    parts.push(`MEDICATION ADHERENCE: ${taken}/${total} taken (${adherence}%), ${missed} missed`);
  }

  return {
    summary: parts.length > 0 ? parts.join("\n\n") : "No significant changes since last run.",
    newMessageCount: newMessages.length,
    newVitalCount: newVitals.length,
    medAdherenceChange: newMedLogs.length > 0
      ? `${newMedLogs.filter(l => l.status === "taken" || l.status === "late").length}/${newMedLogs.length}`
      : "no data",
  };
}

/**
 * Deliver the hook result based on user preferences.
 */
async function deliverHookResult(userId, prep, runType) {
  const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
  if (!prefs) return;

  const freq = prefs.voiceCallFrequency || "daily";

  if (shouldCallToday(freq, userId)) {
    // Check if this is a call-time run (morning or evening based on preferences)
    const isMorningRun = runType === "scheduled_6am";
    const isEveningRun = runType === "scheduled_5pm";

    // Default: morning runs trigger calls for daily callers
    if (freq === "daily" || runType === "on_demand") {
      // Script is already stored in first_call_prep — trigger the call
      try {
        await initiateOutboundCall(userId);
        console.log(`[DAILY_HOOK] Triggered outbound call for ${userId}`);
      } catch (err) {
        console.error(`[DAILY_HOOK] Outbound call failed for ${userId}:`, err.message);
        // Fall back to message delivery
        await sendScriptAsMessage(userId, prep);
      }
    } else if (isMorningRun) {
      // For non-daily callers on their call day, trigger on morning run
      try {
        await initiateOutboundCall(userId);
      } catch (err) {
        console.error(`[DAILY_HOOK] Outbound call failed:`, err.message);
        await sendScriptAsMessage(userId, prep);
      }
    } else {
      // Evening run on a call day — just update the script, don't call again
      console.log(`[DAILY_HOOK] Evening run — script updated for ${userId}, no call (already called today)`);
    }
  } else {
    // Not a call day — send as message + push
    await sendScriptAsMessage(userId, prep);
  }
}

/**
 * Check if today is a call day based on voice call frequency preference.
 */
async function shouldCallToday(freq, userId) {
  if (freq === "none" || freq === "never") return false;
  if (freq === "daily") return true;

  // For interval-based frequencies, check the last call scheduled action
  const intervalMap = {
    every_2_days: 2,
    every_3_days: 3,
    weekly: 7,
  };
  const intervalDays = intervalMap[freq] || 1;
  if (intervalDays <= 1) return true;

  // Check last hook_regeneration trigger that resulted in a call
  const [lastAction] = await db.select().from(scheduledActions)
    .where(and(
      eq(scheduledActions.userId, userId),
      eq(scheduledActions.actionType, "hook_regeneration"),
    )).limit(1);

  if (!lastAction?.lastTriggeredAt) return true; // First time

  const daysSince = (Date.now() - new Date(lastAction.lastTriggeredAt).getTime()) / (24 * 60 * 60 * 1000);
  return daysSince >= intervalDays;
}

/**
 * Send the script output as a message + push notification.
 */
async function sendScriptAsMessage(userId, prep) {
  const summary = buildScriptSummary(prep);

  await db.insert(messages).values({
    userId,
    sender: "ai",
    messageType: "hook_update",
    content: summary,
  });

  await sendPush(userId, {
    title: "New insights from your care team",
    body: summary.substring(0, 100),
    data: { route: "messages", messageType: "hook_update" },
  });

  console.log(`[DAILY_HOOK] Sent script summary as message to ${userId}`);
}

/**
 * Convert the raw script prep into a conversational message.
 */
function buildScriptSummary(prep) {
  const parts = [];

  // Use the opening script as the main message, stripped of coaching framing
  if (prep.opening_script) {
    parts.push(prep.opening_script);
  }

  // Add the top talking point as a natural follow-up
  if (prep.talking_points?.length > 0) {
    parts.push(prep.talking_points[0]);
  }

  // Add the follow-up question
  if (prep.follow_up_question) {
    parts.push(prep.follow_up_question);
  }

  return parts.join("\n\n") || "Hey! Just checking in — how are things going today?";
}

/**
 * Run daily hooks for all active patients.
 * Called by cron when using the separate cron approach.
 */
async function runDailyHooks(runType) {
  // Find all patients with active hook_regeneration scheduled actions
  const activePatients = await db.select().from(patientMemory)
    .where(eq(patientMemory.userId, patientMemory.userId)); // all patients with memory

  console.log(`[DAILY_HOOK] Running ${runType} for ${activePatients.length} patients`);

  for (const patient of activePatients) {
    try {
      await runDailyHookForUser(patient.userId, runType);
      // Stagger between patients to avoid rate limits
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[DAILY_HOOK] Failed for ${patient.userId}:`, err.message);
    }
  }
}

module.exports = { runDailyHookForUser, runDailyHooks };
