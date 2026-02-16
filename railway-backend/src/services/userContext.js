const { eq, desc, and, gte } = require("drizzle-orm");
const { db } = require("../db");
const {
  userProfiles, careCoordinators, userCoordinator, vitals,
  medications, medicationLogs, messages, userPreferences,
  voiceSessions, scheduledActions,
} = require("../db/schema");

/**
 * Fetch comprehensive user context for agent consumption.
 * Used by: chat.js (text agent), hourlyMonologue.js, agent tools.
 */
async function getUserContext(userId) {
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

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

  const glp1Start = profile?.glp1StartDate ? new Date(profile.glp1StartDate) : null;
  const daysSinceStart = glp1Start
    ? Math.floor((Date.now() - glp1Start.getTime()) / (24 * 60 * 60 * 1000))
    : null;

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
  };
}

module.exports = { getUserContext };
