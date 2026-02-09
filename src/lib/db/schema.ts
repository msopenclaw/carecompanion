import {
  pgTable,
  integer,
  varchar,
  text,
  real,
  boolean,
  date,
  timestamp,
  jsonb,
  uuid,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const vitalTypeEnum = pgEnum("vital_type", [
  "blood_pressure_systolic",
  "blood_pressure_diastolic",
  "heart_rate",
  "blood_glucose",
  "weight",
  "oxygen_saturation",
  "temperature",
]);

export const medStatusEnum = pgEnum("med_status", [
  "taken",
  "missed",
  "late",
  "skipped",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "critical",
  "elevated",
  "informational",
]);

export const alertStatusEnum = pgEnum("alert_status", [
  "active",
  "acknowledged",
  "resolved",
  "dismissed",
]);

export const chatRoleEnum = pgEnum("chat_role", [
  "user",
  "assistant",
  "system",
]);

export const statusBadgeEnum = pgEnum("status_badge", [
  "green",
  "yellow",
  "red",
]);

export const genderEnum = pgEnum("gender", [
  "male",
  "female",
  "other",
  "prefer_not_to_say",
]);

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

// Providers
export const providers = pgTable("providers", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  specialty: varchar("specialty", { length: 150 }),
  npiNumber: varchar("npi_number", { length: 10 }),
  ...timestamps,
});

// Patients
export const patients = pgTable("patients", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  dateOfBirth: date("date_of_birth").notNull(),
  gender: genderEnum("gender").notNull(),
  conditions: jsonb("conditions").$type<string[]>().default([]).notNull(),
  statusBadge: statusBadgeEnum("status_badge").default("green").notNull(),
  assignedProviderId: uuid("assigned_provider_id").references(
    () => providers.id,
  ),
  phone: varchar("phone", { length: 20 }),
  email: varchar("email", { length: 255 }),
  ...timestamps,
});

// Caregivers
export const caregivers = pgTable("caregivers", {
  id: uuid("id").defaultRandom().primaryKey(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  phone: varchar("phone", { length: 20 }),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  relationship: varchar("relationship", { length: 100 }),
  ...timestamps,
});

// Vitals
export const vitals = pgTable(
  "vitals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .references(() => patients.id)
      .notNull(),
    vitalType: vitalTypeEnum("vital_type").notNull(),
    value: real("value").notNull(),
    unit: varchar("unit", { length: 20 }).notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    source: varchar("source", { length: 100 }).default("manual"),
    ...timestamps,
  },
  (table) => ({
    patientVitalTypeIdx: index("vitals_patient_vital_type_idx").on(
      table.patientId,
      table.vitalType,
    ),
    recordedAtIdx: index("vitals_recorded_at_idx").on(table.recordedAt),
  }),
);

// Medications
export const medications = pgTable("medications", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  dosage: varchar("dosage", { length: 100 }).notNull(),
  frequency: varchar("frequency", { length: 100 }).notNull(),
  scheduledTimes: jsonb("scheduled_times").$type<string[]>().default([]).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  prescribedBy: uuid("prescribed_by").references(() => providers.id),
  startDate: date("start_date"),
  endDate: date("end_date"),
  ...timestamps,
});

// Medication Logs
export const medicationLogs = pgTable("medication_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  medicationId: uuid("medication_id")
    .references(() => medications.id)
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  takenAt: timestamp("taken_at", { withTimezone: true }),
  status: medStatusEnum("status").notNull(),
  ...timestamps,
});

// Alerts
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    patientId: uuid("patient_id")
      .references(() => patients.id)
      .notNull(),
    severity: alertSeverityEnum("severity").notNull(),
    status: alertStatusEnum("status").default("active").notNull(),
    ruleId: varchar("rule_id", { length: 100 }).notNull(),
    ruleName: varchar("rule_name", { length: 200 }).notNull(),
    title: varchar("title", { length: 300 }).notNull(),
    description: text("description"),
    vitalsSnapshot: jsonb("vitals_snapshot").$type<Record<string, unknown>>(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => providers.id),
    resolutionNote: text("resolution_note"),
    ...timestamps,
  },
  (table) => ({
    severityStatusIdx: index("alerts_severity_status_idx").on(
      table.severity,
      table.status,
    ),
    patientIdx: index("alerts_patient_idx").on(table.patientId),
  }),
);

// Chat Messages
export const chatMessages = pgTable("chat_messages", {
  id: uuid("id").defaultRandom().primaryKey(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  sessionId: uuid("session_id").notNull(),
  role: chatRoleEnum("role").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  ...timestamps,
});

// Billing Codes
export const billingCodes = pgTable("billing_codes", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 20 }).notNull().unique(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  reimbursementAmount: real("reimbursement_amount").notNull(),
  ...timestamps,
});

// Billing Entries
export const billingEntries = pgTable("billing_entries", {
  id: uuid("id").defaultRandom().primaryKey(),
  providerId: uuid("provider_id")
    .references(() => providers.id)
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  billingCodeId: uuid("billing_code_id")
    .references(() => billingCodes.id)
    .notNull(),
  alertId: uuid("alert_id").references(() => alerts.id),
  minutesSpent: integer("minutes_spent").notNull(),
  serviceDate: date("service_date").notNull(),
  notes: text("notes"),
  ...timestamps,
});

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const providersRelations = relations(providers, ({ many }) => ({
  patients: many(patients),
  medications: many(medications),
  billingEntries: many(billingEntries),
  resolvedAlerts: many(alerts),
}));

export const patientsRelations = relations(patients, ({ one, many }) => ({
  assignedProvider: one(providers, {
    fields: [patients.assignedProviderId],
    references: [providers.id],
  }),
  vitals: many(vitals),
  medications: many(medications),
  medicationLogs: many(medicationLogs),
  alerts: many(alerts),
  chatMessages: many(chatMessages),
  caregivers: many(caregivers),
  billingEntries: many(billingEntries),
}));

export const caregiversRelations = relations(caregivers, ({ one }) => ({
  patient: one(patients, {
    fields: [caregivers.patientId],
    references: [patients.id],
  }),
}));

export const vitalsRelations = relations(vitals, ({ one }) => ({
  patient: one(patients, {
    fields: [vitals.patientId],
    references: [patients.id],
  }),
}));

export const medicationsRelations = relations(medications, ({ one, many }) => ({
  patient: one(patients, {
    fields: [medications.patientId],
    references: [patients.id],
  }),
  prescriber: one(providers, {
    fields: [medications.prescribedBy],
    references: [providers.id],
  }),
  logs: many(medicationLogs),
}));

export const medicationLogsRelations = relations(
  medicationLogs,
  ({ one }) => ({
    medication: one(medications, {
      fields: [medicationLogs.medicationId],
      references: [medications.id],
    }),
    patient: one(patients, {
      fields: [medicationLogs.patientId],
      references: [patients.id],
    }),
  }),
);

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  patient: one(patients, {
    fields: [alerts.patientId],
    references: [patients.id],
  }),
  resolver: one(providers, {
    fields: [alerts.resolvedBy],
    references: [providers.id],
  }),
  billingEntries: many(billingEntries),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  patient: one(patients, {
    fields: [chatMessages.patientId],
    references: [patients.id],
  }),
}));

export const billingCodesRelations = relations(billingCodes, ({ many }) => ({
  entries: many(billingEntries),
}));

export const billingEntriesRelations = relations(
  billingEntries,
  ({ one }) => ({
    provider: one(providers, {
      fields: [billingEntries.providerId],
      references: [providers.id],
    }),
    patient: one(patients, {
      fields: [billingEntries.patientId],
      references: [patients.id],
    }),
    billingCode: one(billingCodes, {
      fields: [billingEntries.billingCodeId],
      references: [billingCodes.id],
    }),
    alert: one(alerts, {
      fields: [billingEntries.alertId],
      references: [alerts.id],
    }),
  }),
);

// ---------------------------------------------------------------------------
// Type exports for convenience
// ---------------------------------------------------------------------------

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;
export type Patient = typeof patients.$inferSelect;
export type NewPatient = typeof patients.$inferInsert;
export type Caregiver = typeof caregivers.$inferSelect;
export type NewCaregiver = typeof caregivers.$inferInsert;
export type Vital = typeof vitals.$inferSelect;
export type NewVital = typeof vitals.$inferInsert;
export type Medication = typeof medications.$inferSelect;
export type NewMedication = typeof medications.$inferInsert;
export type MedicationLog = typeof medicationLogs.$inferSelect;
export type NewMedicationLog = typeof medicationLogs.$inferInsert;
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;
export type BillingCode = typeof billingCodes.$inferSelect;
export type NewBillingCode = typeof billingCodes.$inferInsert;
export type BillingEntry = typeof billingEntries.$inferSelect;
export type NewBillingEntry = typeof billingEntries.$inferInsert;
