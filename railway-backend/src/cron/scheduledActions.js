const { eq, and, isNull, lt } = require("drizzle-orm");
const { db } = require("../db");
const { scheduledActions, messages } = require("../db/schema");
const { sendPush } = require("../services/pushService");

/**
 * Runs every minute. Checks for due scheduled actions and fires them.
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

      // Fire the action
      const { title, body, messageType } = getNotificationContent(action);

      // Insert message
      await db.insert(messages).values({
        userId: action.userId,
        sender: "ai",
        messageType,
        content: body,
      });

      // Send push notification
      await sendPush(action.userId, { title, body });

      // Update lastTriggeredAt
      await db.update(scheduledActions)
        .set({ lastTriggeredAt: now })
        .where(eq(scheduledActions.id, action.id));

      // Deactivate one-time actions
      if (action.recurrence === "once") {
        await db.update(scheduledActions)
          .set({ isActive: false })
          .where(eq(scheduledActions.id, action.id));
      }

      fired++;
      console.log(`[Scheduler] Fired ${action.actionType} for user ${action.userId}`);
    }

    if (fired > 0) {
      console.log(`[Scheduler] Fired ${fired} actions`);
    }
  } catch (err) {
    console.error("[Scheduler] Error:", err);
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
  }

  return true;
}

function getNowInTimezone(tz) {
  const str = new Date().toLocaleString("en-US", { timeZone: tz });
  return new Date(str);
}

function getNotificationContent(action) {
  switch (action.actionType) {
    case "daily_call":
      return {
        title: "Time for your check-in",
        body: action.label || "Your care coordinator is ready for your daily check-in. Tap to call.",
        messageType: "call_request",
      };
    case "med_reminder":
      return {
        title: "Medication Reminder",
        body: action.label || "Time to take your medication!",
        messageType: "nudge",
      };
    case "hydration_reminder":
      return {
        title: "Hydration Reminder",
        body: action.label || "Time to drink some water! Aim for 64oz today.",
        messageType: "nudge",
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

module.exports = { runScheduledActions };
