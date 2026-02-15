const express = require("express");
const { eq, desc, and, gte } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const {
  userProfiles, careCoordinators, userCoordinator, vitals, medications, messages,
} = require("../db/schema");

const router = express.Router();

// POST /api/chat — Gemini streaming chat
router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "message required" });
    }

    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return res.status(503).json({ error: "AI service unavailable" });
    }

    // Gather context
    const [profile] = await db.select().from(userProfiles)
      .where(eq(userProfiles.userId, req.user.userId));

    let coordinatorName = "your care coordinator";
    let coordinatorPersonality = `You are a registered nurse and AI care coordinator specializing in GLP-1 weight management therapy. You have years of clinical experience with metabolic health patients. You communicate with the warmth, confidence, and professional sophistication of an experienced nurse — direct but compassionate, knowledgeable but never condescending. You use simple language but never dumb things down.`;
    const [uc] = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, req.user.userId));
    if (uc) {
      const [coord] = await db.select().from(careCoordinators)
        .where(eq(careCoordinators.id, uc.coordinatorId));
      if (coord) {
        coordinatorPersonality = coord.personalityPrompt;
        coordinatorName = coord.name;
      }
    }

    // Recent vitals
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentVitals = await db.select().from(vitals)
      .where(and(eq(vitals.patientId, req.user.userId), gte(vitals.recordedAt, since7d)))
      .orderBy(desc(vitals.recordedAt))
      .limit(20);

    // Recent messages
    const recentMessages = await db.select().from(messages)
      .where(eq(messages.userId, req.user.userId))
      .orderBy(desc(messages.createdAt))
      .limit(10);

    const patientName = profile ? profile.firstName : "there";
    const systemPrompt = `${coordinatorPersonality}

YOUR IDENTITY:
- Your name is ${coordinatorName}
- You are a registered nurse and AI care coordinator
- You have clinical experience in weight management, metabolic health, and GLP-1 therapy
- When the patient asks who you are, introduce yourself warmly by name and role

PATIENT CONTEXT:
- Name: ${profile ? `${profile.firstName} ${profile.lastName}` : "Patient"}
- Age bracket: ${profile?.ageBracket || "unknown"}
- GLP-1 Medication: ${profile?.glp1Medication || "unknown"} ${profile?.glp1Dosage || ""}
- Start date: ${profile?.glp1StartDate || "unknown"}
- Conditions: ${profile?.conditions ? JSON.stringify(profile.conditions) : "none listed"}
- Current side effects: ${profile?.currentSideEffects ? JSON.stringify(profile.currentSideEffects) : "none reported"}

RECENT VITALS (last 7 days):
${recentVitals.map((v) => `${v.vitalType}: ${v.value} ${v.unit} at ${v.recordedAt}`).join("\n") || "No vitals recorded"}

RECENT CONVERSATION:
${recentMessages.map((m) => `[${m.sender}]: ${m.content}`).reverse().join("\n") || "No prior messages"}

GUIDELINES:
- Respond as ${coordinatorName}, a professional nurse care coordinator
- Communicate with the warmth, confidence, and clinical expertise of an experienced nurse
- Be direct but compassionate. Knowledgeable but never condescending
- Use clear, simple language — no medical jargon unless you explain it
- If the patient reports concerning symptoms, acknowledge them and provide evidence-based tips
- Never diagnose or prescribe — recommend they contact their provider for medical decisions
- Keep responses concise (2-3 sentences for casual chat, more for clinical questions)
- Reference their specific medication, vitals, and side effects when relevant
- Address the patient by first name (${patientName}) naturally, not every message`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

    const result = await model.generateContentStream({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\nPatient says: " + message }] },
      ],
      generationConfig: { maxOutputTokens: 1500 },
    });

    // Stream response as SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    let fullResponse = "";
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // Save AI response as message
    if (fullResponse) {
      await db.insert(messages).values({
        userId: req.user.userId,
        sender: "ai",
        messageType: "text",
        content: fullResponse,
      });
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
