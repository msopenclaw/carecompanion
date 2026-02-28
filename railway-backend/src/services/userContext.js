const { eq, desc, and, gte } = require("drizzle-orm");
const { db } = require("../db");
const {
  userProfiles, careCoordinators, userCoordinator, vitals,
  medications, medicationLogs, messages, userPreferences,
  voiceSessions, scheduledActions, mealLogs, patientMemory,
} = require("../db/schema");
const { decrypt, decryptJson } = require("./encryption");
const { getCompactedContext } = require("./ehrCompaction");

/**
 * Fetch comprehensive user context for agent consumption.
 * Used by: chat.js (text agent), hourlyMonologue.js, agent tools.
 */
async function getUserContext(userId) {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Compute start of today in user's timezone (need profile first for tz)
  // We'll use UTC midnight as a reasonable default; the chat agent
  // doesn't need perfect per-user timezone here since it's context, not gating.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    [profile],
    [uc],
    recentVitals,
    meds,
    todayMedLogs,
    recentMessages,
    [prefs],
    recentVoice,
    activeReminders,
    todayMeals,
  ] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
    db.select().from(userCoordinator).where(eq(userCoordinator.userId, userId)),
    db.select().from(vitals)
      .where(and(eq(vitals.patientId, userId), gte(vitals.recordedAt, since7d)))
      .orderBy(desc(vitals.recordedAt)).limit(30),
    db.select().from(medications)
      .where(and(eq(medications.patientId, userId), eq(medications.isActive, true))),
    db.select().from(medicationLogs)
      .where(and(eq(medicationLogs.patientId, userId), gte(medicationLogs.scheduledAt, todayStart))),
    db.select().from(messages)
      .where(eq(messages.userId, userId))
      .orderBy(desc(messages.createdAt)).limit(15),
    db.select().from(userPreferences).where(eq(userPreferences.userId, userId)),
    db.select().from(voiceSessions)
      .where(and(eq(voiceSessions.userId, userId), gte(voiceSessions.startedAt, since7d)))
      .orderBy(desc(voiceSessions.startedAt)).limit(5),
    db.select().from(scheduledActions)
      .where(and(eq(scheduledActions.userId, userId), eq(scheduledActions.isActive, true))),
    db.select().from(mealLogs)
      .where(and(eq(mealLogs.userId, userId), gte(mealLogs.createdAt, todayStart)))
      .orderBy(desc(mealLogs.createdAt)),
  ]);

  let coordinator = null;
  if (uc) {
    const [coord] = await db.select().from(careCoordinators)
      .where(eq(careCoordinators.id, uc.coordinatorId));
    coordinator = coord;
  }

  const medsWithLogs = meds.map(med => ({
    ...med,
    takenToday: todayMedLogs.some(l =>
      l.medicationId === med.id && (l.status === "taken" || l.status === "late")),
  }));

  // Decrypt encrypted PII fields from profile
  if (profile) {
    profile.firstName = decrypt(profile.firstName);
    profile.lastName = decrypt(profile.lastName);
    if (profile.phone) profile.phone = decrypt(profile.phone);
    if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
    if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
  }

  const glp1Start = profile?.glp1StartDate ? new Date(profile.glp1StartDate) : null;
  const daysSinceStart = glp1Start
    ? Math.floor((Date.now() - glp1Start.getTime()) / (24 * 60 * 60 * 1000))
    : null;

  // Fetch compacted patient memory (from pipeline EHR analysis)
  let compactedMemory = null;
  let insights = null;
  let careGaps = null;
  let hookAnchor = null;
  try {
    compactedMemory = await getCompactedContext(userId);
    const [memRecord] = await db.select().from(patientMemory)
      .where(eq(patientMemory.userId, userId));
    if (memRecord?.rawRecords) {
      insights = memRecord.rawRecords.top_3_insights || null;
      careGaps = memRecord.rawRecords.care_gaps || null;
      hookAnchor = memRecord.rawRecords.hook_anchor || null;
    }
  } catch (err) {
    // Patient memory may not exist yet — that's fine
  }

  return {
    profile,
    coordinator,
    recentVitals,
    medications: medsWithLogs,
    recentMessages: recentMessages.reverse(),
    preferences: prefs,
    voiceSessions: recentVoice,
    activeReminders,
    glp1DaysSinceStart: daysSinceStart,
    glp1WeekNumber: daysSinceStart !== null ? Math.ceil(daysSinceStart / 7) : null,
    todayMeals,
    compactedMemory,
    insights,
    careGaps,
    hookAnchor,
  };
}

/**
 * Lightweight context for notification generation.
 * Much cheaper than getUserContext — only fetches what the notification AI needs.
 */
async function getNotificationContext(userId) {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const [
    [profile],
    [uc],
    todayMedLogs,
    todayVitals,
    meds,
  ] = await Promise.all([
    db.select().from(userProfiles).where(eq(userProfiles.userId, userId)),
    db.select().from(userCoordinator).where(eq(userCoordinator.userId, userId)),
    db.select().from(medicationLogs)
      .where(and(eq(medicationLogs.patientId, userId), gte(medicationLogs.scheduledAt, todayStart))),
    db.select().from(vitals)
      .where(and(eq(vitals.patientId, userId), gte(vitals.recordedAt, todayStart))),
    db.select().from(medications)
      .where(and(eq(medications.patientId, userId), eq(medications.isActive, true))),
  ]);

  // Decrypt PII
  if (profile) {
    profile.firstName = decrypt(profile.firstName);
    if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
  }

  // Coordinator name
  let coordinatorName = null;
  if (uc) {
    const [coord] = await db.select().from(careCoordinators)
      .where(eq(careCoordinators.id, uc.coordinatorId));
    coordinatorName = coord?.name || null;
  }

  // GLP-1 week
  const glp1Start = profile?.glp1StartDate ? new Date(profile.glp1StartDate) : null;
  const daysSinceStart = glp1Start
    ? Math.floor((Date.now() - glp1Start.getTime()) / 86400000)
    : null;

  return {
    firstName: profile?.firstName || "there",
    ageBracket: profile?.ageBracket || null,
    glp1Med: profile?.glp1Medication || null,
    glp1Dosage: profile?.glp1Dosage || null,
    injectionDay: profile?.injectionDay || null,
    weekNumber: daysSinceStart !== null ? Math.ceil(daysSinceStart / 7) : null,
    dayNumber: daysSinceStart,
    sideEffects: profile?.currentSideEffects?.length ? profile.currentSideEffects.join(", ") : null,
    goals: profile?.goals?.length ? profile.goals.join(", ") : null,
    coordinatorName,
    medsTakenToday: todayMedLogs.filter(l => l.status === "taken" || l.status === "late").length,
    totalMeds: meds.length,
    medicationNames: meds.map(m => `${m.name} ${m.dosage}`).join(", "),
    waterToday: todayVitals.filter(v => v.vitalType === "hydration").reduce((mx, v) => Math.max(mx, v.value), 0),
    recentMood: todayVitals.find(v => v.vitalType === "mood")?.value || null,
    timezone: profile?.timezone || "America/New_York",
  };
}

module.exports = { getUserContext, getNotificationContext };
