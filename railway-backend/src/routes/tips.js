const express = require("express");
const { eq, and } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const { dailyTips, patientMemory } = require("../db/schema");
const { getUserContext } = require("../services/userContext");

const router = express.Router();

// Fallback tips — medication-agnostic, adherence/wellness focused
const FALLBACK_TIPS = [
  "Stay hydrated today — aim for at least 64oz of water. Your body uses it for everything from digestion to focus.",
  "Taking your medications at the same time each day builds a habit loop that sticks. Pick a daily anchor like breakfast or brushing teeth.",
  "A 10-minute walk after your largest meal can improve blood sugar levels for hours. Small moves, real impact.",
  "Track one thing today — even just water or mood. Consistency in logging reveals patterns you'd otherwise miss.",
  "Check in on how you're feeling right now. Emotional awareness is a vital sign too.",
  "Protein at every meal helps maintain muscle and keeps you satisfied longer. Even a handful of nuts counts.",
  "If you missed a dose, don't double up — just take the next one on schedule. Consistency beats perfection.",
  "Sleep is medicine. Even 15 extra minutes tonight can improve how your body processes tomorrow's medications.",
  "Your recent logging streak matters more than any single reading. You're building the data that drives better care.",
  "Small wins compound. One healthy choice today makes tomorrow's healthy choice easier.",
];

// GET /api/tips/today — get today's personalized tip
router.get("/today", async (req, res) => {
  try {
    const userId = req.user.userId;
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    // Check cache first
    const [cached] = await db.select().from(dailyTips)
      .where(and(
        eq(dailyTips.userId, userId),
        eq(dailyTips.tipDate, today),
      ));

    if (cached) {
      // Invalidate stale tips that contain greetings (old prompt format)
      if (/welcome to day|^hi |^hey |^hello |glp.?1|therapy starts/i.test(cached.content)) {
        await db.delete(dailyTips).where(and(
          eq(dailyTips.userId, userId),
          eq(dailyTips.tipDate, today),
        ));
      } else {
        return res.json({ tip: cached.content, cached: true });
      }
    }

    // Generate new tip with Gemini
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      // Fallback to hardcoded
      const dayIndex = Math.floor(Math.random() * FALLBACK_TIPS.length);
      const tip = FALLBACK_TIPS[dayIndex];
      await cacheTip(userId, today, tip);
      return res.json({ tip, cached: false });
    }

    const ctx = await getUserContext(userId);
    const name = ctx.profile?.firstName || "there";
    const meds = ctx.medications || [];
    const sideEffects = (ctx.profile?.currentSideEffects || []).join(", ") || "none reported";
    const recentWeight = ctx.recentVitals.find(v => v.vitalType === "weight");
    const recentHydration = ctx.recentVitals.find(v => v.vitalType === "hydration");
    const goals = (ctx.profile?.goals || []).join(", ") || "general wellness";

    // Fetch pipeline insights
    const pipelineInsights = ctx.insights || [];
    const pipelineCareGaps = ctx.careGaps || [];
    const pipelineHook = ctx.hookAnchor || "";

    const prompt = `Generate a brief, personalized daily health tip for ${name}.

Active medications: ${meds.map(m => `${m.name} ${m.dosage} (${m.frequency})`).join(", ") || "none tracked"}
Side effects: ${sideEffects}
Recent weight: ${recentWeight ? `${recentWeight.value} ${recentWeight.unit}` : "not logged recently"}
Recent hydration: ${recentHydration ? `${recentHydration.value} ${recentHydration.unit}` : "not logged recently"}
Goals: ${goals}
${pipelineInsights.length ? `Key health insights: ${pipelineInsights.join("; ")}` : ""}
${pipelineCareGaps.length ? `Care gaps: ${pipelineCareGaps.map(g => g.description).join("; ")}` : ""}
${pipelineHook ? `Hook anchor (use if relevant): ${pipelineHook}` : ""}

Rules:
- Maximum 2 sentences
- Warm, encouraging, and actionable
- Focus on something they can do TODAY
- Lead with ONE specific detail from their data — create curiosity, not a lecture
- If a care gap exists, gently nudge toward it (no alarm language)
- Don't start with "Tip:" or "Today's tip:"
- Don't include greetings or the patient's name
- Don't use exclamation marks more than once
- Jump straight into the actionable advice`;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const result = await model.generateContent(prompt);
    const tip = result.response.text().trim();

    await cacheTip(userId, today, tip);
    res.json({ tip, cached: false });
  } catch (err) {
    console.error("Tips error:", err);
    // Fallback on any error
    const dayIndex = Math.floor(Math.random() * FALLBACK_TIPS.length);
    res.json({ tip: FALLBACK_TIPS[dayIndex], cached: false });
  }
});

async function cacheTip(userId, tipDate, content) {
  try {
    await db.insert(dailyTips).values({ userId, tipDate, content });
  } catch (err) {
    console.error("Failed to cache tip:", err.message);
  }
}

module.exports = router;
