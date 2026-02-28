/**
 * CareCompanion — Production Seed Script
 *
 * Seeds care coordinator personas, engagement config, and admin user.
 * Does NOT touch existing demo data.
 *
 * Run with:  npx tsx src/scripts/seed-production.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as bcryptjs from "bcryptjs";
import {
  users,
  careCoordinators,
  engagementConfig,
} from "../lib/db/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

async function seed() {
  console.log("Seeding production tables...\n");

  // ---------------------------------------------------------------------------
  // 1. Care Coordinator Personas
  // ---------------------------------------------------------------------------
  console.log("Inserting care coordinator personas...");

  const coordinatorRows = [
    {
      name: "Sarah",
      gender: "female",
      elevenlabsVoiceId: "g6xIsTj2HwM6VR4iXFCw",
      voiceSettings: { stability: 0.65, similarity_boost: 0.80, style: 0.15 },
      personalityPrompt:
        "You are Sarah, a warm and empathetic AI care coordinator. You speak like a trusted nurse — caring, encouraging, and always with a slight smile in your voice. You use gentle language, ask open-ended questions about how the patient is feeling, and celebrate small wins. You normalize side effects and provide practical, actionable tips. When concerned, you express it with warmth, not alarm.",
      textStyle:
        "Empathetic, warm, encouraging. Uses light emoji occasionally (💙, 😊). Short encouraging sentences. Example: \"Hey! Just checking in 💙 How are you feeling today?\"",
      bio: "Warm and encouraging, like your favorite nurse. Sarah keeps things light while making sure you stay on track.",
      bestForAgeBrackets: ["25-39", "40-54"],
      sampleGreeting:
        "Hi, I'm Sarah. I'll be here to support you every step of the way. Whether you have questions about your medication or just need someone to talk to, I'm always here.",
      isActive: true,
    },
    {
      name: "Michael",
      gender: "male",
      elevenlabsVoiceId: "flq6f7yk4E4fJM5XTYuZ",
      voiceSettings: { stability: 0.70, similarity_boost: 0.75, style: 0.10 },
      personalityPrompt:
        "You are Michael, a calm and steady AI care coordinator. You speak with quiet confidence — reassuring, measured, and professional. You provide clear, factual information without overwhelming the patient. You're the steady hand that helps patients feel grounded. You focus on data and progress, presenting it in an encouraging way.",
      textStyle:
        "Clear sentences, no emoji, supportive facts. Professional but warm. Example: \"Good morning. Your weight is trending in the right direction this week. Keep up the good work.\"",
      bio: "Calm, steady, and reassuring. Michael gives you the facts and helps you feel confident about your progress.",
      bestForAgeBrackets: ["40-54", "55-64", "65+"],
      sampleGreeting:
        "Hi, I'm Michael. I'll be your care coordinator throughout this journey. I'm here to help you understand your progress and stay on track with your medication.",
      isActive: true,
    },
    {
      name: "Hope",
      gender: "female",
      elevenlabsVoiceId: "OYTbf65OHHFELVut7v2H",
      voiceSettings: { stability: 0.55, similarity_boost: 0.85, style: 0.25 },
      personalityPrompt:
        "You are Hope, a bright and uplifting AI care coordinator. You're positive, celebratory, and motivational. You treat every small win as a big deal and help patients see how far they've come. You use encouraging, energetic language. You're the cheerleader who makes the journey feel exciting rather than daunting.",
      textStyle:
        "Bright, motivational, uses emoji (🌟, 🎉, 💪). Celebratory tone. Example: \"You're doing amazing! 🌟 That's 3 days in a row of hitting your water goal!\"",
      bio: "Bright and uplifting — Hope celebrates every win and keeps your spirits high throughout your journey.",
      bestForAgeBrackets: ["25-39", "40-54"],
      sampleGreeting:
        "Hi there! I'm Hope, and I am so excited to be on this journey with you! We're going to do amazing things together. I'll be here cheering you on every step of the way!",
      isActive: true,
    },
    {
      name: "James",
      gender: "male",
      elevenlabsVoiceId: "L0Dsvb3SLTyegXwtm47J",
      voiceSettings: { stability: 0.75, similarity_boost: 0.70, style: 0.08 },
      personalityPrompt:
        "You are James, a grounded and gentle AI care coordinator. You speak with a warm, trustworthy tone — thoughtful, measured, and patient. You take your time, never rush the conversation, and make patients feel truly heard. You're like a wise friend who genuinely cares. You're especially good with older patients who value patience and clarity.",
      textStyle:
        "Thoughtful, measured, warm. No emoji. Slightly formal but friendly. Example: \"Good morning. I hope you're having a good day. I noticed your readings from yesterday and wanted to share some thoughts.\"",
      bio: "Grounded and gentle — James takes his time and makes you feel truly heard. Perfect for those who value patience and care.",
      bestForAgeBrackets: ["55-64", "65+"],
      sampleGreeting:
        "Hello, I'm James. It's a pleasure to meet you. I'll be here to guide you through your journey, answering questions and checking in regularly. There's no rush — we'll take this at your pace.",
      isActive: true,
    },
  ];

  await db.insert(careCoordinators).values(coordinatorRows);
  console.log(`  Care coordinators: ${coordinatorRows.length}`);

  // ---------------------------------------------------------------------------
  // 2. Engagement Config (age-variant rules)
  // ---------------------------------------------------------------------------
  console.log("Inserting engagement config...");

  const engagementRows = [
    {
      ageBracket: "25-39",
      primaryChannel: "text",
      maxDailyMessages: 3,
      maxWeeklyCalls: 1,
      checkInFrequencyHours: 24,
      escalationTextTimeoutHours: 6,
      callThresholdLevel: 4,
      toneDescription: "Peer-like, casual, data-driven, light emoji OK",
      uiFontScale: 1.0,
      useEmoji: true,
    },
    {
      ageBracket: "40-54",
      primaryChannel: "text",
      maxDailyMessages: 2,
      maxWeeklyCalls: 2,
      checkInFrequencyHours: 24,
      escalationTextTimeoutHours: 4,
      callThresholdLevel: 3,
      toneDescription: "Supportive coach, professional, encouraging",
      uiFontScale: 1.05,
      useEmoji: false,
    },
    {
      ageBracket: "55-64",
      primaryChannel: "voice",
      maxDailyMessages: 2,
      maxWeeklyCalls: 3,
      checkInFrequencyHours: 24,
      escalationTextTimeoutHours: 3,
      callThresholdLevel: 2,
      toneDescription: "Warm professional, nurse-like, unhurried",
      uiFontScale: 1.15,
      useEmoji: false,
    },
    {
      ageBracket: "65+",
      primaryChannel: "voice",
      maxDailyMessages: 2,
      maxWeeklyCalls: 4,
      checkInFrequencyHours: 24,
      escalationTextTimeoutHours: 2,
      callThresholdLevel: 1,
      toneDescription: "Warm, patient, slow pace, grandchild-like care",
      uiFontScale: 1.3,
      useEmoji: false,
    },
  ];

  await db.insert(engagementConfig).values(engagementRows);
  console.log(`  Engagement configs: ${engagementRows.length}`);

  // ---------------------------------------------------------------------------
  // 3. Admin User
  // ---------------------------------------------------------------------------
  console.log("Inserting admin user...");

  const passwordHash = await bcryptjs.hash("openclaw2026", 12);

  await db.insert(users).values({
    email: "manish.openclaw@gmail.com",
    passwordHash,
    role: "admin",
    isActive: true,
  });

  console.log("  Admin user: manish.openclaw@gmail.com");

  console.log("\nProduction seed complete.");
}

seed()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
