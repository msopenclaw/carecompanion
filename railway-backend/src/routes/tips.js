const express = require("express");
const { eq, and } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const { dailyTips } = require("../db/schema");
const { getUserContext } = require("../services/userContext");

const router = express.Router();

// Hardcoded fallback tips by treatment week
const FALLBACK_TIPS = [
  "Stay hydrated today! Aim for at least 64oz of water to help your body adjust.",
  "Small, frequent meals can help manage any early nausea. You've got this!",
  "Some mild side effects are normal in the first week. They usually pass quickly.",
  "Keep your meals light and protein-rich — it helps with appetite changes.",
  "Gentle walks after meals can ease any GI discomfort.",
  "You're building great habits! Consistency with logging makes a difference.",
  "Keep tracking your vitals daily. Consistency is key to great results.",
  "Focus on protein at every meal — it helps preserve muscle during weight loss.",
  "Remember to eat slowly and stop when you feel satisfied, not full.",
  "Your body is adapting well. Every small step forward counts.",
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
      if (/welcome to day|^hi |^hey |^hello /i.test(cached.content)) {
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
      const ctx = await getUserContext(userId);
      const dayIndex = Math.min((ctx.glp1DaysSinceStart || 0), FALLBACK_TIPS.length - 1);
      const tip = FALLBACK_TIPS[dayIndex];
      await cacheTip(userId, today, tip);
      return res.json({ tip, cached: false });
    }

    const ctx = await getUserContext(userId);
    const name = ctx.profile?.firstName || "there";
    const day = ctx.glp1DaysSinceStart != null ? ctx.glp1DaysSinceStart + 1 : 1;
    const med = ctx.profile?.glp1Medication || "GLP-1";
    const dose = ctx.profile?.glp1Dosage || "";
    const sideEffects = (ctx.profile?.currentSideEffects || []).join(", ") || "none reported";
    const recentWeight = ctx.recentVitals.find(v => v.vitalType === "weight");
    const recentHydration = ctx.recentVitals.find(v => v.vitalType === "hydration");
    const goals = (ctx.profile?.goals || []).join(", ") || "general wellness";

    const prompt = `Generate a brief, personalized daily health tip for ${name}, who is on Day ${day} of ${med} ${dose} therapy.

Side effects: ${sideEffects}
Recent weight: ${recentWeight ? `${recentWeight.value} ${recentWeight.unit}` : "not logged recently"}
Recent hydration: ${recentHydration ? `${recentHydration.value} ${recentHydration.unit}` : "not logged recently"}
Goals: ${goals}

Rules:
- Maximum 2 sentences
- Warm, encouraging, and actionable
- Focus on something they can do TODAY
- Be specific to their situation (side effects, goals, day of treatment)
- Don't start with "Tip:" or "Today's tip:"
- Don't include greetings, the patient's name, or "Welcome to Day X" — the app already shows that
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
