const { eq, and, lte, desc, gte } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const { triggers, patientMemory, userProfiles, userPreferences, messages } = require("../db/schema");
const { sendPush } = require("./pushService");
const { decrypt } = require("./encryption");

// ---------------------------------------------------------------------------
// generateOnboardingTriggers — Create 48-hour Hook Model trigger sequence
// ---------------------------------------------------------------------------

async function generateOnboardingTriggers(userId) {
  console.log(`[TRIGGER_ENGINE] Generating onboarding triggers for ${userId}`);

  const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));

  if (!profile) {
    console.log(`[TRIGGER_ENGINE] No profile for ${userId}, skipping`);
    return [];
  }

  const firstName = decrypt(profile.firstName);
  const insights = mem?.rawRecords?.top_3_insights || [];
  const careGaps = mem?.rawRecords?.care_gaps || [];
  const hookAnchor = mem?.rawRecords?.hook_anchor || null;
  const firstCallPrep = mem?.tier2?.first_call_prep || null;

  const now = new Date();
  const triggerQueue = [];

  // ── Hour 0: Health Story (Hunt) ──
  if (mem?.tier1 || mem?.tier2) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const storyResult = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{
            text: `Write a brief, warm "Your Health Story" narrative (3-4 sentences) for a patient named ${firstName}. Based on their health data:

Conditions: ${JSON.stringify(mem.tier1?.chronic_conditions || [])}
Medications: ${JSON.stringify(mem.tier2?.active_medications || [])}
Goals: ${JSON.stringify(mem.tier2?.treatment_goals || [])}

Make it personal, positive, and forward-looking. No medical jargon. End with an encouraging note about what their care coordinator will help with. Return just the narrative text, no JSON.`,
          }],
        }],
        generationConfig: { maxOutputTokens: 8192 },
      });

      triggerQueue.push({
        userId,
        type: "health_story",
        hookElement: "hunt",
        title: "Your Health Story",
        body: storyResult.response.text().trim(),
        evidence: { source: "onboarding_compaction" },
        priority: "high",
        scheduledFor: new Date(now.getTime() + 5 * 60 * 1000), // 5 min after onboarding
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        status: "pending",
      });
    }
  }

  // ── Hours 2-6: Health Insights (Hunt) ──
  for (let i = 0; i < Math.min(insights.length, 3); i++) {
    triggerQueue.push({
      userId,
      type: "health_insight",
      hookElement: "hunt",
      title: `Did You Know? (#${i + 1})`,
      body: insights[i],
      evidence: { insight_index: i, source: "compacted_memory" },
      priority: "medium",
      scheduledFor: new Date(now.getTime() + (2 + i * 2) * 60 * 60 * 1000), // hours 2, 4, 6
      expiresAt: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      status: "pending",
    });
  }

  // ── Hours 12-24: Care Gaps (External) ──
  for (let i = 0; i < Math.min(careGaps.length, 2); i++) {
    const gap = careGaps[i];
    triggerQueue.push({
      userId,
      type: "overdue_care",
      hookElement: "external",
      title: gap.type === "screening" ? "Overdue Screening" : "Care Follow-Up",
      body: gap.description,
      evidence: { care_gap: gap, source: "compacted_memory" },
      priority: gap.urgency || "medium",
      scheduledFor: new Date(now.getTime() + (12 + i * 6) * 60 * 60 * 1000), // hours 12, 18
      expiresAt: new Date(now.getTime() + 72 * 60 * 60 * 1000),
      status: "pending",
    });
  }

  // ── Hours 36-48: Ask Your Doctor (Investment) ──
  if (mem?.tier1 || mem?.tier2) {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      const questionsResult = await model.generateContent({
        contents: [{
          role: "user",
          parts: [{
            text: `Based on this patient's health profile, generate 3 specific questions they should ask their doctor at their next visit.

Conditions: ${JSON.stringify(mem.tier1?.chronic_conditions || [])}
Medications: ${JSON.stringify(mem.tier2?.active_medications || [])}
Care gaps: ${JSON.stringify(careGaps)}

Return a JSON array of 3 strings. Each question should be specific to THEIR data, not generic. Example: "My DXA shows Z-score -1.7 at the hip — should we add a bisphosphonate or is strength training sufficient?"`,
          }],
        }],
        generationConfig: {
          maxOutputTokens: 8192,
          responseMimeType: "application/json",
        },
      });

      let questions;
      try {
        questions = JSON.parse(questionsResult.response.text());
      } catch {
        questions = ["Ask about medication interactions", "Ask about screening schedule", "Ask about treatment goals"];
      }

      triggerQueue.push({
        userId,
        type: "ask_your_doctor",
        hookElement: "investment",
        title: "3 Questions for Your Doctor",
        body: questions.map((q, i) => `${i + 1}. ${q}`).join("\n"),
        evidence: { questions, source: "generated" },
        priority: "medium",
        scheduledFor: new Date(now.getTime() + 36 * 60 * 60 * 1000), // hour 36
        expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: "pending",
      });
    }
  }

  // Insert all triggers
  if (triggerQueue.length > 0) {
    await db.insert(triggers).values(triggerQueue);
    console.log(`[TRIGGER_ENGINE] Created ${triggerQueue.length} onboarding triggers for ${userId}`);
  }

  return triggerQueue;
}

// ---------------------------------------------------------------------------
// deliverDueTriggers — Check queue and deliver pending triggers (every minute)
// ---------------------------------------------------------------------------

async function deliverDueTriggers() {
  const now = new Date();

  const dueTriggers = await db.select().from(triggers)
    .where(and(
      eq(triggers.status, "pending"),
      lte(triggers.scheduledFor, now),
    ))
    .orderBy(triggers.scheduledFor)
    .limit(10); // batch size

  for (const trigger of dueTriggers) {
    try {
      // Check quiet hours
      const [prefs] = await db.select().from(userPreferences)
        .where(eq(userPreferences.userId, trigger.userId));
      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, trigger.userId));

      const userTz = profile?.timezone || "America/New_York";
      const quietStart = prefs?.quietStart || "22:00";
      const quietEnd = prefs?.quietEnd || "07:00";

      if (trigger.priority !== "high" && isQuietHours(userTz, quietStart, quietEnd)) {
        // Reschedule to after quiet hours
        const [endH, endM] = quietEnd.split(":").map(Number);
        const tomorrow = new Date(now);
        tomorrow.setHours(endH, endM, 0, 0);
        if (tomorrow <= now) tomorrow.setDate(tomorrow.getDate() + 1);
        await db.update(triggers).set({ scheduledFor: tomorrow }).where(eq(triggers.id, trigger.id));
        continue;
      }

      // Check expiry
      if (trigger.expiresAt && new Date(trigger.expiresAt) < now) {
        await db.update(triggers).set({ status: "expired" }).where(eq(triggers.id, trigger.id));
        continue;
      }

      // Deliver: push notification + in-app message
      await sendPush(trigger.userId, {
        title: trigger.title,
        body: trigger.body.length > 150 ? trigger.body.substring(0, 147) + "..." : trigger.body,
        data: { route: "messages", triggerType: trigger.type },
      });

      // Save as message for in-app display
      await db.insert(messages).values({
        userId: trigger.userId,
        sender: "ai",
        messageType: "nudge",
        content: `**${trigger.title}**\n\n${trigger.body}`,
      });

      await db.update(triggers).set({ status: "delivered" }).where(eq(triggers.id, trigger.id));
      console.log(`[TRIGGER_ENGINE] Delivered trigger ${trigger.id} (${trigger.type}) to ${trigger.userId}`);
    } catch (err) {
      console.error(`[TRIGGER_ENGINE] Failed to deliver trigger ${trigger.id}:`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// generateDailyTriggers — Called from hourly monologue for ongoing engagement
// ---------------------------------------------------------------------------

async function generateDailyTriggers(userId, compactedContext) {
  // Check if we already generated triggers today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayTriggers = await db.select().from(triggers)
    .where(and(
      eq(triggers.userId, userId),
      gte(triggers.createdAt, todayStart),
    ));

  if (todayTriggers.length >= 2) return []; // max 2 per day

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return [];

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{
        text: `Based on this patient's compacted memory, generate 0-1 engagement triggers for today.

${compactedContext || "No compacted context available."}

Only generate a trigger if there's something genuinely interesting or actionable. Don't generate filler.

If you have a trigger, return JSON:
{
  "triggers": [{
    "type": "trend_alert|health_insight|medication_connection",
    "hook_element": "hunt|self|external|investment",
    "title": "Short title (under 50 chars)",
    "body": "2-3 sentence insight or alert",
    "priority": "medium|high"
  }]
}

If nothing worth triggering, return: { "triggers": [] }`,
      }],
    }],
    generationConfig: {
      maxOutputTokens: 8192,
      responseMimeType: "application/json",
    },
  });

  let generated;
  try {
    generated = JSON.parse(result.response.text());
  } catch {
    return [];
  }

  if (!generated.triggers || generated.triggers.length === 0) return [];

  const newTriggers = generated.triggers.map(t => ({
    userId,
    type: t.type,
    hookElement: t.hook_element,
    title: t.title,
    body: t.body,
    priority: t.priority || "medium",
    scheduledFor: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    status: "pending",
  }));

  if (newTriggers.length > 0) {
    await db.insert(triggers).values(newTriggers);
  }

  return newTriggers;
}

// ---------------------------------------------------------------------------
// Helper: quiet hours check (same logic as hourlyMonologue.js)
// ---------------------------------------------------------------------------

function isQuietHours(timezone, quietStart, quietEnd) {
  const nowStr = new Date().toLocaleString("en-US", { timeZone: timezone, hour12: false });
  const now = new Date(nowStr);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const [startH, startM] = quietStart.split(":").map(Number);
  const [endH, endM] = quietEnd.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

module.exports = { generateOnboardingTriggers, deliverDueTriggers, generateDailyTriggers };
