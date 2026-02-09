/**
 * CareCompanion AI — Seed Script
 *
 * Seeds 5 patients with 90 days of realistic vitals data, medications,
 * medication adherence logs, alerts, billing codes, and billing entries.
 *
 * Run with:  npx tsx src/scripts/seed.ts
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { v4 as uuidv4 } from "uuid";
import {
  providers,
  patients,
  caregivers,
  vitals,
  medications,
  medicationLogs,
  alerts,
  chatMessages,
  billingCodes,
  billingEntries,
} from "../lib/db/schema";

// ---------------------------------------------------------------------------
// Database connection
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required.");
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);
const db = drizzle(sql);

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const today = new Date();

/** Returns a Date that is `dayNum` days into a 90-day window ending today. */
function dayOffset(dayNum: number): Date {
  return new Date(today.getTime() - (90 - dayNum) * 86_400_000);
}

/** Returns a Date for the given day + hour/minute. */
function dayTime(dayNum: number, hour: number, minute: number = 0): Date {
  const d = dayOffset(dayNum);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Adds Gaussian-ish noise: base +/- variance. */
function noisy(base: number, variance: number): number {
  return base + (Math.random() - 0.5) * 2 * variance;
}

/** Clamp a number between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Round to N decimal places. */
function round(value: number, decimals: number = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Linear interpolation between start and end over a range of days. */
function lerp(
  dayNum: number,
  startDay: number,
  endDay: number,
  startVal: number,
  endVal: number,
): number {
  const t = clamp((dayNum - startDay) / (endDay - startDay), 0, 1);
  return startVal + t * (endVal - startVal);
}

// ---------------------------------------------------------------------------
// Pre-generated IDs (so we can reference them across inserts)
// ---------------------------------------------------------------------------

// Providers
const PROVIDER_PATEL_ID = uuidv4();
const PROVIDER_TORRES_ID = uuidv4();

// Patients
const PATIENT_MARGARET_ID = uuidv4();
const PATIENT_JAMES_ID = uuidv4();
const PATIENT_SARAH_ID = uuidv4();
const PATIENT_ROBERT_ID = uuidv4();
const PATIENT_AISHA_ID = uuidv4();

// Caregivers
const CAREGIVER_DAVID_ID = uuidv4();
const CAREGIVER_MARIA_ID = uuidv4();
const CAREGIVER_JENNIFER_ID = uuidv4();

// Billing codes
const BC_99453_ID = uuidv4();
const BC_99454_ID = uuidv4();
const BC_99457_ID = uuidv4();
const BC_99458_ID = uuidv4();
const BC_99490_ID = uuidv4();
const BC_99491_ID = uuidv4();

// Specific alert IDs (referenced by billing entries)
const ALERT_MARGARET_RISING_BP_ID = uuidv4();
const ALERT_MARGARET_ELEVATED_BP_ID = uuidv4();
const ALERT_MARGARET_RESOLVED_ID = uuidv4();
const ALERT_JAMES_WEIGHT_ID = uuidv4();
const ALERT_ROBERT_O2_FIRST_ID = uuidv4();
const ALERT_ROBERT_O2_SECOND_ID = uuidv4();

// ---------------------------------------------------------------------------
// Seed data builders
// ---------------------------------------------------------------------------

function buildProviders() {
  return [
    {
      id: PROVIDER_PATEL_ID,
      firstName: "Sarah",
      lastName: "Patel",
      email: "sarah.patel@carecompanion.health",
      specialty: "Cardiology",
      npiNumber: "1234567890",
    },
    {
      id: PROVIDER_TORRES_ID,
      firstName: "Michael",
      lastName: "Torres",
      email: "michael.torres@carecompanion.health",
      specialty: "Endocrinology",
      npiNumber: "0987654321",
    },
  ];
}

function buildPatients() {
  return [
    {
      id: PATIENT_MARGARET_ID,
      firstName: "Margaret",
      lastName: "Chen",
      dateOfBirth: "1951-06-15",
      gender: "female" as const,
      conditions: ["hypertension", "type_2_diabetes", "chf"],
      statusBadge: "yellow" as const,
      assignedProviderId: PROVIDER_PATEL_ID,
      phone: "(555) 234-5678",
      email: "margaret.chen@email.com",
    },
    {
      id: PATIENT_JAMES_ID,
      firstName: "James",
      lastName: "Rodriguez",
      dateOfBirth: "1957-11-22",
      gender: "male" as const,
      conditions: ["chf", "hypertension"],
      statusBadge: "yellow" as const,
      assignedProviderId: PROVIDER_PATEL_ID,
      phone: "(555) 345-6789",
      email: "james.rodriguez@email.com",
    },
    {
      id: PATIENT_SARAH_ID,
      firstName: "Sarah",
      lastName: "Williams",
      dateOfBirth: "1973-03-08",
      gender: "female" as const,
      conditions: ["type_2_diabetes"],
      statusBadge: "green" as const,
      assignedProviderId: PROVIDER_TORRES_ID,
      phone: "(555) 456-7890",
      email: "sarah.williams@email.com",
    },
    {
      id: PATIENT_ROBERT_ID,
      firstName: "Robert",
      lastName: "Kim",
      dateOfBirth: "1944-09-30",
      gender: "male" as const,
      conditions: ["copd", "hypertension"],
      statusBadge: "yellow" as const,
      assignedProviderId: PROVIDER_PATEL_ID,
      phone: "(555) 567-8901",
      email: "robert.kim@email.com",
    },
    {
      id: PATIENT_AISHA_ID,
      firstName: "Aisha",
      lastName: "Patel",
      dateOfBirth: "1980-12-03",
      gender: "female" as const,
      conditions: ["hypertension"],
      statusBadge: "green" as const,
      assignedProviderId: PROVIDER_TORRES_ID,
      phone: "(555) 678-9012",
      email: "aisha.patel@email.com",
    },
  ];
}

function buildCaregivers() {
  return [
    {
      id: CAREGIVER_DAVID_ID,
      firstName: "David",
      lastName: "Chen",
      email: "david.chen@email.com",
      phone: "(555) 234-0001",
      patientId: PATIENT_MARGARET_ID,
      relationship: "Son",
    },
    {
      id: CAREGIVER_MARIA_ID,
      firstName: "Maria",
      lastName: "Rodriguez",
      email: "maria.rodriguez@email.com",
      phone: "(555) 345-0001",
      patientId: PATIENT_JAMES_ID,
      relationship: "Wife",
    },
    {
      id: CAREGIVER_JENNIFER_ID,
      firstName: "Jennifer",
      lastName: "Kim",
      email: "jennifer.kim@email.com",
      phone: "(555) 567-0001",
      patientId: PATIENT_ROBERT_ID,
      relationship: "Daughter",
    },
  ];
}

// ---------------------------------------------------------------------------
// Medications
// ---------------------------------------------------------------------------

interface MedDef {
  patientId: string;
  name: string;
  dosage: string;
  frequency: string;
  scheduledTimes: string[];
  prescribedBy: string;
}

function buildMedicationDefs(): MedDef[] {
  return [
    // Margaret Chen
    { patientId: PATIENT_MARGARET_ID, name: "Lisinopril", dosage: "10mg", frequency: "twice_daily", scheduledTimes: ["08:00", "20:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_MARGARET_ID, name: "Metformin", dosage: "500mg", frequency: "twice_daily", scheduledTimes: ["08:00", "20:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_MARGARET_ID, name: "Furosemide", dosage: "20mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_MARGARET_ID, name: "Amlodipine", dosage: "5mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    // James Rodriguez
    { patientId: PATIENT_JAMES_ID, name: "Lisinopril", dosage: "20mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_JAMES_ID, name: "Carvedilol", dosage: "12.5mg", frequency: "twice_daily", scheduledTimes: ["08:00", "20:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_JAMES_ID, name: "Furosemide", dosage: "40mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_JAMES_ID, name: "Spironolactone", dosage: "25mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    // Sarah Williams
    { patientId: PATIENT_SARAH_ID, name: "Metformin", dosage: "1000mg", frequency: "twice_daily", scheduledTimes: ["08:00", "20:00"], prescribedBy: PROVIDER_TORRES_ID },
    { patientId: PATIENT_SARAH_ID, name: "Glipizide", dosage: "5mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_TORRES_ID },
    // Robert Kim
    { patientId: PATIENT_ROBERT_ID, name: "Lisinopril", dosage: "10mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_ROBERT_ID, name: "Tiotropium", dosage: "18mcg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_PATEL_ID },
    { patientId: PATIENT_ROBERT_ID, name: "Albuterol", dosage: "90mcg", frequency: "as_needed", scheduledTimes: [], prescribedBy: PROVIDER_PATEL_ID },
    // Aisha Patel
    { patientId: PATIENT_AISHA_ID, name: "Amlodipine", dosage: "5mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_TORRES_ID },
    { patientId: PATIENT_AISHA_ID, name: "HCTZ", dosage: "25mg", frequency: "once_daily", scheduledTimes: ["08:00"], prescribedBy: PROVIDER_TORRES_ID },
  ];
}

function buildMedicationRecords(defs: MedDef[]) {
  return defs.map((d) => ({
    id: uuidv4(),
    patientId: d.patientId,
    name: d.name,
    dosage: d.dosage,
    frequency: d.frequency,
    scheduledTimes: d.scheduledTimes,
    isActive: true,
    prescribedBy: d.prescribedBy,
    startDate: dayOffset(1).toISOString().split("T")[0],
  }));
}

// ---------------------------------------------------------------------------
// Medication Adherence Logs
// ---------------------------------------------------------------------------

interface MedLogEntry {
  medicationId: string;
  patientId: string;
  scheduledAt: Date;
  takenAt: Date | null;
  status: "taken" | "missed" | "late" | "skipped";
}

function buildMedicationLogs(
  medRecords: ReturnType<typeof buildMedicationRecords>,
  defs: MedDef[],
): MedLogEntry[] {
  const logs: MedLogEntry[] = [];

  for (let idx = 0; idx < medRecords.length; idx++) {
    const med = medRecords[idx];
    const def = defs[idx];

    // as_needed meds don't produce scheduled adherence records
    if (def.frequency === "as_needed") continue;

    for (let day = 1; day <= 90; day++) {
      for (const timeStr of def.scheduledTimes) {
        const [h, m] = timeStr.split(":").map(Number);
        const scheduledAt = dayTime(day, h, m);
        const { status, takenAt } = computeAdherenceStatus(
          def.patientId,
          def.name,
          timeStr,
          day,
        );
        logs.push({
          medicationId: med.id,
          patientId: med.patientId,
          scheduledAt,
          takenAt,
          status,
        });
      }
    }
  }

  return logs;
}

/**
 * Determines adherence status for a specific med/time/day based on the
 * patient-specific scenario arc.
 */
function computeAdherenceStatus(
  patientId: string,
  medName: string,
  timeStr: string,
  day: number,
): { status: "taken" | "missed" | "late" | "skipped"; takenAt: Date | null } {
  const isEvening = timeStr === "20:00";
  const baseTime = dayTime(day, parseInt(timeStr.split(":")[0]), parseInt(timeStr.split(":")[1]));

  // -------------------------------------------------------------------------
  // Margaret Chen — the demo arc
  // -------------------------------------------------------------------------
  if (patientId === PATIENT_MARGARET_ID) {
    // Drift only affects evening Lisinopril
    if (medName === "Lisinopril" && isEvening) {
      // Days 61-67: ~50% adherence
      if (day >= 61 && day <= 67) {
        if (Math.random() < 0.5) {
          return { status: "missed", takenAt: null };
        }
      }
      // Days 68-74: ~30% adherence
      if (day >= 68 && day <= 74) {
        if (Math.random() < 0.7) {
          return { status: "missed", takenAt: null };
        }
      }
    }
    // All other meds/times for Margaret: 100% adherence
    return taken(baseTime);
  }

  // -------------------------------------------------------------------------
  // James Rodriguez — 90% adherence
  // -------------------------------------------------------------------------
  if (patientId === PATIENT_JAMES_ID) {
    if (Math.random() < 0.1) {
      return Math.random() < 0.6
        ? { status: "missed", takenAt: null }
        : late(baseTime);
    }
    return taken(baseTime);
  }

  // -------------------------------------------------------------------------
  // Sarah Williams — perfect adherence
  // -------------------------------------------------------------------------
  if (patientId === PATIENT_SARAH_ID) {
    return taken(baseTime);
  }

  // -------------------------------------------------------------------------
  // Robert Kim — 85% adherence
  // -------------------------------------------------------------------------
  if (patientId === PATIENT_ROBERT_ID) {
    if (Math.random() < 0.15) {
      return Math.random() < 0.5
        ? { status: "missed", takenAt: null }
        : late(baseTime);
    }
    return taken(baseTime);
  }

  // -------------------------------------------------------------------------
  // Aisha Patel — 95% adherence
  // -------------------------------------------------------------------------
  if (patientId === PATIENT_AISHA_ID) {
    if (Math.random() < 0.05) {
      return Math.random() < 0.5
        ? { status: "missed", takenAt: null }
        : late(baseTime);
    }
    return taken(baseTime);
  }

  return taken(baseTime);
}

function taken(base: Date): { status: "taken"; takenAt: Date } {
  // taken within 0-15 min of scheduled
  const offset = Math.floor(Math.random() * 15) * 60_000;
  return { status: "taken", takenAt: new Date(base.getTime() + offset) };
}

function late(base: Date): { status: "late"; takenAt: Date } {
  // 30-120 min late
  const offset = (30 + Math.floor(Math.random() * 90)) * 60_000;
  return { status: "late", takenAt: new Date(base.getTime() + offset) };
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

interface VitalRow {
  patientId: string;
  vitalType:
    | "blood_pressure_systolic"
    | "blood_pressure_diastolic"
    | "heart_rate"
    | "blood_glucose"
    | "weight"
    | "oxygen_saturation"
    | "temperature";
  value: number;
  unit: string;
  recordedAt: Date;
  source: string;
}

function buildAllVitals(): VitalRow[] {
  const rows: VitalRow[] = [];

  for (let day = 1; day <= 90; day++) {
    // 2-3 readings per day
    const readingTimes: Date[] = [
      dayTime(day, 7 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60)),   // morning 7-8:59
      dayTime(day, 18 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60)),  // evening 6-7:59
    ];
    // ~40% chance of a third afternoon reading
    if (Math.random() < 0.4) {
      readingTimes.push(
        dayTime(day, 12 + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60)),
      );
    }

    for (const ts of readingTimes) {
      rows.push(...margaretVitals(day, ts));
      rows.push(...jamesVitals(day, ts));
      rows.push(...sarahVitals(day, ts));
      rows.push(...robertVitals(day, ts));
      rows.push(...aishaVitals(day, ts));
    }
  }

  return rows;
}

// --- Margaret Chen vitals ---------------------------------------------------

function margaretVitals(day: number, ts: Date): VitalRow[] {
  let sys: number, dia: number, hr: number, glu: number, wt: number, spo2: number, temp: number;

  if (day <= 60) {
    // Stable phase
    sys = noisy(130, 5);
    dia = noisy(81, 3.5);
    hr = noisy(72, 4);
    glu = noisy(115, 15);
    wt = noisy(149, 1);
    spo2 = noisy(97, 1);
    temp = noisy(98.2, 0.4);
  } else if (day <= 67) {
    // Drift phase
    sys = noisy(lerp(day, 61, 67, 135, 142), 3);
    dia = noisy(lerp(day, 61, 67, 82, 88), 2);
    hr = noisy(lerp(day, 61, 67, 76, 80), 2);
    glu = noisy(118, 15);
    wt = noisy(149.5, 1);
    spo2 = noisy(97, 1);
    temp = noisy(98.2, 0.4);
  } else if (day <= 74) {
    // Escalation phase
    sys = noisy(lerp(day, 68, 74, 145, 162), 3);
    dia = noisy(lerp(day, 68, 74, 88, 95), 2);
    hr = noisy(lerp(day, 68, 74, 80, 85), 2);
    glu = noisy(120, 15);
    wt = noisy(lerp(day, 68, 74, 150, 151), 0.5);
    spo2 = noisy(95.5, 0.5);
    temp = noisy(98.3, 0.4);
  } else if (day <= 78) {
    // Intervention phase
    sys = noisy(lerp(day, 75, 78, 162, 142), 3);
    dia = noisy(lerp(day, 75, 78, 95, 86), 2);
    hr = noisy(lerp(day, 75, 78, 85, 76), 2);
    glu = noisy(115, 15);
    wt = noisy(150.5, 0.5);
    spo2 = noisy(96, 1);
    temp = noisy(98.2, 0.4);
  } else {
    // Recovery phase (days 79-90)
    sys = noisy(lerp(day, 79, 85, 138, 126), 3);
    dia = noisy(lerp(day, 79, 85, 86, 80), 2);
    hr = noisy(lerp(day, 79, 85, 76, 72), 2);
    glu = noisy(112, 12);
    wt = noisy(149, 1);
    spo2 = noisy(97, 1);
    temp = noisy(98.2, 0.4);
  }

  return patientVitalRows(PATIENT_MARGARET_ID, ts, sys, dia, hr, glu, wt, spo2, temp);
}

// --- James Rodriguez vitals --------------------------------------------------

function jamesVitals(day: number, ts: Date): VitalRow[] {
  let sys: number, dia: number, wt: number;
  const hr = noisy(76, 6);
  const spo2 = noisy(97, 1);
  const temp = noisy(98.4, 0.3);

  sys = noisy(137, 7.5);
  dia = noisy(84, 4);

  if (day >= 70 && day <= 80) {
    // Weight gain trend
    wt = noisy(lerp(day, 70, 80, 185, 190), 0.5);
    // Slightly elevated BP during this period
    sys = noisy(lerp(day, 70, 80, 140, 148), 4);
    dia = noisy(lerp(day, 70, 80, 86, 90), 3);
  } else {
    wt = noisy(185, 1);
  }

  return patientVitalRows(PATIENT_JAMES_ID, ts, sys, dia, hr, null, wt, spo2, temp);
}

// --- Sarah Williams vitals ---------------------------------------------------

function sarahVitals(day: number, ts: Date): VitalRow[] {
  const sys = noisy(118, 5);
  const dia = noisy(74, 3);
  const hr = noisy(72, 4);
  const glu = noisy(105, 15);
  const wt = noisy(145, 0.5);
  const spo2 = noisy(98, 0.5);
  const temp = noisy(98.3, 0.3);

  return patientVitalRows(PATIENT_SARAH_ID, ts, sys, dia, hr, glu, wt, spo2, temp);
}

// --- Robert Kim vitals -------------------------------------------------------

function robertVitals(day: number, ts: Date): VitalRow[] {
  const sys = noisy(140, 10);
  const dia = noisy(85, 5);
  const hr = noisy(72, 7.5);
  const wt = noisy(168, 0.5);
  const temp = noisy(98.1, 0.3);

  // SpO2 occasionally dips
  let spo2: number;
  if ((day >= 63 && day <= 67) || (day >= 78 && day <= 82)) {
    // Episodes of lower O2
    spo2 = noisy(93, 1);
  } else {
    spo2 = noisy(96, 1.5);
  }

  return patientVitalRows(PATIENT_ROBERT_ID, ts, sys, dia, hr, null, wt, spo2, temp);
}

// --- Aisha Patel vitals ------------------------------------------------------

function aishaVitals(day: number, ts: Date): VitalRow[] {
  // BP starts variable and stabilizes over time
  const bpVariance = lerp(day, 1, 90, 15, 5);
  const bpCenter = lerp(day, 1, 90, 140, 128);
  const sys = noisy(bpCenter, bpVariance);
  const dia = noisy(lerp(day, 1, 90, 88, 80), bpVariance * 0.5);
  const hr = noisy(74, 4);
  const wt = noisy(155, 0.5);
  const spo2 = noisy(98, 0.5);
  const temp = noisy(98.4, 0.3);

  return patientVitalRows(PATIENT_AISHA_ID, ts, sys, dia, hr, null, wt, spo2, temp);
}

// --- Helper to convert a set of vital values into row-per-type entries -------

function patientVitalRows(
  patientId: string,
  recordedAt: Date,
  sys: number,
  dia: number,
  hr: number,
  glu: number | null,
  wt: number,
  spo2: number,
  temp: number,
): VitalRow[] {
  const rows: VitalRow[] = [
    {
      patientId,
      vitalType: "blood_pressure_systolic",
      value: round(clamp(sys, 80, 220), 0),
      unit: "mmHg",
      recordedAt,
      source: "device",
    },
    {
      patientId,
      vitalType: "blood_pressure_diastolic",
      value: round(clamp(dia, 50, 130), 0),
      unit: "mmHg",
      recordedAt,
      source: "device",
    },
    {
      patientId,
      vitalType: "heart_rate",
      value: round(clamp(hr, 45, 150), 0),
      unit: "bpm",
      recordedAt,
      source: "device",
    },
    {
      patientId,
      vitalType: "weight",
      value: round(clamp(wt, 80, 400), 1),
      unit: "lbs",
      recordedAt,
      source: "device",
    },
    {
      patientId,
      vitalType: "oxygen_saturation",
      value: round(clamp(spo2, 85, 100), 0),
      unit: "%",
      recordedAt,
      source: "device",
    },
    {
      patientId,
      vitalType: "temperature",
      value: round(clamp(temp, 95, 104), 1),
      unit: "°F",
      recordedAt,
      source: "device",
    },
  ];

  if (glu !== null) {
    rows.push({
      patientId,
      vitalType: "blood_glucose",
      value: round(clamp(glu, 40, 400), 0),
      unit: "mg/dL",
      recordedAt,
      source: "device",
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

function buildAlerts() {
  return [
    // Margaret Chen — demo arc alerts
    {
      id: ALERT_MARGARET_RISING_BP_ID,
      patientId: PATIENT_MARGARET_ID,
      severity: "elevated" as const,
      status: "resolved" as const,
      ruleId: "bp_trend_rising",
      ruleName: "Blood Pressure Trend Detection",
      title: "Rising BP Trend",
      description:
        "Systolic BP has trended upward from 135 to 148 mmHg over the past 7 days. " +
        "Evening Lisinopril adherence has dropped to approximately 50%. " +
        "Recommend provider review.",
      vitalsSnapshot: {
        systolicRange: [135, 148],
        diastolicRange: [82, 90],
        trendDays: 7,
      },
      resolvedAt: dayTime(75, 10, 30),
      resolvedBy: PROVIDER_PATEL_ID,
      resolutionNote: "Reviewed with patient. Resuming evening doses. Follow-up in 1 week.",
      createdAt: dayTime(70, 9, 15),
    },
    {
      id: ALERT_MARGARET_ELEVATED_BP_ID,
      patientId: PATIENT_MARGARET_ID,
      severity: "elevated" as const,
      status: "resolved" as const,
      ruleId: "bp_threshold_high",
      ruleName: "Blood Pressure Threshold Alert",
      title: "Elevated BP",
      description:
        "Systolic BP reading of 158 mmHg exceeds the 150 mmHg threshold. " +
        "Patient has had multiple elevated readings this week. " +
        "Medication adherence for evening Lisinopril is approximately 30%.",
      vitalsSnapshot: {
        systolicBp: 158,
        diastolicBp: 94,
        heartRate: 84,
      },
      resolvedAt: dayTime(75, 10, 30),
      resolvedBy: PROVIDER_PATEL_ID,
      resolutionNote: "Addressed during same call as rising BP alert. Patient education on adherence importance.",
      createdAt: dayTime(73, 8, 45),
    },
    {
      id: ALERT_MARGARET_RESOLVED_ID,
      patientId: PATIENT_MARGARET_ID,
      severity: "informational" as const,
      status: "resolved" as const,
      ruleId: "provider_action",
      ruleName: "Provider Intervention Logged",
      title: "Provider reviewed and called patient",
      description:
        "Dr. Sarah Patel reviewed Margaret Chen's rising BP trend and declining medication adherence. " +
        "Called patient to discuss. Patient reports difficulty remembering evening dose. " +
        "Set up phone reminder. Patient agreed to resume full medication schedule.",
      vitalsSnapshot: null,
      resolvedAt: dayTime(75, 11, 0),
      resolvedBy: PROVIDER_PATEL_ID,
      resolutionNote: "Intervention complete. Monitoring for improvement over next 7-10 days.",
      createdAt: dayTime(75, 10, 0),
    },

    // James Rodriguez — weight gain
    {
      id: ALERT_JAMES_WEIGHT_ID,
      patientId: PATIENT_JAMES_ID,
      severity: "elevated" as const,
      status: "active" as const,
      ruleId: "weight_trend_gain",
      ruleName: "Weight Gain Trend Detection",
      title: "Weight Gain Trend",
      description:
        "Weight has increased from 185 lbs to 189 lbs over the past 5 days. " +
        "Patient has CHF — weight gain may indicate fluid retention. " +
        "Recommend provider review and possible diuretic adjustment.",
      vitalsSnapshot: {
        weightStart: 185,
        weightCurrent: 189,
        trendDays: 5,
        dailyGain: 0.8,
      },
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      createdAt: dayTime(75, 14, 20),
    },

    // Robert Kim — O2 episodes
    {
      id: ALERT_ROBERT_O2_FIRST_ID,
      patientId: PATIENT_ROBERT_ID,
      severity: "elevated" as const,
      status: "resolved" as const,
      ruleId: "spo2_low",
      ruleName: "Low Oxygen Saturation Alert",
      title: "Low O2 Saturation",
      description:
        "SpO2 reading of 92% is below the 94% threshold. " +
        "Patient has COPD — monitor for sustained drops.",
      vitalsSnapshot: {
        oxygenSaturation: 92,
        heartRate: 78,
      },
      resolvedAt: dayTime(68, 16, 0),
      resolvedBy: PROVIDER_PATEL_ID,
      resolutionNote: "Transient drop during activity. Normal at rest. Continue monitoring.",
      createdAt: dayTime(65, 8, 30),
    },
    {
      id: ALERT_ROBERT_O2_SECOND_ID,
      patientId: PATIENT_ROBERT_ID,
      severity: "elevated" as const,
      status: "active" as const,
      ruleId: "spo2_low",
      ruleName: "Low Oxygen Saturation Alert",
      title: "Low O2 Saturation",
      description:
        "SpO2 reading of 93% is below the 94% threshold. " +
        "Second episode in 15 days. Patient has COPD. " +
        "Recommend provider follow-up.",
      vitalsSnapshot: {
        oxygenSaturation: 93,
        heartRate: 80,
      },
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      createdAt: dayTime(80, 7, 45),
    },

    // Informational alerts
    {
      id: uuidv4(),
      patientId: PATIENT_SARAH_ID,
      severity: "informational" as const,
      status: "resolved" as const,
      ruleId: "rpm_monthly_check",
      ruleName: "Monthly RPM Review",
      title: "Monthly RPM Review Complete",
      description:
        "All vitals within normal range for the past 30 days. " +
        "Glucose well controlled (avg 105 mg/dL). Full medication adherence.",
      vitalsSnapshot: null,
      resolvedAt: dayTime(60, 12, 0),
      resolvedBy: PROVIDER_TORRES_ID,
      resolutionNote: "Reviewed. Patient doing well. No changes needed.",
      createdAt: dayTime(60, 10, 0),
    },
    {
      id: uuidv4(),
      patientId: PATIENT_AISHA_ID,
      severity: "informational" as const,
      status: "resolved" as const,
      ruleId: "bp_stabilizing",
      ruleName: "Blood Pressure Trend Detection",
      title: "BP Stabilizing on Current Regimen",
      description:
        "Blood pressure variability has decreased over the past 30 days. " +
        "Current average: 132/82 mmHg. Medication regimen appears effective.",
      vitalsSnapshot: {
        systolicAvg: 132,
        diastolicAvg: 82,
        varianceReduction: "42%",
      },
      resolvedAt: dayTime(50, 11, 0),
      resolvedBy: PROVIDER_TORRES_ID,
      resolutionNote: "Positive trend. Continue current regimen.",
      createdAt: dayTime(45, 9, 0),
    },
    {
      id: uuidv4(),
      patientId: PATIENT_MARGARET_ID,
      severity: "informational" as const,
      status: "resolved" as const,
      ruleId: "rpm_monthly_check",
      ruleName: "Monthly RPM Review",
      title: "Monthly RPM Review Complete",
      description:
        "30-day review for Margaret Chen. Vitals stable. " +
        "BP averaging 130/81 mmHg. Glucose averaging 115 mg/dL. Full adherence.",
      vitalsSnapshot: {
        systolicAvg: 130,
        diastolicAvg: 81,
        glucoseAvg: 115,
      },
      resolvedAt: dayTime(30, 15, 0),
      resolvedBy: PROVIDER_PATEL_ID,
      resolutionNote: "All within target. No changes.",
      createdAt: dayTime(30, 10, 0),
    },
  ];
}

// ---------------------------------------------------------------------------
// Billing Codes
// ---------------------------------------------------------------------------

function buildBillingCodes() {
  return [
    {
      id: BC_99453_ID,
      code: "99453",
      description: "Remote physiologic monitoring setup and patient education on use of equipment",
      category: "RPM",
      reimbursementAmount: 19.0,
    },
    {
      id: BC_99454_ID,
      code: "99454",
      description: "Remote physiologic monitoring device(s) supply with daily recording(s) or programmed alert(s), each 30 days",
      category: "RPM",
      reimbursementAmount: 55.0,
    },
    {
      id: BC_99457_ID,
      code: "99457",
      description: "Remote physiologic monitoring treatment management services, clinical staff time first 20 minutes",
      category: "RPM",
      reimbursementAmount: 51.0,
    },
    {
      id: BC_99458_ID,
      code: "99458",
      description: "Remote physiologic monitoring treatment management services, clinical staff time additional 20 minutes",
      category: "RPM",
      reimbursementAmount: 42.0,
    },
    {
      id: BC_99490_ID,
      code: "99490",
      description: "Chronic care management services, first 20 minutes of clinical staff time per calendar month",
      category: "CCM",
      reimbursementAmount: 64.0,
    },
    {
      id: BC_99491_ID,
      code: "99491",
      description: "Chronic care management services provided by a physician or other qualified health care professional, first 30 minutes per calendar month",
      category: "CCM",
      reimbursementAmount: 87.0,
    },
  ];
}

// ---------------------------------------------------------------------------
// Billing Entries
// ---------------------------------------------------------------------------

function buildBillingEntries() {
  return [
    // Margaret — RPM setup at enrollment
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_MARGARET_ID,
      billingCodeId: BC_99453_ID,
      alertId: null,
      minutesSpent: 30,
      serviceDate: dayOffset(1).toISOString().split("T")[0],
      notes: "Initial RPM device setup and patient education for Margaret Chen.",
    },
    // Margaret — monthly RPM device supply (month 1)
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_MARGARET_ID,
      billingCodeId: BC_99454_ID,
      alertId: null,
      minutesSpent: 0,
      serviceDate: dayOffset(30).toISOString().split("T")[0],
      notes: "Month 1 RPM device supply. 28 of 30 reading days.",
    },
    // Margaret — monthly RPM device supply (month 2)
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_MARGARET_ID,
      billingCodeId: BC_99454_ID,
      alertId: null,
      minutesSpent: 0,
      serviceDate: dayOffset(60).toISOString().split("T")[0],
      notes: "Month 2 RPM device supply. 30 of 30 reading days.",
    },
    // Margaret — RPM clinical time for the intervention on day 75
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_MARGARET_ID,
      billingCodeId: BC_99457_ID,
      alertId: ALERT_MARGARET_RESOLVED_ID,
      minutesSpent: 25,
      serviceDate: dayOffset(75).toISOString().split("T")[0],
      notes: "Reviewed rising BP trend and declining adherence. Phone call with patient. Medication counseling.",
    },
    // Margaret — CCM for complex management
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_MARGARET_ID,
      billingCodeId: BC_99491_ID,
      alertId: null,
      minutesSpent: 35,
      serviceDate: dayOffset(75).toISOString().split("T")[0],
      notes: "Complex CCM — coordinated care for hypertension, diabetes, and CHF. Reviewed all vitals trends, adjusted monitoring plan.",
    },
    // James — RPM setup
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_JAMES_ID,
      billingCodeId: BC_99453_ID,
      alertId: null,
      minutesSpent: 25,
      serviceDate: dayOffset(1).toISOString().split("T")[0],
      notes: "Initial RPM device setup and patient education for James Rodriguez.",
    },
    // James — monthly device supply (month 1)
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_JAMES_ID,
      billingCodeId: BC_99454_ID,
      alertId: null,
      minutesSpent: 0,
      serviceDate: dayOffset(30).toISOString().split("T")[0],
      notes: "Month 1 RPM device supply. 27 of 30 reading days.",
    },
    // Robert — RPM setup
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_ROBERT_ID,
      billingCodeId: BC_99453_ID,
      alertId: null,
      minutesSpent: 30,
      serviceDate: dayOffset(1).toISOString().split("T")[0],
      notes: "Initial RPM device setup and patient education for Robert Kim.",
    },
    // Robert — RPM clinical time for first O2 alert
    {
      providerId: PROVIDER_PATEL_ID,
      patientId: PATIENT_ROBERT_ID,
      billingCodeId: BC_99457_ID,
      alertId: ALERT_ROBERT_O2_FIRST_ID,
      minutesSpent: 20,
      serviceDate: dayOffset(66).toISOString().split("T")[0],
      notes: "Reviewed low O2 saturation alert. Confirmed transient drop during activity. Educated patient on monitoring.",
    },
    // Sarah — RPM setup
    {
      providerId: PROVIDER_TORRES_ID,
      patientId: PATIENT_SARAH_ID,
      billingCodeId: BC_99453_ID,
      alertId: null,
      minutesSpent: 20,
      serviceDate: dayOffset(1).toISOString().split("T")[0],
      notes: "Initial RPM device setup and patient education for Sarah Williams.",
    },
    // Sarah — CCM
    {
      providerId: PROVIDER_TORRES_ID,
      patientId: PATIENT_SARAH_ID,
      billingCodeId: BC_99490_ID,
      alertId: null,
      minutesSpent: 20,
      serviceDate: dayOffset(30).toISOString().split("T")[0],
      notes: "Monthly CCM — reviewed diabetes management. All metrics within target.",
    },
    // Aisha — RPM setup
    {
      providerId: PROVIDER_TORRES_ID,
      patientId: PATIENT_AISHA_ID,
      billingCodeId: BC_99453_ID,
      alertId: null,
      minutesSpent: 20,
      serviceDate: dayOffset(1).toISOString().split("T")[0],
      notes: "Initial RPM device setup and patient education for Aisha Patel.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function seed() {
  console.log("Starting CareCompanion seed...\n");
  const t0 = Date.now();

  // -----------------------------------------------------------------------
  // 1. Clear all tables in reverse FK order
  // -----------------------------------------------------------------------
  console.log("Clearing existing data...");

  // billingEntries -> billingCodes, alerts -> chatMessages -> medicationLogs
  // -> medications -> vitals -> caregivers -> patients -> providers
  await db.delete(billingEntries);
  await db.delete(billingCodes);
  await db.delete(chatMessages);
  await db.delete(medicationLogs);
  await db.delete(alerts);
  await db.delete(medications);
  await db.delete(vitals);
  await db.delete(caregivers);
  await db.delete(patients);
  await db.delete(providers);

  console.log("  All tables cleared.\n");

  // -----------------------------------------------------------------------
  // 2. Seed providers
  // -----------------------------------------------------------------------
  const providerRows = buildProviders();
  await db.insert(providers).values(providerRows);
  console.log(`  Providers: ${providerRows.length}`);

  // -----------------------------------------------------------------------
  // 3. Seed patients
  // -----------------------------------------------------------------------
  const patientRows = buildPatients();
  await db.insert(patients).values(patientRows);
  console.log(`  Patients:  ${patientRows.length}`);

  // -----------------------------------------------------------------------
  // 4. Seed caregivers
  // -----------------------------------------------------------------------
  const caregiverRows = buildCaregivers();
  await db.insert(caregivers).values(caregiverRows);
  console.log(`  Caregivers: ${caregiverRows.length}`);

  // -----------------------------------------------------------------------
  // 5. Seed medications
  // -----------------------------------------------------------------------
  const medDefs = buildMedicationDefs();
  const medRecords = buildMedicationRecords(medDefs);
  await db.insert(medications).values(medRecords);
  console.log(`  Medications: ${medRecords.length}`);

  // -----------------------------------------------------------------------
  // 6. Seed medication adherence logs
  // -----------------------------------------------------------------------
  const medLogEntries = buildMedicationLogs(medRecords, medDefs);
  // Batch insert in chunks to avoid hitting query size limits
  const MED_LOG_BATCH_SIZE = 500;
  for (let i = 0; i < medLogEntries.length; i += MED_LOG_BATCH_SIZE) {
    const batch = medLogEntries.slice(i, i + MED_LOG_BATCH_SIZE);
    await db.insert(medicationLogs).values(batch);
  }
  console.log(`  Medication logs: ${medLogEntries.length}`);

  // -----------------------------------------------------------------------
  // 7. Seed vitals
  // -----------------------------------------------------------------------
  const vitalRows = buildAllVitals();
  // Batch insert in chunks
  const VITALS_BATCH_SIZE = 500;
  for (let i = 0; i < vitalRows.length; i += VITALS_BATCH_SIZE) {
    const batch = vitalRows.slice(i, i + VITALS_BATCH_SIZE);
    await db.insert(vitals).values(batch);
  }
  console.log(`  Vitals:    ${vitalRows.length}`);

  // -----------------------------------------------------------------------
  // 8. Seed alerts
  // -----------------------------------------------------------------------
  const alertRows = buildAlerts();
  await db.insert(alerts).values(alertRows);
  console.log(`  Alerts:    ${alertRows.length}`);

  // -----------------------------------------------------------------------
  // 9. Seed billing codes
  // -----------------------------------------------------------------------
  const billingCodeRows = buildBillingCodes();
  await db.insert(billingCodes).values(billingCodeRows);
  console.log(`  Billing codes: ${billingCodeRows.length}`);

  // -----------------------------------------------------------------------
  // 10. Seed billing entries
  // -----------------------------------------------------------------------
  const billingEntryRows = buildBillingEntries();
  await db.insert(billingEntries).values(billingEntryRows);
  console.log(`  Billing entries: ${billingEntryRows.length}`);

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nSeed complete in ${elapsed}s.`);
  console.log("---------------------------------------------");
  console.log(`  Providers:        ${providerRows.length}`);
  console.log(`  Patients:         ${patientRows.length}`);
  console.log(`  Caregivers:       ${caregiverRows.length}`);
  console.log(`  Medications:      ${medRecords.length}`);
  console.log(`  Medication logs:  ${medLogEntries.length}`);
  console.log(`  Vitals:           ${vitalRows.length}`);
  console.log(`  Alerts:           ${alertRows.length}`);
  console.log(`  Billing codes:    ${billingCodeRows.length}`);
  console.log(`  Billing entries:  ${billingEntryRows.length}`);
  console.log("---------------------------------------------");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

seed()
  .then(() => {
    console.log("\nDone.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
