const express = require("express");
const { eq, and, gte, desc, sql } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { db } = require("../db");
const { mealLogs, userProfiles } = require("../db/schema");

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ---------------------------------------------------------------------------
// POST /api/nutrition/analyze — Gemini Vision meal photo analysis
// ---------------------------------------------------------------------------

router.post("/analyze", async (req, res) => {
  try {
    const userId = req.user.userId;
    const { imageBase64, mealType } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "imageBase64 is required" });
    }

    // Strip data URI prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Data,
        },
      },
      {
        text: `Analyze this meal photo. Estimate the total nutritional content.
Return ONLY a JSON object with these exact keys (no markdown, no explanation):
{
  "calories": <number>,
  "proteinG": <number>,
  "carbsG": <number>,
  "fatG": <number>,
  "fiberG": <number>,
  "description": "<brief 3-5 word meal description>"
}`,
      },
    ]);

    const responseText = result.response.text().trim();

    // Parse JSON — strip markdown fences if present
    const jsonStr = responseText.replace(/```json?\s*/g, "").replace(/```\s*/g, "").trim();
    let nutrition;
    try {
      nutrition = JSON.parse(jsonStr);
    } catch {
      console.error("[Nutrition] Failed to parse Gemini response:", responseText);
      return res.status(500).json({ error: "Failed to analyze meal photo" });
    }

    // Insert into meal_logs
    const [meal] = await db.insert(mealLogs).values({
      userId,
      calories: nutrition.calories || 0,
      proteinG: nutrition.proteinG || 0,
      carbsG: nutrition.carbsG || 0,
      fatG: nutrition.fatG || 0,
      fiberG: nutrition.fiberG || 0,
      description: nutrition.description || "Meal",
      mealType: mealType || null,
      source: "photo_ai",
      analyzedAt: new Date(),
    }).returning();

    res.json(meal);
  } catch (err) {
    console.error("[Nutrition] Analyze error:", err);
    res.status(500).json({ error: "Failed to analyze meal" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/nutrition/today — Today's meals + totals
// ---------------------------------------------------------------------------

router.get("/today", async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user timezone
    const [profile] = await db.select({ timezone: userProfiles.timezone })
      .from(userProfiles).where(eq(userProfiles.userId, userId));
    const tz = profile?.timezone || "America/New_York";

    // Compute start of today in user's timezone
    const nowInTz = new Date().toLocaleString("en-US", { timeZone: tz });
    const todayStart = new Date(nowInTz);
    todayStart.setHours(0, 0, 0, 0);
    // Convert back to UTC for DB query
    const offsetMs = new Date().getTime() - new Date(new Date().toLocaleString("en-US", { timeZone: tz })).getTime();
    const todayStartUtc = new Date(todayStart.getTime() + offsetMs);

    const meals = await db.select().from(mealLogs)
      .where(and(eq(mealLogs.userId, userId), gte(mealLogs.createdAt, todayStartUtc)))
      .orderBy(desc(mealLogs.createdAt));

    const totals = {
      calories: meals.reduce((s, m) => s + (m.calories || 0), 0),
      proteinG: meals.reduce((s, m) => s + (m.proteinG || 0), 0),
      carbsG: meals.reduce((s, m) => s + (m.carbsG || 0), 0),
      fatG: meals.reduce((s, m) => s + (m.fatG || 0), 0),
    };

    res.json({ meals, totals });
  } catch (err) {
    console.error("[Nutrition] Today error:", err);
    res.status(500).json({ error: "Failed to fetch nutrition" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/nutrition?range=7 — Meal logs for N days
// ---------------------------------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const range = parseInt(req.query.range || "7", 10);
    const since = new Date(Date.now() - range * 24 * 60 * 60 * 1000);

    const meals = await db.select().from(mealLogs)
      .where(and(eq(mealLogs.userId, userId), gte(mealLogs.createdAt, since)))
      .orderBy(desc(mealLogs.createdAt));

    res.json(meals);
  } catch (err) {
    console.error("[Nutrition] History error:", err);
    res.status(500).json({ error: "Failed to fetch nutrition history" });
  }
});

module.exports = router;
