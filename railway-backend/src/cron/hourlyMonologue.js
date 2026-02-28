const { eq, desc, and, gte } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const {
  users, userProfiles, vitals, medications, medicationLogs,
  messages, aiActions, engagementConfig, userCoordinator, careCoordinators,
  userPreferences, triggers,
} = require("../db/schema");
const { sendPush } = require("../services/pushService");
const { decrypt, decryptJson } = require("../services/encryption");
const { getCompactedContext } = require("../services/ehrCompaction");
const { generateDailyTriggers } = require("../services/triggerEngine");

/**
 * Hourly Monologue — The Autonomous AI Brain
 *
 * For each active patient:
 * 1. OBSERVE: Gather all relevant data + compacted memory
 * 2. THINK: Call Gemini with structured prompt (Hook Model aware)
 * 3. ACT: Execute the decision (message, trigger, or call)
 * 4. LOG: Write full reasoning to ai_actions
 *
 * @param {string} [singleUserId] - If provided, run for just this user (manual trigger)
 */
async function runHourlyMonologue(singleUserId) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    console.error("[MONOLOGUE] No GEMINI_API_KEY set");
    return { error: "No API key" };
  }

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  // Get patients to process
  let patientUsers;
  if (singleUserId) {
    patientUsers = await db.select().from(users)
      .where(and(eq(users.id, singleUserId), eq(users.isActive, true)));
  } else {
    patientUsers = await db.select().from(users)
      .where(and(eq(users.role, "patient"), eq(users.isActive, true)));
  }

  const results = [];

  for (let i = 0; i < patientUsers.length; i++) {
    const patient = patientUsers[i];
    try {
      const result = await processPatient(patient, model);
      results.push(result);
    } catch (err) {
      console.error(`[MONOLOGUE] Error processing user ${patient.id}:`, err);
      results.push({ userId: patient.id, error: err.message });
    }
    // Stagger requests to avoid Gemini 429 rate limits
    if (i < patientUsers.length - 1) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  return { processed: results.length, results };
}

async function processPatient(patient, model) {
  const userId = patient.id;

  // -----------------------------------------------------------------------
  // OBSERVE
  // -----------------------------------------------------------------------
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const [profile] = await db.select().from(userProfiles)
    .where(eq(userProfiles.userId, userId));

  if (!profile) {
    return { userId, action: "none", reason: "No profile found" };
  }

  // Decrypt encrypted PII fields
  profile.firstName = decrypt(profile.firstName);
  profile.lastName = decrypt(profile.lastName);
  if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
  if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);

  const recentVitals = await db.select().from(vitals)
    .where(and(eq(vitals.patientId, userId), gte(vitals.recordedAt, since7d)))
    .orderBy(desc(vitals.recordedAt));

  const recentMeds = await db.select().from(medicationLogs)
    .where(and(eq(medicationLogs.patientId, userId), gte(medicationLogs.scheduledAt, since7d)));

  const recentMessages = await db.select().from(messages)
    .where(and(eq(messages.userId, userId), gte(messages.createdAt, since48h)))
    .orderBy(desc(messages.createdAt));

  const recentActions = await db.select().from(aiActions)
    .where(and(eq(aiActions.userId, userId), gte(aiActions.createdAt, since48h)))
    .orderBy(desc(aiActions.createdAt));

  // Load compacted memory (falls back to null if not available)
  let compactedCtx = null;
  try {
    compactedCtx = await getCompactedContext(userId);
  } catch (e) {
    // No compacted memory yet — use raw data
  }

  // Load recent triggers
  let recentTriggers = [];
  try {
    recentTriggers = await db.select().from(triggers)
      .where(and(eq(triggers.userId, userId), gte(triggers.createdAt, since48h)))
      .orderBy(desc(triggers.createdAt));
  } catch (e) {
    // triggers table might not exist yet
  }

  // Engagement config for age bracket
  let engConfig = null;
  if (profile.ageBracket) {
    const [ec] = await db.select().from(engagementConfig)
      .where(eq(engagementConfig.ageBracket, profile.ageBracket));
    engConfig = ec;
  }

  // Coordinator persona
  let coordinator = null;
  const [uc] = await db.select().from(userCoordinator)
    .where(eq(userCoordinator.userId, userId));
  if (uc) {
    const [coord] = await db.select().from(careCoordinators)
      .where(eq(careCoordinators.id, uc.coordinatorId));
    coordinator = coord;
  }

  // User preferences
  let prefs = null;
  const [userPref] = await db.select().from(userPreferences)
    .where(eq(userPreferences.userId, userId));
  prefs = userPref;

  // Compute medication adherence
  const totalScheduled = recentMeds.length;
  const totalTaken = recentMeds.filter((l) => l.status === "taken" || l.status === "late").length;
  const adherenceRate = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 100;

  // GLP-1 context
  const glp1StartDate = profile.glp1StartDate ? new Date(profile.glp1StartDate) : null;
  const daysSinceStart = glp1StartDate
    ? Math.floor((Date.now() - glp1StartDate.getTime()) / (24 * 60 * 60 * 1000))
    : null;
  const weekNumber = daysSinceStart !== null ? Math.ceil(daysSinceStart / 7) : null;

  // -----------------------------------------------------------------------
  // THINK
  // -----------------------------------------------------------------------
  const prompt = `You are the CareCompanion AI monitoring system. Analyze this patient and decide what action to take.

PATIENT PROFILE:
- Name: ${profile.firstName} ${profile.lastName}
- Age bracket: ${profile.ageBracket}
- Primary medication: ${profile.glp1Medication || "not set"} ${profile.glp1Dosage || ""}
- Week ${weekNumber || "?"} of care journey (Day ${daysSinceStart || "?"})
- Injection day: ${profile.injectionDay || "not set"}
- Conditions: ${JSON.stringify(profile.conditions || [])}
- Current side effects: ${JSON.stringify(profile.currentSideEffects || [])}
- Goals: ${JSON.stringify(profile.goals || [])}

${compactedCtx ? `PATIENT MEMORY (compacted — use this as your primary knowledge source):
${compactedCtx}
` : ""}
ENGAGEMENT RULES (${profile.ageBracket} age group):
- Primary channel: ${engConfig?.primaryChannel || "text"}
- Max daily messages: ${engConfig?.maxDailyMessages || 3}
- Max weekly calls: ${engConfig?.maxWeeklyCalls || 2}
- Call threshold level: ${engConfig?.callThresholdLevel || 4}
- Tone: ${engConfig?.toneDescription || "supportive"}

USER PREFERENCES (set during Day 1 ${prefs?.setVia || 'not set'}):
- Check-in: ${prefs?.checkinFrequency || 'once_daily'}, prefers ${prefs?.checkinTimePreference || 'morning'}
- Med reminders: ${prefs?.medReminderEnabled ? 'ON' : 'OFF'} (night before: ${prefs?.medReminderPrepNightBefore ? 'YES' : 'NO'})
- Hydration nudges: ${prefs?.hydrationNudgesEnabled ? `${prefs.hydrationNudgesPerDay}x/day` : 'OFF'}
- Weigh-in: ${prefs?.weighinPrompt || 'daily_morning'}
- Channel: ${prefs?.preferredChannel || 'both'}, calls ${prefs?.voiceCallFrequency || 'every_2_days'}
- Glucose alerts: ${prefs?.glucoseAlertMode || 'N/A'}
- Quiet hours: ${prefs?.quietStart || '22:00'} - ${prefs?.quietEnd || '07:00'}
- Exercise nudges: ${prefs?.exerciseNudgesEnabled ? 'ON' : 'OFF'}

RESPECT THESE PREFERENCES. Do not message/call outside quiet hours unless urgency >= high.
Match the agreed frequency exactly.

MEDICATION ADHERENCE (last 7 days):
- Rate: ${adherenceRate}%
- Total scheduled: ${totalScheduled}, taken: ${totalTaken}
- Missed: ${recentMeds.filter((l) => l.status === "missed").length}

${!compactedCtx ? `RECENT VITALS (last 7 days, most recent first):
${formatVitals(recentVitals)}
` : ""}
RECENT MESSAGES (last 48h):
${recentMessages.map((m) => `[${m.sender} ${m.createdAt}]: ${m.content}`).join("\n") || "No messages"}

PREVIOUS AI ACTIONS (last 48h):
${recentActions.map((a) => `[${a.createdAt}] ${a.urgency} - ${a.action}: ${a.assessment}`).join("\n") || "No prior actions"}

RECENT TRIGGERS (last 48h):
${recentTriggers.length > 0 ? recentTriggers.map(t => `[${t.status}] ${t.type}: ${t.title}`).join("\n") : "No triggers"}

COORDINATOR PERSONA: ${coordinator ? coordinator.name : "Not assigned"}

CLINICAL KNOWLEDGE:
- Week 1 nausea peaks Days 3-5 for injectable medications
- Dehydration cycle: nausea → reduced intake → dehydration → more nausea
- 64oz+ daily fluid target
- Nausea tips: ginger, small frequent meals, injection timing, hydration
- Muscle mass preservation critical for 65+

HOOK MODEL ENGAGEMENT:
When recommending an action, classify it as one of:
- External Trigger: reminder, alert, or notification prompted by external data
- Reward of Hunt: curiosity-driven insight, "did you know" finding from their data
- Reward of Self: personal progress, score change, achievement
- Investment: patient contributes data or sets goals (makes the system smarter)

Prefer creating a TRIGGER (scheduled insight) over a direct message when the content is an insight or non-urgent finding. Triggers are tracked and deliver at optimal times.

CURRENT TIME: ${new Date().toISOString()}

Respond in valid JSON with this exact format:
{
  "observation": "Brief summary of what you observed in the data",
  "reasoning": "Your detailed internal reasoning process",
  "assessment": "One-sentence summary assessment",
  "urgency": "low|medium|high|critical",
  "action": "none|send_message|call|escalate|create_trigger",
  "hook_element": "external|hunt|self|investment|null",
  "message": "The exact message to send if action is send_message or call. null if action is none.",
  "trigger": {
    "type": "health_insight|trend_alert|medication_connection|overdue_care|null",
    "title": "Trigger title if action is create_trigger, null otherwise",
    "body": "Trigger body if action is create_trigger, null otherwise"
  },
  "escalation_target": "provider|emergency|null"
}`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
    },
  });

  let decision;
  try {
    const responseText = result.response.text();
    decision = JSON.parse(responseText);
  } catch (e) {
    console.error("[MONOLOGUE] Failed to parse Gemini response:", e);
    decision = {
      observation: "Failed to parse AI response",
      reasoning: "Error in AI processing",
      assessment: "System error",
      urgency: "low",
      action: "none",
      message: null,
      escalation_target: null,
    };
  }

  // -----------------------------------------------------------------------
  // ACT
  // -----------------------------------------------------------------------
  const [actionRow] = await db.insert(aiActions).values({
    userId,
    observation: decision.observation || "Routine check",
    reasoning: decision.reasoning || "No notable changes",
    assessment: decision.assessment || "Stable",
    urgency: decision.urgency || "low",
    action: decision.action === "create_trigger" ? "none" : (decision.action || "none"),
    messageContent: decision.message,
    escalationTarget: decision.escalation_target,
    coordinatorPersona: coordinator?.name || null,
    engagementProfile: profile.ageBracket,
    glp1Context: `${profile.glp1Medication || "Unknown"} ${profile.glp1Dosage || ""}, Week ${weekNumber || "?"}, Day ${daysSinceStart || "?"}`,
    source: "cron",
  }).returning();

  // Handle create_trigger action — queue a trigger instead of sending directly
  if (decision.action === "create_trigger" && decision.trigger?.title && decision.trigger?.body) {
    try {
      await db.insert(triggers).values({
        userId,
        type: decision.trigger.type || "health_insight",
        hookElement: decision.hook_element || "hunt",
        title: decision.trigger.title,
        body: decision.trigger.body,
        priority: decision.urgency === "high" ? "high" : "medium",
        scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        status: "pending",
      });
      console.log(`[MONOLOGUE] Created trigger for ${userId}: ${decision.trigger.title}`);
    } catch (e) {
      console.error("[MONOLOGUE] Failed to create trigger:", e);
    }
  }

  // If action is send_message, create the message
  if (decision.action === "send_message" && decision.message) {
    // Enforce quiet hours — skip non-urgent messages during quiet period
    const isUrgent = decision.urgency === "high" || decision.urgency === "critical";
    const userTz = profile.timezone || "America/New_York";
    const quietStart = prefs?.quietStart || "22:00";
    const quietEnd = prefs?.quietEnd || "07:00";

    if (!isUrgent && isQuietHours(userTz, quietStart, quietEnd)) {
      console.log(`[MONOLOGUE] Skipping non-urgent message for ${userId} — quiet hours (${quietStart}-${quietEnd} ${userTz})`);
      return { userId, action: "none", reason: "quiet_hours", urgency: decision.urgency };
    }

    await db.insert(messages).values({
      userId,
      sender: "ai",
      messageType: isUrgent ? "alert" : "check_in",
      content: decision.message,
      triggeredBy: actionRow.id,
    });
    // Send push notification with routing data
    const msgType = isUrgent ? "alert" : "check_in";
    await sendPush(userId, {
      title: coordinator?.name || "Care Coordinator",
      body: decision.message.length > 100 ? decision.message.substring(0, 97) + "..." : decision.message,
      data: {
        route: decision.action === "call" ? "call" : "messages",
        messageType: msgType,
      },
    });
  }

  // Generate daily triggers if compacted memory available
  if (compactedCtx) {
    try {
      await generateDailyTriggers(userId, compactedCtx);
    } catch (e) {
      // Non-critical — don't fail the monologue
    }
  }

  return {
    userId,
    action: decision.action,
    urgency: decision.urgency,
    assessment: decision.assessment,
    hookElement: decision.hook_element || null,
  };
}

function formatVitals(vitalsArray) {
  if (!vitalsArray || vitalsArray.length === 0) return "No vitals recorded";

  const grouped = {};
  for (const v of vitalsArray) {
    if (!grouped[v.vitalType]) grouped[v.vitalType] = [];
    grouped[v.vitalType].push(v);
  }

  return Object.entries(grouped).map(([type, readings]) => {
    const latest = readings[0];
    const values = readings.slice(0, 5).map((r) => r.value);
    return `${type}: latest=${latest.value}${latest.unit}, recent=[${values.join(", ")}]`;
  }).join("\n");
}

/**
 * Check if current time in the user's timezone falls within quiet hours.
 * Handles overnight ranges (e.g., 22:00 - 07:00).
 */
function isQuietHours(timezone, quietStart, quietEnd) {
  const nowStr = new Date().toLocaleString("en-US", { timeZone: timezone, hour12: false });
  const now = new Date(nowStr);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = quietStart.split(":").map(Number);
  const [endH, endM] = quietEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes > endMinutes) {
    // Overnight range (e.g., 22:00 - 07:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

module.exports = { runHourlyMonologue };
