const { eq, and } = require("drizzle-orm");
const { db } = require("../db");
const { scheduledActions, userProfiles, medications } = require("../db/schema");

const DAY_ORDER = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getDayBefore(day) {
  const idx = DAY_ORDER.indexOf(day.toLowerCase());
  return DAY_ORDER[idx <= 0 ? 6 : idx - 1];
}

/**
 * Sync scheduled_actions rows based on user preferences.
 * Called after POST /api/preferences upsert.
 * Deactivates old preference-created actions, then creates new ones.
 */
async function syncScheduledActions(userId, prefs) {
  // 1. Deactivate all existing preference-created actions
  await db.update(scheduledActions)
    .set({ isActive: false })
    .where(and(
      eq(scheduledActions.userId, userId),
      eq(scheduledActions.createdVia, "preferences")
    ));

  // Fetch user profile (timezone, injection day) and active medications
  const [[profile], meds] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
    db.select().from(medications)
      .where(and(eq(medications.patientId, userId), eq(medications.isActive, true))),
  ]);
  const userTimezone = profile?.timezone || "America/New_York";

  const rows = [];
  const quietEnd = prefs.quietEnd || "07:00";
  const quietStart = prefs.quietStart || "22:00";

  // 2. Check-in reminders
  const timePref = prefs.checkinTimePreference || "morning";
  if (timePref === "morning" || timePref === "both") {
    rows.push({
      userId,
      actionType: "checkin_reminder",
      label: "Morning check-in — how are you feeling?",
      scheduledTime: quietEnd, // schedule at wake time
      recurrence: "daily",
      createdVia: "preferences",
    });
  }
  if (timePref === "evening" || timePref === "both") {
    rows.push({
      userId,
      actionType: "checkin_reminder",
      label: "Evening check-in — how was your day?",
      scheduledTime: "18:00",
      recurrence: "daily",
      createdVia: "preferences",
    });
  }

  // 3. Medication reminders — frequency-aware per medication
  if (prefs.medReminderEnabled && meds.length > 0) {
    for (const med of meds) {
      if (med.frequency === "weekly") {
        // Weekly medication (e.g., Wegovy) — only on injection day
        const injDay = (profile?.injectionDay || "friday").toLowerCase();
        rows.push({
          userId,
          actionType: "med_reminder",
          label: `${med.name} ${med.dosage}`,
          scheduledTime: "09:00",
          recurrence: "weekly",
          recurrenceDay: injDay,
          createdVia: "preferences",
        });
        // Night-before prep reminder
        if (prefs.medReminderPrepNightBefore) {
          rows.push({
            userId,
            actionType: "med_reminder",
            label: `Prep ${med.name} for tomorrow`,
            scheduledTime: "20:00",
            recurrence: "weekly",
            recurrenceDay: getDayBefore(injDay),
            createdVia: "preferences",
          });
        }
      } else if (med.frequency === "twice_daily") {
        rows.push({
          userId,
          actionType: "med_reminder",
          label: `${med.name} ${med.dosage} (morning)`,
          scheduledTime: "09:00",
          recurrence: "daily",
          createdVia: "preferences",
        });
        rows.push({
          userId,
          actionType: "med_reminder",
          label: `${med.name} ${med.dosage} (evening)`,
          scheduledTime: "18:00",
          recurrence: "daily",
          createdVia: "preferences",
        });
      } else {
        // Daily (default)
        rows.push({
          userId,
          actionType: "med_reminder",
          label: `${med.name} ${med.dosage}`,
          scheduledTime: "09:00",
          recurrence: "daily",
          createdVia: "preferences",
        });
      }
    }
  }

  // 4. Hydration nudges — spread evenly between wake and quiet hours
  if (prefs.hydrationNudgesEnabled) {
    const count = prefs.hydrationNudgesPerDay || 3;
    const startHour = parseInt(quietEnd.split(":")[0]);
    const endHour = parseInt(quietStart.split(":")[0]);
    const span = endHour - startHour;
    const interval = Math.max(1, Math.floor(span / (count + 1)));

    for (let i = 1; i <= count; i++) {
      const hour = startHour + interval * i;
      if (hour >= endHour) break;
      rows.push({
        userId,
        actionType: "hydration_reminder",
        label: "Time to drink some water!",
        scheduledTime: `${String(hour).padStart(2, "0")}:00`,
        recurrence: "daily",
        createdVia: "preferences",
      });
    }
  }

  // 5. Voice call schedule (only if channel includes voice)
  if (prefs.preferredChannel !== "text") {
    const freq = prefs.voiceCallFrequency || "every_2_days";
    const intervalMap = { daily: 1, every_2_days: 2, every_3_days: 3, weekly: 7 };
    rows.push({
      userId,
      actionType: "daily_call",
      label: "Scheduled check-in call",
      scheduledTime: "10:00",
      recurrence: freq === "weekly" ? "weekly" : "daily",
      recurrenceDay: freq === "weekly" ? "monday" : null,
      intervalDays: intervalMap[freq] || 2,
      createdVia: "preferences",
    });
  }

  // 6. Set timezone on all rows and bulk insert
  for (const row of rows) {
    row.timezone = userTimezone;
  }
  if (rows.length > 0) {
    await db.insert(scheduledActions).values(rows);
  }

  console.log(`[PreferenceScheduler] Created ${rows.length} scheduled actions for user ${userId} (${meds.length} meds)`);
  return rows.length;
}

module.exports = { syncScheduledActions };
