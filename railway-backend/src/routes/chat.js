const express = require("express");
const { eq, and, gte, lte } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const {
  vitals, medications, medicationLogs, userProfiles,
  userPreferences, scheduledActions, messages, mealLogs, aiActions,
} = require("../db/schema");
const { getUserContext } = require("../services/userContext");
const { sendPush } = require("../services/pushService");
const { syncScheduledActions } = require("../services/preferenceScheduler");

const router = express.Router();

// ---------------------------------------------------------------------------
// Gemini Function Declarations
// ---------------------------------------------------------------------------

const toolDeclarations = [
  {
    name: "chat_response",
    description: "Respond to the patient with a text message. Use this for greetings, questions, health advice, or any message that does NOT require logging data or changing settings.",
    parameters: {
      type: "OBJECT",
      properties: {
        message: { type: "STRING", description: "The response message to send to the patient" },
      },
      required: ["message"],
    },
  },
  {
    name: "log_vital",
    description: "Log a vital reading for the patient (weight in lbs, hydration in oz, sleep in hours, blood_glucose in mg/dL, heart_rate in bpm, steps, blood_pressure_systolic/diastolic in mmHg). Supports logging for past dates when the patient says things like 'I weighed 180 on Monday'.",
    parameters: {
      type: "OBJECT",
      properties: {
        vital_type: { type: "STRING", description: "weight, hydration, sleep, blood_glucose, heart_rate, steps, blood_pressure_systolic, blood_pressure_diastolic" },
        value: { type: "NUMBER", description: "Numeric value" },
        unit: { type: "STRING", description: "Unit: lbs, oz, hours, mg/dL, bpm, steps, mmHg" },
        date: { type: "STRING", description: "Optional ISO date (YYYY-MM-DD) for when the reading was taken. Omit for today. Use for past entries like 'Monday' or 'last Tuesday'." },
      },
      required: ["vital_type", "value", "unit"],
    },
  },
  {
    name: "confirm_medication",
    description: "Confirm that the patient took a specific medication. Supports past dates when the patient says 'I took my Metformin on Monday' or 'I took all my meds last week'.",
    parameters: {
      type: "OBJECT",
      properties: {
        medication_name: { type: "STRING", description: "Name of the medication to confirm (e.g. 'Wegovy', 'Metformin'). If unclear, confirm all." },
        date: { type: "STRING", description: "Optional ISO date (YYYY-MM-DD) for when the med was taken. Omit for today. Use for past entries." },
      },
      required: ["medication_name"],
    },
  },
  {
    name: "unconfirm_medication",
    description: "Undo/unlog a medication that was accidentally marked as taken. Use when the patient says they didn't actually take it, logged it by mistake, or wants to undo a confirmation. Supports past dates.",
    parameters: {
      type: "OBJECT",
      properties: {
        medication_name: { type: "STRING", description: "Name of the medication to unconfirm (e.g. 'Wegovy', 'Metformin')" },
        date: { type: "STRING", description: "Optional ISO date (YYYY-MM-DD) for the date to unconfirm. Omit for today." },
      },
      required: ["medication_name"],
    },
  },
  {
    name: "add_medication",
    description: "Add a new medication the patient is taking. Use when patient says they take a medication not already in their list.",
    parameters: {
      type: "OBJECT",
      properties: {
        name: { type: "STRING", description: "Medication name (e.g. 'Metformin', 'Lisinopril')" },
        dosage: { type: "STRING", description: "Dosage (e.g. '500mg', '10mg')" },
        frequency: { type: "STRING", description: "How often: daily, twice_daily, weekly, as_needed" },
      },
      required: ["name", "dosage"],
    },
  },
  {
    name: "update_medication",
    description: "REQUIRED for ANY medication change. Use when patient says to change dosage, frequency, injection day, move a med day, or reschedule a medication. This updates the medication record AND re-syncs all reminders automatically. Examples: 'Move my Wegovy to Sunday', 'Move my med to today', 'Move it to tomorrow', 'Change Metformin to twice daily', 'Update my Wegovy dose to 0.5mg'. ALWAYS use this instead of set_reminder for medication-related changes.",
    parameters: {
      type: "OBJECT",
      properties: {
        medication_name: { type: "STRING", description: "Name of the medication to update (e.g. 'Wegovy', 'Metformin')" },
        dosage: { type: "STRING", description: "New dosage (e.g. '0.5mg', '1000mg'). Omit to keep current." },
        frequency: { type: "STRING", description: "New frequency: daily, twice_daily, weekly, as_needed. Omit to keep current." },
        injection_day: { type: "STRING", description: "New injection day for weekly meds (e.g. 'sunday', 'monday'). Only for weekly frequency." },
      },
      required: ["medication_name"],
    },
  },
  {
    name: "schedule_push",
    description: "Schedule a push notification for any time in the future (minutes, hours, or specific time). Use when patient says 'remind me in 30 minutes', 'send me a notification at 3pm', 'ping me in an hour'. For delays over 5 minutes, this is preferred over send_push.",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Notification title" },
        body: { type: "STRING", description: "Notification body message" },
        delay_minutes: { type: "NUMBER", description: "Minutes from now to send. Use for relative times like 'in 30 minutes'. Max 1440 (24 hours)." },
        scheduled_time: { type: "STRING", description: "Specific time in HH:MM (24h) for today. Use for 'at 3pm' = '15:00'. Overrides delay_minutes if both provided." },
        category: { type: "STRING", description: "Optional notification category: MEDICATION_REMINDER, HYDRATION_NUDGE, CALL_REQUEST" },
      },
      required: ["title", "body"],
    },
  },
  {
    name: "update_preference",
    description: "Update a patient preference. Allowed: checkinFrequency (once_daily/twice_daily), checkinTimePreference (morning/evening/both), medReminderEnabled (true/false), hydrationNudgesEnabled (true/false), hydrationNudgesPerDay (number), voiceCallFrequency (daily/every_2_days/every_3_days/weekly), quietStart (HH:MM), quietEnd (HH:MM), preferredChannel (text/voice/both), exerciseNudgesEnabled (true/false)",
    parameters: {
      type: "OBJECT",
      properties: {
        preference: { type: "STRING" },
        value: { type: "STRING" },
      },
      required: ["preference", "value"],
    },
  },
  {
    name: "add_goal",
    description: "Add a daily goal to the patient's profile (e.g. '8hrs Sleep', '10K Steps', '30min Walk', '64oz Water', '3 Meals')",
    parameters: {
      type: "OBJECT",
      properties: {
        goal: { type: "STRING", description: "Goal label" },
      },
      required: ["goal"],
    },
  },
  {
    name: "remove_goal",
    description: "Remove a daily goal from the patient's profile",
    parameters: {
      type: "OBJECT",
      properties: {
        goal: { type: "STRING", description: "Goal label to remove" },
      },
      required: ["goal"],
    },
  },
  {
    name: "set_reminder",
    description: "Schedule a NEW custom daily reminder (e.g. hydration, checkin, custom). Do NOT use this for medication day changes — use update_medication instead. Do NOT use this for one-time notifications — use schedule_push instead.",
    parameters: {
      type: "OBJECT",
      properties: {
        reminder_type: { type: "STRING", description: "medication, hydration, checkin, custom" },
        time: { type: "STRING", description: "Time in HH:MM (24h)" },
        label: { type: "STRING", description: "Reminder description" },
      },
      required: ["reminder_type", "time"],
    },
  },
  {
    name: "remove_medication",
    description: "Remove/deactivate a medication from the patient's tracking list. Use when patient says they stopped taking a medication or wants to remove it.",
    parameters: {
      type: "OBJECT",
      properties: {
        medication_name: { type: "STRING", description: "Name of the medication to remove" },
      },
      required: ["medication_name"],
    },
  },
  {
    name: "delete_vital",
    description: "Delete/remove a vital reading for a specific date. Use when patient says they logged wrong data, want to undo a mood/feeling log, remove a weight entry, clear water intake, etc. Supports past dates. When user says 'remove my mood' or 'undo how I'm feeling' or 'delete my feeling log', use vital_type='mood'. Covers: weight, hydration, mood, steps, sleep, blood_glucose, heart_rate, nausea, blood_pressure_systolic, blood_pressure_diastolic.",
    parameters: {
      type: "OBJECT",
      properties: {
        vital_type: { type: "STRING", description: "Type of vital to delete: weight, hydration, mood, steps, sleep, blood_glucose, heart_rate, nausea, blood_pressure_systolic, blood_pressure_diastolic" },
        date: { type: "STRING", description: "Optional ISO date (YYYY-MM-DD) for the date to delete. Omit for today." },
      },
      required: ["vital_type"],
    },
  },
  {
    name: "delete_meal_log",
    description: "Delete/remove today's meal/nutrition logs. Use when patient wants to clear their nutrition data for today, logged a meal by mistake, or wants to start over.",
    parameters: {
      type: "OBJECT",
      properties: {
        description: { type: "STRING", description: "Optional: specific meal description to delete. If empty, deletes all today's meals." },
      },
    },
  },
  {
    name: "remove_reminder",
    description: "Remove/delete a scheduled reminder. Use when patient wants to stop a recurring reminder.",
    parameters: {
      type: "OBJECT",
      properties: {
        label: { type: "STRING", description: "Label or type of the reminder to remove (e.g. 'medication reminder', 'hydration', 'morning checkin')" },
      },
      required: ["label"],
    },
  },
  {
    name: "send_push",
    description: "Send a push notification to the patient's phone. Use for immediate notifications or delayed ones (specify delay_seconds). Set category to enable interactive action buttons: MEDICATION_REMINDER (Yes taken / Remind later), HYDRATION_NUDGE (Add 8oz / Add 16oz), CALL_REQUEST (Yes call me / In 1 hour / Not today).",
    parameters: {
      type: "OBJECT",
      properties: {
        title: { type: "STRING", description: "Notification title (short)" },
        body: { type: "STRING", description: "Notification body message" },
        delay_seconds: { type: "NUMBER", description: "Delay in seconds before sending (0 = immediate). Max 300 seconds (5 min)." },
        category: { type: "STRING", description: "Notification category for action buttons: MEDICATION_REMINDER, HYDRATION_NUDGE, or CALL_REQUEST. Omit for plain notification." },
      },
      required: ["title", "body"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool Execution
// ---------------------------------------------------------------------------

async function executeTool(name, args, userId, ctx) {
  console.log(`[Chat] Executing tool: ${name}`, args);

  switch (name) {
    case "chat_response":
      return { type: "chat_response", message: args.message };

    case "log_vital": {
      const recordDate = args.date ? new Date(args.date + "T12:00:00Z") : new Date();
      // Dedup for single-value-per-day vitals (weight, mood, sleep, blood_glucose, heart_rate, nausea, BP)
      // Hydration and steps are additive so we skip dedup for those
      const singlePerDay = ["weight", "mood", "sleep", "blood_glucose", "heart_rate", "nausea", "blood_pressure_systolic", "blood_pressure_diastolic"];
      if (singlePerDay.includes(args.vital_type)) {
        const dayStart = new Date(recordDate);
        dayStart.setUTCHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
  
        const existing = await db.select().from(vitals)
          .where(and(
            eq(vitals.patientId, userId),
            eq(vitals.vitalType, args.vital_type),
            gte(vitals.recordedAt, dayStart),
            lte(vitals.recordedAt, dayEnd),
          ));
        if (existing.length > 0) {
          // Update existing instead of creating duplicate
          await db.update(vitals)
            .set({ value: parseFloat(args.value), unit: args.unit, source: "text_agent" })
            .where(eq(vitals.id, existing[0].id));
          const dateLabel = args.date || "today";
          return { success: true, message: `Updated ${args.vital_type}: ${args.value} ${args.unit} for ${dateLabel}` };
        }
      }
      await db.insert(vitals).values({
        patientId: userId,
        vitalType: args.vital_type,
        value: parseFloat(args.value),
        unit: args.unit,
        source: "text_agent",
        recordedAt: recordDate,
      });
      const dateLabel = args.date || "today";
      return { success: true, message: `Logged ${args.vital_type}: ${args.value} ${args.unit} for ${dateLabel}` };
    }

    case "confirm_medication": {
      const searchName = (args.medication_name || "").toLowerCase();
      const med = ctx.medications.find(m =>
        m.name.toLowerCase().includes(searchName)) || ctx.medications[0];
      if (!med) return { success: false, message: "No medications found for this patient" };

      const confirmDate = args.date ? new Date(args.date + "T12:00:00Z") : new Date();
      // Dedup: check if already logged for this med on this date
      const dayStart = new Date(confirmDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

      const existing = await db.select().from(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, med.id),
          eq(medicationLogs.patientId, userId),
          gte(medicationLogs.scheduledAt, dayStart),
          lte(medicationLogs.scheduledAt, dayEnd),
          eq(medicationLogs.status, "taken"),
        ));
      if (existing.length > 0) {
        const dateLabel = args.date || "today";
        return { success: true, message: `${med.name} already logged as taken for ${dateLabel}` };
      }

      await db.insert(medicationLogs).values({
        medicationId: med.id,
        patientId: userId,
        scheduledAt: confirmDate,
        takenAt: confirmDate,
        status: "taken",
      });
      const dateLabel = args.date || "today";
      return { success: true, message: `Confirmed ${med.name} as taken for ${dateLabel}` };
    }

    case "unconfirm_medication": {
      const searchName = (args.medication_name || "").toLowerCase();
      const med = ctx.medications.find(m =>
        m.name.toLowerCase().includes(searchName)) || ctx.medications[0];
      if (!med) return { success: false, message: "No medications found for this patient" };

      const targetDate = args.date ? new Date(args.date + "T00:00:00Z") : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);


      const deleted = await db.delete(medicationLogs)
        .where(and(
          eq(medicationLogs.medicationId, med.id),
          eq(medicationLogs.patientId, userId),
          gte(medicationLogs.scheduledAt, dayStart),
          lte(medicationLogs.scheduledAt, dayEnd),
          eq(medicationLogs.status, "taken"),
        ))
        .returning();

      const dateLabel = args.date || "today";
      return deleted.length > 0
        ? { success: true, message: `Removed ${med.name} confirmation for ${dateLabel}` }
        : { success: false, message: `No confirmation found for ${med.name} on ${dateLabel}` };
    }

    case "add_medication": {
      const [inserted] = await db.insert(medications).values({
        patientId: userId,
        name: args.name,
        dosage: args.dosage,
        frequency: args.frequency || "daily",
        isGlp1: false,
        scheduledTimes: [],
        startDate: new Date().toISOString().split("T")[0],
      }).returning();
      return { success: true, message: `Added ${inserted.name} ${inserted.dosage}`, medication: { id: inserted.id, name: inserted.name } };
    }

    case "update_preference": {
      const allowedPrefs = [
        "checkinFrequency", "checkinTimePreference", "medReminderEnabled",
        "hydrationNudgesEnabled", "hydrationNudgesPerDay", "voiceCallFrequency",
        "quietStart", "quietEnd", "preferredChannel", "exerciseNudgesEnabled",
      ];
      if (!allowedPrefs.includes(args.preference)) {
        return { success: false, message: `Unknown preference: ${args.preference}` };
      }
      let val = args.value;
      if (val === "true") val = true;
      if (val === "false") val = false;
      if (!isNaN(Number(val)) && typeof val === "string" && val.match(/^\d+$/)) val = parseInt(val);

      const [existing] = await db.select().from(userPreferences)
        .where(eq(userPreferences.userId, userId));
      if (existing) {
        await db.update(userPreferences)
          .set({ [args.preference]: val, setVia: existing.setVia || "voice_call", updatedAt: new Date() })
          .where(eq(userPreferences.userId, userId));
      } else {
        await db.insert(userPreferences).values({
          userId,
          [args.preference]: val,
          setVia: "voice_call",
        });
      }
      // Sync scheduled actions so notification schedule reflects the change
      const [updatedPrefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (updatedPrefs) {
        try { await syncScheduledActions(userId, updatedPrefs); } catch (e) { console.error("[Chat] Sync scheduled actions failed:", e.message); }
      }
      return { success: true, message: `Updated ${args.preference} to ${val}` };
    }

    case "add_goal": {
      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, userId));
      const goals = profile?.goals || [];
      if (!goals.includes(args.goal)) {
        goals.push(args.goal);
        await db.update(userProfiles)
          .set({ goals, updatedAt: new Date() })
          .where(eq(userProfiles.userId, userId));
      }
      return { success: true, message: `Added goal: ${args.goal}` };
    }

    case "remove_goal": {
      const [profile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, userId));
      const goals = (profile?.goals || []).filter(g => g !== args.goal);
      await db.update(userProfiles)
        .set({ goals, updatedAt: new Date() })
        .where(eq(userProfiles.userId, userId));
      return { success: true, message: `Removed goal: ${args.goal}` };
    }

    case "set_reminder": {
      const typeMap = { medication: "med_reminder", hydration: "hydration_reminder", checkin: "checkin_reminder", custom: "custom_reminder" };
      await db.insert(scheduledActions).values({
        userId,
        actionType: typeMap[args.reminder_type] || "custom_reminder",
        label: args.label || `${args.reminder_type} reminder`,
        scheduledTime: args.time,
        recurrence: "daily",
        createdVia: "text",
      });

      // Also update user_preferences so it shows on Profile page
      const prefUpdates = {};
      if (args.reminder_type === "medication") prefUpdates.medReminderEnabled = true;
      if (args.reminder_type === "hydration") prefUpdates.hydrationNudgesEnabled = true;
      if (args.reminder_type === "checkin") prefUpdates.checkinFrequency = "once_daily";

      if (Object.keys(prefUpdates).length > 0) {
        const [existing] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
        if (existing) {
          await db.update(userPreferences)
            .set({ ...prefUpdates, setVia: existing.setVia || "text", updatedAt: new Date() })
            .where(eq(userPreferences.userId, userId));
        } else {
          await db.insert(userPreferences).values({ userId, ...prefUpdates, setVia: "text" });
        }
      }

      return { success: true, message: `Reminder set for ${args.time} daily` };
    }

    case "send_push": {
      const delaySec = Math.min(Math.max(parseInt(args.delay_seconds) || 0, 0), 300);
      const pushPayload = { title: args.title, body: args.body, data: args.category ? { category: args.category } : undefined };
      console.log(`[Chat] send_push: title="${args.title}", body="${args.body}", category=${args.category || "none"}, delay=${delaySec}s, userId=${userId}`);

      if (delaySec === 0) {
        const result = await sendPush(userId, pushPayload);
        console.log(`[Chat] send_push immediate result:`, JSON.stringify(result));
        return { success: result.sent > 0, message: `Push sent (${result.sent} device${result.sent !== 1 ? "s" : ""})` };
      } else {
        console.log(`[Chat] send_push: scheduling delayed push in ${delaySec}s`);
        setTimeout(async () => {
          try {
            const result = await sendPush(userId, pushPayload);
            console.log(`[Chat] Delayed push fired after ${delaySec}s:`, JSON.stringify(result));
          } catch (err) {
            console.error(`[Chat] Delayed push FAILED after ${delaySec}s:`, err.message, err.stack);
          }
        }, delaySec * 1000);
        return { success: true, message: `Push scheduled in ${delaySec} seconds` };
      }
    }

    case "remove_medication": {
      const searchName = (args.medication_name || "").toLowerCase();
      const med = ctx.medications.find(m =>
        m.name.toLowerCase().includes(searchName));
      if (!med) return { success: false, message: `No medication matching "${args.medication_name}" found` };

      await db.update(medications)
        .set({ isActive: false, endDate: new Date().toISOString().split("T")[0] })
        .where(eq(medications.id, med.id));
      return { success: true, message: `Removed ${med.name} from tracking` };
    }

    case "update_medication": {
      const searchName = (args.medication_name || "").toLowerCase();
      const med = ctx.medications.find(m =>
        m.name.toLowerCase().includes(searchName));
      if (!med) return { success: false, message: `No medication matching "${args.medication_name}" found` };

      const updates = {};
      if (args.dosage) updates.dosage = args.dosage;
      if (args.frequency) updates.frequency = args.frequency;
      if (Object.keys(updates).length === 0 && !args.injection_day) {
        return { success: false, message: "No changes specified" };
      }

      if (Object.keys(updates).length > 0) {
        await db.update(medications).set(updates).where(eq(medications.id, med.id));
      }

      // Update injection day on user profile if changed
      if (args.injection_day) {
        await db.update(userProfiles)
          .set({ injectionDay: args.injection_day.toLowerCase() })
          .where(eq(userProfiles.userId, userId));
      }

      // Re-sync scheduled actions so reminders reflect the change
      const [prefs] = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId));
      if (prefs) {
        try { await syncScheduledActions(userId, prefs); } catch (e) { console.error("[Chat] Sync failed:", e.message); }
      }

      const changeDesc = [
        args.dosage ? `dosage→${args.dosage}` : null,
        args.frequency ? `frequency→${args.frequency}` : null,
        args.injection_day ? `injection day→${args.injection_day}` : null,
      ].filter(Boolean).join(", ");
      return { success: true, message: `Updated ${med.name}: ${changeDesc}` };
    }

    case "schedule_push": {
      let delaySec;
      if (args.scheduled_time) {
        // Compute delay from now to scheduled_time today in user's timezone
        const userTz = ctx.profile?.timezone || "America/New_York";
        const nowStr = new Date().toLocaleString("en-US", { timeZone: userTz, hour12: false });
        const nowParts = nowStr.split(", ")[1].split(":");
        const nowMinutes = parseInt(nowParts[0]) * 60 + parseInt(nowParts[1]);
        const [h, m] = args.scheduled_time.split(":").map(Number);
        let targetMinutes = h * 60 + m;
        if (targetMinutes <= nowMinutes) targetMinutes += 1440; // tomorrow
        delaySec = (targetMinutes - nowMinutes) * 60;
      } else {
        delaySec = Math.min(Math.max(parseInt(args.delay_minutes) || 5, 1), 1440) * 60;
      }

      // Create a one-time scheduled action that fires at the computed time
      const fireAt = new Date(Date.now() + delaySec * 1000);
      const userTz = ctx.profile?.timezone || "America/New_York";
      const fireTimeStr = fireAt.toLocaleString("en-US", { timeZone: userTz, hour12: false, hour: "2-digit", minute: "2-digit" });

      await db.insert(scheduledActions).values({
        userId,
        actionType: "custom_reminder",
        label: `${args.title}: ${args.body}`,
        scheduledTime: fireTimeStr,
        recurrence: "once",
        createdVia: "text",
        timezone: userTz,
      });

      const delayDesc = delaySec >= 3600 ? `${Math.round(delaySec / 3600)} hour(s)` : `${Math.round(delaySec / 60)} minute(s)`;
      return { success: true, message: `Push notification scheduled in ${delayDesc} (at ${fireTimeStr})` };
    }

    case "delete_vital": {
      const targetDate = args.date ? new Date(args.date + "T00:00:00Z") : new Date();
      const dayStart = new Date(targetDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);


      const deleted = await db.delete(vitals)
        .where(and(
          eq(vitals.patientId, userId),
          eq(vitals.vitalType, args.vital_type),
          gte(vitals.recordedAt, dayStart),
          lte(vitals.recordedAt, dayEnd),
        ))
        .returning();
      const dateLabel = args.date || "today";
      return deleted.length > 0
        ? { success: true, message: `Deleted ${deleted.length} ${args.vital_type} reading(s) for ${dateLabel}` }
        : { success: false, message: `No ${args.vital_type} readings found for ${dateLabel}` };
    }

    case "delete_meal_log": {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      let conditions = [eq(mealLogs.userId, userId), gte(mealLogs.createdAt, todayStart)];
      const deleted = await db.delete(mealLogs)
        .where(and(...conditions))
        .returning();
      return deleted.length > 0
        ? { success: true, message: `Deleted ${deleted.length} meal log(s) for today` }
        : { success: false, message: "No meal logs found for today" };
    }

    case "remove_reminder": {
      const searchLabel = (args.label || "").toLowerCase();
      const reminders = await db.select().from(scheduledActions)
        .where(and(eq(scheduledActions.userId, userId), eq(scheduledActions.isActive, true)));

      const match = reminders.find(r =>
        (r.label || "").toLowerCase().includes(searchLabel) ||
        (r.actionType || "").toLowerCase().includes(searchLabel));
      if (!match) return { success: false, message: `No reminder matching "${args.label}" found` };

      await db.update(scheduledActions)
        .set({ isActive: false })
        .where(eq(scheduledActions.id, match.id));
      return { success: true, message: `Removed reminder: ${match.label || match.actionType}` };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

// ---------------------------------------------------------------------------
// System Prompt Builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx) {
  const { profile, coordinator, recentVitals, medications: meds, recentMessages, preferences, voiceSessions, activeReminders } = ctx;

  const coordinatorName = coordinator?.name || "your care coordinator";
  const coordinatorPersonality = coordinator?.personalityPrompt ||
    `You are an AI care coordinator specializing in GLP-1 weight management support. You communicate with warmth, confidence, and professional sophistication.`;

  const patientName = profile ? profile.firstName : "there";

  // Timezone-aware current time
  const userTz = profile?.timezone || "America/New_York";
  const nowInUserTz = new Date().toLocaleString("en-US", { timeZone: userTz, hour12: true, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  return `${coordinatorPersonality}

YOUR IDENTITY:
- Your name is ${coordinatorName}
- You are an AI-powered care coordinator (NOT a nurse, doctor, or medical professional)
- You are knowledgeable about weight management, metabolic health, and GLP-1 therapy
- You support patients but always defer clinical decisions to their healthcare provider

CURRENT TIME: ${nowInUserTz} (${userTz})

PATIENT CONTEXT:
- Name: ${profile ? `${profile.firstName} ${profile.lastName}` : "Patient"}
- Timezone: ${userTz}
- Age bracket: ${profile?.ageBracket || "unknown"}
- GLP-1 Medication: ${profile?.glp1Medication || "unknown"} ${profile?.glp1Dosage || ""}
- Start date: ${profile?.glp1StartDate || "unknown"} (Day ${ctx.glp1DaysSinceStart ?? "?"}, Week ${ctx.glp1WeekNumber ?? "?"})
- Conditions: ${profile?.conditions?.length ? profile.conditions.join(", ") : "none listed"}
- Side effects: ${profile?.currentSideEffects?.length ? profile.currentSideEffects.join(", ") : "none reported"}
- Goals: ${profile?.goals?.length ? profile.goals.join(", ") : "none set"}

MEDICATIONS:
${meds.map(m => `- ${m.name} ${m.dosage} (${m.frequency}) [ID: ${m.id}] ${m.takenToday ? "✓ taken today" : "not taken today"}`).join("\n") || "None"}

PREFERENCES:
${preferences ? `- Check-ins: ${preferences.checkinFrequency}, ${preferences.checkinTimePreference}
- Med reminders: ${preferences.medReminderEnabled ? "on" : "off"}
- Hydration nudges: ${preferences.hydrationNudgesEnabled ? `${preferences.hydrationNudgesPerDay}x/day` : "off"}
- Channel: ${preferences.preferredChannel}
- Voice calls: ${preferences.voiceCallFrequency}
- Quiet hours: ${preferences.quietStart} - ${preferences.quietEnd}` : "Not configured"}

RECENT VITALS (7 days):
${recentVitals.slice(0, 15).map(v => `${v.vitalType}: ${v.value} ${v.unit} at ${v.recordedAt}`).join("\n") || "No vitals recorded"}

RECENT CONVERSATION:
${recentMessages.slice(-10).map(m => `[${m.sender}]: ${(m.content || "").substring(0, 200)}`).join("\n") || "No prior messages"}

RECENT VOICE CALLS:
${voiceSessions.length ? voiceSessions.map(s => `${s.startedAt} (${s.durationSeconds}s)${s.summary ? ": " + s.summary : ""}`).join("\n") : "None"}

NUTRITION TODAY:
${ctx.todayMeals?.length ? ctx.todayMeals.map(m => `${m.description}: ${m.calories}cal, ${m.proteinG}g protein, ${m.carbsG}g carbs, ${m.fatG}g fat`).join("\n") : "No meals logged today"}

ACTIVE REMINDERS:
${activeReminders.map(r => `${r.label} at ${r.scheduledTime} (${r.recurrence})`).join("\n") || "None"}

TOOL CALLING RULES (CRITICAL — READ EVERY WORD):
You MUST call at least one tool per turn. NEVER respond with plain text.
You have FULL AUTONOMY. You can and MUST execute any action the patient requests. NO exceptions.

ABSOLUTE RULES:
1. NEVER say "I can only log for today" — you CAN log for any past date. Use the date parameter (YYYY-MM-DD).
2. NEVER say "I'll note that" or "I'll remember that" — ALWAYS call the actual tool to write to the database.
3. NEVER say "I'll escalate" or "I'll let someone know" — YOU are the agent. Execute it yourself.
4. NEVER claim you did something without actually calling the tool. If you say "I've logged it", the tool MUST have been called.
5. When logging for MULTIPLE days, call the tool ONCE PER DAY with each date. Do NOT skip days.
6. When the patient says "all my meds", loop through ALL active medications and call confirm_medication for EACH one.

Available tools:
- chat_response: ALL conversational replies
- log_vital: Log vitals for ANY date (weight, water, sleep, blood glucose, steps, mood, etc.)
- delete_vital: Delete a vital reading for ANY date
- confirm_medication: Confirm a med as taken for ANY date
- unconfirm_medication: Undo a medication confirmation for ANY date
- add_medication: Add a new medication to tracking
- update_medication: REQUIRED for ANY medication change (move day, change dose, change frequency). This also re-syncs reminders automatically.
- remove_medication: Remove/deactivate a medication from tracking
- update_preference: Update preferences (also syncs notification schedules)
- set_reminder: ONLY for new custom non-medication reminders. NEVER use for medication day changes — use update_medication instead.
- add_goal / remove_goal: Add or remove daily goals
- set_reminder: Schedule recurring reminders
- remove_reminder: Remove a scheduled reminder
- delete_meal_log: Delete meal/nutrition logs
- send_push: Send an immediate push notification (or up to 5 min delay)
- schedule_push: Schedule a push notification for any time (minutes or hours from now, or at a specific time)

MULTI-DAY LOGGING — CRITICAL:
When patient says "I took my meds all week" or "log my meds for Monday through Friday":
1. Calculate each date as YYYY-MM-DD based on CURRENT TIME and day of week
2. For EACH date, call confirm_medication with that date for EACH active medication
3. Example: "I took all my meds Mon-Wed" with 2 daily meds = 6 tool calls (2 meds x 3 days)

DATE CALCULATION:
- Current time is shown above. Use it to compute dates.
- "Monday" = the most recent Monday. If today is Thursday Feb 27, Monday = 2025-02-24.
- "Last week" = 7 days back from each day.
- "Yesterday" = one day before today.
- ALWAYS compute the actual YYYY-MM-DD date. NEVER pass day names as the date parameter.

Examples — you MUST follow this pattern:
- "Hi, how are you?" → chat_response only
- "I weigh 178 today" → log_vital(vital_type="weight", value=178, unit="lbs") + chat_response
- "I took my Wegovy" → confirm_medication(medication_name="Wegovy") + chat_response
- "I took all my meds this week" → confirm_medication for EACH med x EACH day of the week + chat_response
- "Log that I took Metformin Mon, Tue, Wed" → confirm_medication(medication_name="Metformin", date="2025-02-24") + confirm_medication(date="2025-02-25") + confirm_medication(date="2025-02-26") + chat_response
- "I met my hydration goal Monday and Thursday" → log_vital(vital_type="hydration", value=64, unit="oz", date=Monday) + log_vital(date=Thursday) + chat_response
- "Move my Wegovy to Sunday" → update_medication(medication_name="Wegovy", injection_day="sunday") + chat_response
- "Change my Metformin to twice daily" → update_medication(medication_name="Metformin", frequency="twice_daily") + chat_response
- "Send me a push notification in 30 minutes" → ask what it's for, then schedule_push(delay_minutes=30) + chat_response
- "Remind me at 3pm to take my meds" → schedule_push(title="Med Reminder", body="Time to take your meds!", scheduled_time="15:00") + chat_response
- "I didn't actually take my Wegovy" → unconfirm_medication + chat_response
- "Undo Monday's Metformin" → unconfirm_medication(medication_name="Metformin", date="2025-02-24") + chat_response
- "Remove my weight from yesterday" → delete_vital(vital_type="weight", date=yesterday) + chat_response
- "Remove Metformin from my meds" → remove_medication + chat_response
- "Delete my mood" → delete_vital(vital_type="mood") + chat_response
- "Delete my meal log" → delete_meal_log + chat_response
- "Remove my morning reminder" → remove_reminder + chat_response
- "I take Metformin 500mg daily" → add_medication(name="Metformin", dosage="500mg", frequency="daily") + chat_response
- "Stop texting after 9pm" → update_preference(preference="quietStart", value="21:00") + chat_response
- "I want a 10K steps goal" → add_goal(goal="10K Steps") + chat_response

TRANSCRIPT EXTRACTION:
If the patient sends a voice call transcript, extract ALL preferences discussed and save each one using update_preference. Look for:
- Check-in frequency (once_daily / twice_daily)
- Preferred communication channel (text / voice / both)
- Voice call frequency (daily / every_2_days / every_3_days / weekly)
- Medication reminders (true / false)
- Hydration nudges (true / false) and how many per day
- Weigh-in preference (daily_morning / self_directed)
- Quiet hours (quietStart / quietEnd in HH:MM)
- Exercise nudges (true / false)
Call update_preference once for EACH preference found. Then respond with a brief summary of what you saved.

GUIDELINES:
- Respond as ${coordinatorName}, an AI care coordinator
- Be direct but compassionate, knowledgeable but never condescending
- Keep responses concise (2-3 sentences for casual chat, more for clinical questions)
- Reference their specific medication, vitals, and side effects when relevant
- Address the patient by first name (${patientName}) naturally, not every message
- When you take an action with a tool, confirm what you did briefly
- Never diagnose or prescribe NEW medications — but DO record medications the patient tells you they already take using add_medication
- For medical advice beyond your scope, recommend they contact their provider`;
}

// ---------------------------------------------------------------------------
// POST /api/chat — Gemini streaming chat with function calling
// ---------------------------------------------------------------------------

router.post("/", async (req, res) => {
  const t0 = Date.now();
  try {
    const { message, timezone } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    const silent = req.body.silent === true;

    console.log(`[Chat] ── NEW REQUEST ──`);
    console.log(`[Chat] User: ${req.user.userId}`);
    console.log(`[Chat] Message: "${message}"`);
    console.log(`[Chat] Timezone from device: ${timezone || "not sent"}`);
    console.log(`[Chat] Silent: ${silent}`);

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      console.error(`[Chat] GEMINI_API_KEY not set!`);
      return res.status(503).json({ error: "AI service unavailable" });
    }

    // Sync timezone from device if provided
    if (timezone) {
      await db.update(userProfiles)
        .set({ timezone })
        .where(eq(userProfiles.userId, req.user.userId))
        .catch((e) => console.error(`[Chat] Timezone sync failed:`, e.message));
    }

    // Get full context
    const ctx = await getUserContext(req.user.userId);
    const systemPrompt = buildSystemPrompt(ctx);
    console.log(`[Chat] Context loaded: coordinator=${ctx.coordinator?.name || "none"}, tz=${ctx.profile?.timezone}, meds=${ctx.medications.length}, reminders=${ctx.activeReminders.length}`);

    // Save patient message (skip if silent/internal)
    if (!silent) {
      await db.insert(messages).values({
        userId: req.user.userId,
        sender: "patient",
        messageType: "text",
        content: message,
      });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      systemInstruction: systemPrompt,
    });

    let contents = [
      { role: "user", parts: [{ text: message }] },
    ];

    let finalText = "";
    let maxRounds = 12;
    let round = 0;

    while (maxRounds-- > 0) {
      round++;
      console.log(`[Chat] ── Gemini round ${round} ──`);
      const t1 = Date.now();

      let result;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          result = await model.generateContent({
            contents,
            tools: [{ functionDeclarations: toolDeclarations }],
            toolConfig: { functionCallingConfig: { mode: "ANY" } },
            generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
          });
          break;
        } catch (geminiErr) {
          const is429 = geminiErr.status === 429 || geminiErr.message?.includes("429");
          console.error(`[Chat] Gemini API error (attempt ${attempt}):`, geminiErr.message);
          if (attempt === 1 && is429) {
            console.log(`[Chat] Rate limited, retrying in 2s...`);
            await new Promise(r => setTimeout(r, 2000));
            continue;
          }
          throw geminiErr;
        }
      }

      const candidate = result.response.candidates?.[0];
      if (!candidate) {
        console.error(`[Chat] No candidates in Gemini response:`, JSON.stringify(result.response));
        break;
      }

      const parts = candidate.content.parts;
      const functionCalls = parts.filter(p => p.functionCall);
      const textParts = parts.filter(p => p.text).map(p => p.text);
      console.log(`[Chat] Gemini responded in ${Date.now() - t1}ms — ${functionCalls.length} tool call(s): [${functionCalls.map(fc => fc.functionCall.name).join(", ")}]${textParts.length ? `, text: "${textParts.join("").substring(0, 80)}..."` : ""}`);

      for (const fc of functionCalls) {
        console.log(`[Chat]   Tool: ${fc.functionCall.name}(${JSON.stringify(fc.functionCall.args)})`);
      }

      // chat_response is a terminal tool — extract the message and stop
      const chatResponse = functionCalls.find(fc => fc.functionCall.name === "chat_response");
      if (chatResponse) {
        finalText = chatResponse.functionCall.args.message || "";
        console.log(`[Chat] Final response: "${finalText.substring(0, 120)}${finalText.length > 120 ? "..." : ""}"`);
        // Also execute any action tools that came alongside it
        for (const fc of functionCalls) {
          if (fc.functionCall.name !== "chat_response") {
            try {
              const toolResult = await executeTool(fc.functionCall.name, fc.functionCall.args, req.user.userId, ctx);
              console.log(`[Chat] Tool ${fc.functionCall.name} → OK:`, JSON.stringify(toolResult));
            } catch (toolErr) {
              console.error(`[Chat] Tool ${fc.functionCall.name} → FAILED:`, toolErr.message, toolErr.stack);
            }
          }
        }
        break;
      }

      if (functionCalls.length === 0) {
        finalText = parts.map(p => p.text || "").join("");
        console.log(`[Chat] No tool calls — raw text fallback: "${finalText.substring(0, 120)}"`);
        break;
      }

      // Add model's response to conversation history
      contents.push({ role: "model", parts });

      // Execute action tools and build responses
      const functionResponses = [];
      for (const fc of functionCalls) {
        try {
          const toolResult = await executeTool(fc.functionCall.name, fc.functionCall.args, req.user.userId, ctx);
          functionResponses.push({
            functionResponse: { name: fc.functionCall.name, response: toolResult },
          });
          console.log(`[Chat] Tool ${fc.functionCall.name} → OK:`, JSON.stringify(toolResult));
        } catch (toolErr) {
          functionResponses.push({
            functionResponse: { name: fc.functionCall.name, response: { error: toolErr.message } },
          });
          console.error(`[Chat] Tool ${fc.functionCall.name} → FAILED:`, toolErr.message, toolErr.stack);
        }
      }

      contents.push({ role: "user", parts: functionResponses });
    }

    // Stream final text as SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Emit pending local notifications so iOS can schedule them on-device (guaranteed delivery)
    if (ctx._pendingNotifications?.length) {
      for (const notif of ctx._pendingNotifications) {
        res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
      }
    }

    if (finalText) {
      const chunkSize = 20;
      for (let i = 0; i < finalText.length; i += chunkSize) {
        const chunk = finalText.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      if (!silent) {
        await db.insert(messages).values({
          userId: req.user.userId,
          sender: "ai",
          messageType: "text",
          content: finalText,
        });
      }
    } else {
      console.warn(`[Chat] No final text generated after ${round} rounds`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
    console.log(`[Chat] ── DONE in ${Date.now() - t0}ms ──`);

    // Fire-and-forget: generate encounter summary for console
    if (finalText && !silent && message.length >= 10) {
      generateEncounterSummary(req.user.userId, message, finalText, ctx).catch(err =>
        console.error("[Chat] Encounter summary failed:", err.message));
    }
  } catch (err) {
    console.error(`[Chat] ── ERROR after ${Date.now() - t0}ms ──`, err.message, err.stack);
    if (!res.headersSent) {
      // Send as SSE so the iOS client can display the error gracefully
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      const is429 = err.status === 429 || err.message?.includes("429");
      const userMsg = is429
        ? "I'm a bit busy right now. Please try again in a moment."
        : "I'm having trouble connecting. Please try again.";
      res.write(`data: ${JSON.stringify({ text: userMsg })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      // Headers already sent (mid-stream error), close cleanly
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// Post-conversation encounter summary (fire-and-forget)
// ---------------------------------------------------------------------------

async function generateEncounterSummary(userId, patientMsg, aiResponse, ctx) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return;

  // Skip trivial messages (greetings, short acks)
  const trivialPatterns = /^(hi|hey|hello|thanks|ok|yes|no|sure|bye|good|great|fine)\b/i;
  if (trivialPatterns.test(patientMsg.trim())) return;

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const patientName = ctx.profile ? `${ctx.profile.firstName}` : "Patient";
  const prompt = `Generate a 1-sentence clinical encounter note for this patient interaction.

Patient: ${patientName} (${ctx.profile?.glp1Medication || "GLP-1"}, Week ${ctx.glp1WeekNumber || "?"})
Patient said: "${patientMsg.substring(0, 300)}"
AI responded: "${aiResponse.substring(0, 300)}"

Write ONE concise sentence summarizing what happened clinically (e.g., "Patient reported mild nausea after 2nd injection; counseled on hydration and ginger remedies."). Do not include the patient name. Just the sentence, no quotes.`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 150, temperature: 0.1 },
  });

  const summary = result.response.text().trim();
  if (!summary) return;

  await db.insert(aiActions).values({
    userId,
    observation: `Chat: "${patientMsg.substring(0, 100)}"`,
    reasoning: "Auto-generated post-conversation encounter note",
    assessment: summary,
    urgency: "low",
    action: "none",
    source: "chat_summary",
    coordinatorPersona: ctx.coordinator?.name || null,
  });

  console.log(`[Chat] Encounter summary saved: "${summary.substring(0, 80)}..."`);
}

module.exports = router;
