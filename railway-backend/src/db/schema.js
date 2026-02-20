const {
  pgTable, integer, varchar, text, real, boolean, date, timestamp, jsonb, uuid, index, pgEnum,
} = require("drizzle-orm/pg-core");

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

const vitalTypeEnum = pgEnum("vital_type", [
  "blood_pressure_systolic", "blood_pressure_diastolic", "heart_rate",
  "blood_glucose", "weight", "oxygen_saturation", "temperature", "hydration", "steps", "sleep", "mood",
]);

const medStatusEnum = pgEnum("med_status", ["taken", "missed", "late", "skipped"]);
const alertSeverityEnum = pgEnum("alert_severity", ["critical", "elevated", "informational"]);
const alertStatusEnum = pgEnum("alert_status", ["active", "acknowledged", "resolved", "dismissed"]);
const statusBadgeEnum = pgEnum("status_badge", ["green", "yellow", "red"]);
const genderEnum = pgEnum("gender", ["male", "female", "other", "prefer_not_to_say"]);
const userRoleEnum = pgEnum("user_role", ["patient", "admin", "provider"]);
const messageSenderEnum = pgEnum("message_sender", ["ai", "patient", "admin"]);
const messageTypeEnum = pgEnum("message_type", ["check_in", "nudge", "alert", "celebration", "text", "call_request"]);
const aiUrgencyEnum = pgEnum("ai_urgency", ["low", "medium", "high", "critical"]);
const aiActionEnum = pgEnum("ai_action", ["none", "send_message", "call", "escalate"]);
const aiSourceEnum = pgEnum("ai_source", ["cron", "manual_override", "patient_trigger"]);
const voiceInitiatorEnum = pgEnum("voice_initiator", ["ai", "patient", "admin"]);
const escalationTypeEnum = pgEnum("escalation_type", ["provider", "emergency"]);
const escalationStatusEnum = pgEnum("escalation_status", ["open", "acknowledged", "resolved"]);

// ---------------------------------------------------------------------------
// Existing Tables
// ---------------------------------------------------------------------------

const providers = pgTable("providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  specialty: varchar("specialty", { length: 150 }),
  npiNumber: varchar("npi_number", { length: 10 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  gender: genderEnum("gender").notNull(),
  conditions: jsonb("conditions").default([]).notNull(),
  statusBadge: statusBadgeEnum("status_badge").default("green").notNull(),
  assignedProviderId: uuid("assigned_provider_id").references(() => providers.id),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const vitals = pgTable("vitals", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").references(() => patients.id).notNull(),
  vitalType: vitalTypeEnum("vital_type").notNull(),
  value: real("value").notNull(),
  unit: varchar("unit", { length: 20 }).notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  source: varchar("source", { length: 100 }).default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const medications = pgTable("medications", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").references(() => patients.id).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  dosage: varchar("dosage", { length: 100 }).notNull(),
  frequency: varchar("frequency", { length: 100 }).notNull(),
  scheduledTimes: jsonb("scheduled_times").default([]).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  isGlp1: boolean("is_glp1").default(false).notNull(),
  prescribedBy: uuid("prescribed_by").references(() => providers.id),
  startDate: date("start_date"),
  endDate: date("end_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const medicationLogs = pgTable("medication_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  medicationId: uuid("medication_id").references(() => medications.id).notNull(),
  patientId: uuid("patient_id").references(() => patients.id).notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  status: medStatusEnum("status").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id").references(() => patients.id).notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  status: alertStatusEnum("status").default("active").notNull(),
  ruleId: varchar("rule_id", { length: 100 }).notNull(),
  ruleName: varchar("rule_name", { length: 200 }).notNull(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  vitalsSnapshot: jsonb("vitals_snapshot"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => providers.id),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// New Tables
// ---------------------------------------------------------------------------

const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").default("patient").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const userProfiles = pgTable("user_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  gender: varchar("gender", { length: 20 }),
  phone: varchar("phone", { length: 20 }),
  heightInches: integer("height_inches"),
  startingWeight: real("starting_weight"),
  conditions: jsonb("conditions").default([]),
  activityLevel: varchar("activity_level", { length: 20 }),
  glp1Medication: varchar("glp1_medication", { length: 100 }),
  glp1Dosage: varchar("glp1_dosage", { length: 50 }),
  glp1StartDate: date("glp1_start_date"),
  injectionDay: varchar("injection_day", { length: 10 }),
  otherMedications: jsonb("other_medications").default([]),
  currentSideEffects: jsonb("current_side_effects").default([]),
  goals: jsonb("goals").default([]),
  ageBracket: varchar("age_bracket", { length: 10 }),
  timezone: varchar("timezone", { length: 50 }).default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const careCoordinators = pgTable("care_coordinators", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  gender: varchar("gender", { length: 20 }).notNull(),
  elevenlabsVoiceId: varchar("elevenlabs_voice_id", { length: 100 }).notNull(),
  voiceSettings: jsonb("voice_settings").notNull(),
  personalityPrompt: text("personality_prompt").notNull(),
  textStyle: text("text_style").notNull(),
  bio: text("bio").notNull(),
  avatarUrl: varchar("avatar_url", { length: 500 }),
  bestForAgeBrackets: jsonb("best_for_age_brackets").default([]),
  sampleGreeting: text("sample_greeting").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const userCoordinator = pgTable("user_coordinator", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull().unique(),
  coordinatorId: uuid("coordinator_id").references(() => careCoordinators.id).notNull(),
  selectedAt: timestamp("selected_at", { withTimezone: true }).defaultNow().notNull(),
});

const aiActions = pgTable("ai_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  observation: text("observation").notNull(),
  reasoning: text("reasoning").notNull(),
  assessment: text("assessment").notNull(),
  urgency: aiUrgencyEnum("urgency").notNull(),
  action: aiActionEnum("action").notNull(),
  messageContent: text("message_content"),
  escalationTarget: varchar("escalation_target", { length: 20 }),
  coordinatorPersona: varchar("coordinator_persona", { length: 100 }),
  engagementProfile: varchar("engagement_profile", { length: 10 }),
  glp1Context: text("glp1_context"),
  source: aiSourceEnum("source").default("cron").notNull(),
  outcome: text("outcome"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const messages = pgTable("messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  sender: messageSenderEnum("sender").notNull(),
  messageType: messageTypeEnum("message_type").default("text").notNull(),
  content: text("content").notNull(),
  isRead: boolean("is_read").default(false).notNull(),
  triggeredBy: uuid("triggered_by").references(() => aiActions.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const pushTokens = pgTable("push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  deviceToken: varchar("device_token", { length: 500 }).notNull(),
  platform: varchar("platform", { length: 10 }).default("ios").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const voiceSessions = pgTable("voice_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  initiatedBy: voiceInitiatorEnum("initiated_by").notNull(),
  aiActionId: uuid("ai_action_id").references(() => aiActions.id),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
  transcript: jsonb("transcript"),
  summary: text("summary"),
  coordinatorPersona: varchar("coordinator_persona", { length: 100 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const escalations = pgTable("escalations", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  aiActionId: uuid("ai_action_id").references(() => aiActions.id),
  escalationType: escalationTypeEnum("escalation_type").notNull(),
  reason: text("reason").notNull(),
  status: escalationStatusEnum("status").default("open").notNull(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  resolutionNote: text("resolution_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const consents = pgTable("consents", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id),
  consentType: varchar("consent_type", { length: 50 }).notNull(),
  consentVersion: varchar("consent_version", { length: 20 }).default("1.0").notNull(),
  accepted: boolean("accepted").notNull(),
  ipAddress: varchar("ip_address", { length: 50 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const engagementConfig = pgTable("engagement_config", {
  id: uuid("id").defaultRandom().primaryKey(),
  ageBracket: varchar("age_bracket", { length: 10 }).notNull().unique(),
  primaryChannel: varchar("primary_channel", { length: 20 }).notNull(),
  maxDailyMessages: integer("max_daily_messages").default(3).notNull(),
  maxWeeklyCalls: integer("max_weekly_calls").default(2).notNull(),
  checkInFrequencyHours: integer("check_in_frequency_hours").default(24).notNull(),
  escalationTextTimeoutHours: integer("escalation_text_timeout_hours").default(4).notNull(),
  callThresholdLevel: integer("call_threshold_level").default(4).notNull(),
  toneDescription: text("tone_description").notNull(),
  uiFontScale: real("ui_font_scale").default(1.0).notNull(),
  useEmoji: boolean("use_emoji").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const userPreferences = pgTable("user_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull().unique(),
  checkinFrequency: varchar("checkin_frequency", { length: 20 }).default("once_daily").notNull(),
  checkinTimePreference: varchar("checkin_time_preference", { length: 20 }).default("morning").notNull(),
  medReminderEnabled: boolean("med_reminder_enabled").default(true).notNull(),
  medReminderPrepNightBefore: boolean("med_reminder_prep_night_before").default(true).notNull(),
  hydrationNudgesEnabled: boolean("hydration_nudges_enabled").default(true).notNull(),
  hydrationNudgesPerDay: integer("hydration_nudges_per_day").default(3).notNull(),
  weighinPrompt: varchar("weighin_prompt", { length: 20 }).default("daily_morning").notNull(),
  exerciseNudgesEnabled: boolean("exercise_nudges_enabled").default(false).notNull(),
  preferredChannel: varchar("preferred_channel", { length: 20 }).default("both").notNull(),
  voiceCallFrequency: varchar("voice_call_frequency", { length: 20 }).default("every_2_days").notNull(),
  glucoseAlertMode: varchar("glucose_alert_mode", { length: 20 }),
  quietStart: varchar("quiet_start", { length: 5 }).default("22:00").notNull(),
  quietEnd: varchar("quiet_end", { length: 5 }).default("07:00").notNull(),
  setVia: varchar("set_via", { length: 20 }).default("day1_chat").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

const scheduledActions = pgTable("scheduled_actions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  actionType: varchar("action_type", { length: 30 }).notNull(),
  label: varchar("label", { length: 200 }),
  scheduledTime: varchar("scheduled_time", { length: 5 }).notNull(),
  recurrence: varchar("recurrence", { length: 20 }).default("daily").notNull(),
  recurrenceDay: varchar("recurrence_day", { length: 10 }),
  timezone: varchar("timezone", { length: 50 }).default("America/New_York").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  intervalDays: integer("interval_days").default(1).notNull(),
  lastTriggeredAt: timestamp("last_triggered_at", { withTimezone: true }),
  createdVia: varchar("created_via", { length: 20 }).default("voice").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

const dailyTips = pgTable("daily_tips", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").references(() => users.id).notNull(),
  tipDate: date("tip_date").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

module.exports = {
  providers, patients, vitals, medications, medicationLogs, alerts,
  users, userProfiles, careCoordinators, userCoordinator,
  aiActions, messages, pushTokens, voiceSessions, escalations, consents, engagementConfig,
  userPreferences, scheduledActions, dailyTips,
};
