const express = require("express");
const { eq } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const {
  vitals, medications, medicationLogs, userProfiles,
  userPreferences, scheduledActions, messages,
} = require("../db/schema");
const { getUserContext } = require("../services/userContext");

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
    description: "Log a vital reading for the patient (weight in lbs, hydration in oz, sleep in hours, blood_glucose in mg/dL, heart_rate in bpm, steps, blood_pressure_systolic/diastolic in mmHg)",
    parameters: {
      type: "OBJECT",
      properties: {
        vital_type: { type: "STRING", description: "weight, hydration, sleep, blood_glucose, heart_rate, steps, blood_pressure_systolic, blood_pressure_diastolic" },
        value: { type: "NUMBER", description: "Numeric value" },
        unit: { type: "STRING", description: "Unit: lbs, oz, hours, mg/dL, bpm, steps, mmHg" },
      },
      required: ["vital_type", "value", "unit"],
    },
  },
  {
    name: "confirm_medication",
    description: "Confirm that the patient took a specific medication today. Use the medication_id from the context, or leave empty to confirm all.",
    parameters: {
      type: "OBJECT",
      properties: {
        medication_name: { type: "STRING", description: "Name of the medication to confirm (e.g. 'Wegovy', 'Metformin'). If unclear, confirm all." },
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
    description: "Schedule a daily reminder for the patient",
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
      await db.insert(vitals).values({
        patientId: userId,
        vitalType: args.vital_type,
        value: parseFloat(args.value),
        unit: args.unit,
        source: "text_agent",
        recordedAt: new Date(),
      });
      return { success: true, message: `Logged ${args.vital_type}: ${args.value} ${args.unit}` };
    }

    case "confirm_medication": {
      const searchName = (args.medication_name || "").toLowerCase();
      const med = ctx.medications.find(m =>
        m.name.toLowerCase().includes(searchName)) || ctx.medications[0];
      if (!med) return { success: false, message: "No medications found for this patient" };

      await db.insert(medicationLogs).values({
        medicationId: med.id,
        patientId: userId,
        scheduledAt: new Date(),
        takenAt: new Date(),
        status: "taken",
      });
      return { success: true, message: `Confirmed ${med.name} as taken` };
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

  return `${coordinatorPersonality}

YOUR IDENTITY:
- Your name is ${coordinatorName}
- You are an AI-powered care coordinator (NOT a nurse, doctor, or medical professional)
- You are knowledgeable about weight management, metabolic health, and GLP-1 therapy
- You support patients but always defer clinical decisions to their healthcare provider

PATIENT CONTEXT:
- Name: ${profile ? `${profile.firstName} ${profile.lastName}` : "Patient"}
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
${recentVitals.map(v => `${v.vitalType}: ${v.value} ${v.unit} at ${v.recordedAt}`).join("\n") || "No vitals recorded"}

RECENT CONVERSATION:
${recentMessages.map(m => `[${m.sender}]: ${m.content}`).join("\n") || "No prior messages"}

RECENT VOICE CALLS:
${voiceSessions.length ? voiceSessions.map(s => `${s.startedAt} (${s.durationSeconds}s)${s.summary ? ": " + s.summary : ""}`).join("\n") : "None"}

ACTIVE REMINDERS:
${activeReminders.map(r => `${r.label} at ${r.scheduledTime} (${r.recurrence})`).join("\n") || "None"}

TOOL CALLING RULES (CRITICAL):
You MUST call at least one tool per turn. NEVER respond with plain text.
When the patient mentions ANY of these, you MUST call the corresponding action tool AND chat_response:
- Mentions taking a medication → MUST call add_medication (this records it for tracking, NOT a prescription)
- Reports a vital (weight, water, sleep, steps) → MUST call log_vital
- Says they took a med → MUST call confirm_medication
- Wants to change a preference → MUST call update_preference
- Mentions a goal → MUST call add_goal or remove_goal

NEVER just "note" or "remember" something — always call the tool to save it to the database.
NEVER say you will "escalate", "forward to a team", "pass it along", or "let someone know".
You have FULL authority to execute ALL tools. Act immediately.

Available tools:
- chat_response: ALL conversational replies
- log_vital: Log vitals (weight, water, sleep, blood glucose, etc.)
- confirm_medication: Confirm a med as taken today
- add_medication: Add a medication to tracking (name, dosage, frequency). ALWAYS use this when patient mentions a medication they take.
- update_preference: Update preferences
- add_goal / remove_goal: Add or remove daily goals (e.g. "10K Steps", "8hrs Sleep", "64oz Water", "30min Walk")
- set_reminder: Schedule reminders

Examples — you MUST follow this pattern:
- "Hi, how are you?" → chat_response only
- "I weigh 178 today" → log_vital(vital_type="weight", value=178, unit="lbs") + chat_response
- "I took my Wegovy" → confirm_medication + chat_response
- "I take Metformin 500mg daily" → add_medication(name="Metformin", dosage="500mg", frequency="daily") + chat_response
- "I also take Lisinopril 10mg" → add_medication(name="Lisinopril", dosage="10mg", frequency="daily") + chat_response
- "I take Metformin and Lisinopril" → add_medication for EACH one + chat_response
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
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });
    const silent = req.body.silent === true; // silent = don't save messages to DB

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) return res.status(503).json({ error: "AI service unavailable" });

    // Get full context
    const ctx = await getUserContext(req.user.userId);
    const systemPrompt = buildSystemPrompt(ctx);

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

    // Multi-turn function calling loop (mode=ANY forces tool use every turn)
    let contents = [
      { role: "user", parts: [{ text: message }] },
    ];

    let finalText = "";
    let maxRounds = 5;

    while (maxRounds-- > 0) {
      const result = await model.generateContent({
        contents,
        tools: [{ functionDeclarations: toolDeclarations }],
        toolConfig: { functionCallingConfig: { mode: "ANY" } },
        generationConfig: { maxOutputTokens: 1500, temperature: 0.2 },
      });
      const parts = result.response.candidates[0].content.parts;

      const functionCalls = parts.filter(p => p.functionCall);
      console.log(`[Chat] Gemini returned ${functionCalls.length} tool call(s):`, functionCalls.map(fc => fc.functionCall.name).join(", "));

      // chat_response is a terminal tool — extract the message and stop
      const chatResponse = functionCalls.find(fc => fc.functionCall.name === "chat_response");
      if (chatResponse) {
        finalText = chatResponse.functionCall.args.message || "";
        // Also execute any action tools that came alongside it
        for (const fc of functionCalls) {
          if (fc.functionCall.name !== "chat_response") {
            try {
              const toolResult = await executeTool(fc.functionCall.name, fc.functionCall.args, req.user.userId, ctx);
              console.log(`[Chat] Tool ${fc.functionCall.name} result:`, toolResult);
            } catch (toolErr) {
              console.error(`[Chat] Tool ${fc.functionCall.name} failed:`, toolErr);
            }
          }
        }
        break;
      }

      if (functionCalls.length === 0) {
        // Fallback: model returned text without tool call (shouldn't happen with ANY)
        finalText = parts.map(p => p.text || "").join("");
        break;
      }

      // Add model's response to conversation history
      contents.push({ role: "model", parts });

      // Execute action tools and build responses
      const functionResponses = [];
      for (const fc of functionCalls) {
        const toolResult = await executeTool(
          fc.functionCall.name,
          fc.functionCall.args,
          req.user.userId,
          ctx,
        );
        functionResponses.push({
          functionResponse: { name: fc.functionCall.name, response: toolResult },
        });
        console.log(`[Chat] Tool ${fc.functionCall.name} result:`, toolResult);
      }

      contents.push({ role: "user", parts: functionResponses });
    }

    // Stream final text as SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (finalText) {
      // Send in chunks for streaming feel
      const chunkSize = 20;
      for (let i = 0; i < finalText.length; i += chunkSize) {
        const chunk = finalText.slice(i, i + chunkSize);
        res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
      }

      // Save AI response (skip if silent/internal)
      if (!silent) {
        await db.insert(messages).values({
          userId: req.user.userId,
          sender: "ai",
          messageType: "text",
          content: finalText,
        });
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("Chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Chat failed" });
    }
  }
});

module.exports = router;
