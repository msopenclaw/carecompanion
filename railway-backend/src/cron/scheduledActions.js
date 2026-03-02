const { eq, and, gte } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const { scheduledActions, messages, medications, medicationLogs, vitals } = require("../db/schema");
const { sendPush } = require("../services/pushService");
const { getNotificationContext } = require("../services/userContext");
const { runDailyHookForUser } = require("../services/dailyHookRunner");

let geminiModel = null;
function getModel() {
  if (geminiModel) return geminiModel;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const genAI = new GoogleGenerativeAI(key);
  geminiModel = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
  return geminiModel;
}

/**
 * Runs every minute. Checks for due scheduled actions and fires them.
 * Now with: AI-generated content, context-aware suppression, quiet hours.
 */
async function runScheduledActions() {
  try {
    const allActions = await db.select().from(scheduledActions)
      .where(eq(scheduledActions.isActive, true));

    if (allActions.length === 0) return;

    const now = new Date();
    let fired = 0;

    for (const action of allActions) {
      if (!isDue(action, now)) continue;

      // Check recurrence day for weekly actions
      if (action.recurrence === "weekly" && action.recurrenceDay) {
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const todayName = dayNames[getNowInTimezone(action.timezone).getDay()];
        if (todayName !== action.recurrenceDay.toLowerCase()) continue;
      }

      // Skip weekends for weekday recurrence
      if (action.recurrence === "weekdays") {
        const day = getNowInTimezone(action.timezone).getDay();
        if (day === 0 || day === 6) continue;
      }

      // Context-aware suppression
      const suppressed = await shouldSuppress(action);
      if (suppressed) {
        console.log(`[Scheduler] Suppressed ${action.actionType} for ${action.userId}: ${suppressed}`);
        // Still update lastTriggeredAt so it doesn't re-fire this minute
        await db.update(scheduledActions)
          .set({ lastTriggeredAt: now })
          .where(eq(scheduledActions.id, action.id));
        continue;
      }

      // Hook regeneration — run the daily hook pipeline instead of sending a notification
      if (action.actionType === "hook_regeneration") {
        try {
          await runDailyHookForUser(action.userId, action.label || "scheduled");
          console.log(`[Scheduler] Hook regeneration completed for ${action.userId}`);
        } catch (err) {
          console.error(`[Scheduler] Hook regeneration failed for ${action.userId}:`, err.message);
        }
        await db.update(scheduledActions)
          .set({ lastTriggeredAt: now })
          .where(eq(scheduledActions.id, action.id));
        fired++;
        // Stagger between hook runs (they're expensive)
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      // ── Update lastTriggeredAt FIRST to prevent race condition ──
      // (If two cron ticks fire in the same minute, the second one will see it was already triggered)
      await db.update(scheduledActions)
        .set({ lastTriggeredAt: now })
        .where(eq(scheduledActions.id, action.id));

      // User-requested reminders (via chat "schedule_push") bypass dedup + daily cap
      const isUserRequested = action.actionType === "custom_reminder";

      // Generate AI-personalized content (falls back to static if Gemini unavailable)
      const { title, body, messageType, category } = await getSmartContent(action);

      // Dedup: check if a similar message was already sent in the last 2 hours
      // Skip dedup for user-requested custom reminders
      if (!isUserRequested) {
        const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
        const recentMsgs = await db.select().from(messages)
          .where(and(
            eq(messages.userId, action.userId),
            eq(messages.sender, "ai"),
            gte(messages.createdAt, twoHoursAgo),
          ));
        const bodySnippet = (body || "").substring(0, 40).toLowerCase();
        const isDuplicate = recentMsgs.some(m =>
          (m.content || "").toLowerCase().includes(bodySnippet) && bodySnippet.length > 10
        );
        if (isDuplicate) {
          console.log(`[Scheduler] DEDUPED ${action.actionType} for ${action.userId} — similar message sent recently`);
          fired++;
          continue;
        }
      }

      // Insert message
      await db.insert(messages).values({
        userId: action.userId,
        sender: "ai",
        messageType,
        content: body,
      });

      // Send push notification (bypass daily cap for user-requested reminders)
      await sendPush(action.userId, {
        title,
        body,
        data: {
          route: messageType === "call_request" ? "call" : "messages",
          messageType,
          ...(category ? { category } : {}),
        },
      }, isUserRequested ? { bypass: true } : {});

      // Deactivate one-time actions
      if (action.recurrence === "once") {
        await db.update(scheduledActions)
          .set({ isActive: false })
          .where(eq(scheduledActions.id, action.id));
      }

      fired++;
      console.log(`[Scheduler] Fired ${action.actionType} for ${action.userId}: "${body.substring(0, 60)}..."`);

      // Stagger between users to avoid Gemini rate limits
      if (fired > 0) await new Promise(r => setTimeout(r, 1000));
    }

    if (fired > 0) {
      console.log(`[Scheduler] Fired ${fired} actions`);
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
  }
}

/**
 * Context-aware suppression — skip notifications that are redundant.
 * Returns a reason string if suppressed, null otherwise.
 */
async function shouldSuppress(action) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  // Skip med reminder if patient already confirmed that medication today
  if (action.actionType === "med_reminder") {
    const medName = (action.label || "").toLowerCase();
    const activeMeds = await db.select().from(medications)
      .where(and(eq(medications.patientId, action.userId), eq(medications.isActive, true)));

    const matchedMed = activeMeds.find(m =>
      medName.includes(m.name.toLowerCase()));

    if (matchedMed) {
      const todayLogs = await db.select().from(medicationLogs)
        .where(and(
          eq(medicationLogs.patientId, action.userId),
          eq(medicationLogs.medicationId, matchedMed.id),
          gte(medicationLogs.scheduledAt, todayStart),
        ));
      const taken = todayLogs.some(l => l.status === "taken" || l.status === "late");
      if (taken) return "med already taken today";
    }
  }

  // Skip hydration reminder if patient already hit 64oz goal
  // Note: hydration entries are cumulative (8, 16, 24, 32...), so use max not sum
  if (action.actionType === "hydration_reminder") {
    const todayWater = await db.select().from(vitals)
      .where(and(
        eq(vitals.patientId, action.userId),
        eq(vitals.vitalType, "hydration"),
        gte(vitals.recordedAt, todayStart),
      ));
    const maxOz = todayWater.reduce((mx, v) => Math.max(mx, v.value), 0);
    if (maxOz >= 64) return "hydration goal already met (64+ oz)";
  }

  return null;
}

/**
 * Generate AI-personalized notification content.
 * Falls back to static content if Gemini is unavailable.
 */
async function getSmartContent(action) {
  const model = getModel();

  // Static fallback content
  const fallback = getStaticContent(action);

  if (!model) return fallback;

  try {
    const ctx = await getNotificationContext(action.userId);

    const typeDescriptions = {
      med_reminder: `medication reminder for ${action.label || "their medication"}`,
      hydration_reminder: "hydration nudge",
      checkin_reminder: "daily check-in",
      daily_call: "voice call invitation",
    };

    const prompt = `Generate a short, warm push notification body (max 120 chars) for this patient.

TYPE: ${typeDescriptions[action.actionType] || action.actionType}
PATIENT: ${ctx.firstName}, ${ctx.ageBracket || "adult"}, Week ${ctx.weekNumber || "?"}
MEDICATION: ${ctx.glp1Med || "medication"} ${ctx.glp1Dosage || ""}
SIDE EFFECTS: ${ctx.sideEffects || "none reported"}
GOALS: ${ctx.goals || "not set"}
TODAY SO FAR: ${ctx.medsTakenToday}/${ctx.totalMeds} meds taken, ${ctx.waterToday || 0}oz water
MOOD: ${ctx.recentMood || "not logged"}

Write as ${ctx.coordinatorName || "the care coordinator"}, conversational & encouraging.
${action.actionType === "med_reminder" ? `Mention the specific medication: ${action.label}.` : ""}
${action.actionType === "hydration_reminder" ? `Reference actual intake: ${ctx.waterToday || 0}oz of 64oz goal.` : ""}
${action.actionType === "checkin_reminder" ? "Reference something relevant — their medication week, side effects, or a recent milestone." : ""}
${action.actionType === "daily_call" ? "Invite them to a quick voice check-in with their coordinator." : ""}

Return ONLY the notification body text. No quotes, no prefix.`;

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 80, temperature: 0.7 },
    });

    let aiBody = result.response.text().trim()
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/__(.+?)__/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
    if (aiBody && aiBody.length > 5) {
      return {
        ...fallback,
        body: aiBody.length > 150 ? aiBody.substring(0, 147) + "..." : aiBody,
      };
    }
  } catch (err) {
    console.error(`[Scheduler] AI content generation failed, using fallback:`, err.message);
  }

  return fallback;
}

/**
 * Static fallback notification content (used when Gemini is unavailable).
 */
function getStaticContent(action) {
  switch (action.actionType) {
    case "daily_call":
      return {
        title: "Ready for your daily chat?",
        body: action.label || "Your care coordinator is ready for your check-in.",
        messageType: "call_request",
        category: "CALL_REQUEST",
      };
    case "med_reminder":
      return {
        title: "Medication Reminder",
        body: action.label ? `Time to take ${action.label}` : "Time to take your medication!",
        messageType: "nudge",
        category: "MEDICATION_REMINDER",
      };
    case "hydration_reminder":
      return {
        title: "Hydration Check",
        body: action.label || "How's your water intake? Aim for 64oz today.",
        messageType: "nudge",
        category: "HYDRATION_NUDGE",
      };
    case "checkin_reminder":
      return {
        title: "Check-in Time",
        body: action.label || "How are you feeling today? Open the app to log your vitals.",
        messageType: "check_in",
      };
    default:
      return {
        title: "Reminder",
        body: action.label || "You have a reminder.",
        messageType: "nudge",
      };
  }
}

/**
 * Check if an action is due right now
 */
function isDue(action, now) {
  const localNow = getNowInTimezone(action.timezone);
  const currentHHMM = `${String(localNow.getHours()).padStart(2, "0")}:${String(localNow.getMinutes()).padStart(2, "0")}`;

  if (currentHHMM !== action.scheduledTime) return false;

  // Check if already triggered today
  if (action.lastTriggeredAt) {
    const lastLocal = new Date(action.lastTriggeredAt.toLocaleString("en-US", { timeZone: action.timezone }));
    if (
      lastLocal.getFullYear() === localNow.getFullYear() &&
      lastLocal.getMonth() === localNow.getMonth() &&
      lastLocal.getDate() === localNow.getDate()
    ) {
      return false; // Already fired today
    }

    // Check interval_days (for every_2_days, every_3_days, etc.)
    const intervalDays = action.intervalDays || 1;
    if (intervalDays > 1) {
      const msSinceLast = Date.now() - new Date(action.lastTriggeredAt).getTime();
      const daysSinceLast = msSinceLast / (24 * 60 * 60 * 1000);
      if (daysSinceLast < intervalDays) return false;
    }
  }

  return true;
}

function getNowInTimezone(tz) {
  const str = new Date().toLocaleString("en-US", { timeZone: tz });
  return new Date(str);
}

module.exports = { runScheduledActions };
