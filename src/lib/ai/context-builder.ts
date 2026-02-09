import { and, eq, gte, desc, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  patients,
  vitals,
  medications,
  medicationLogs,
  alerts,
  type Patient,
  type Vital,
  type Medication,
  type Alert,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PatientContext {
  patient: Patient;
  recentVitals: Vital[];
  medications: Medication[];
  /** Adherence rate as a percentage (0-100), or null if no data. */
  adherenceRate: number | null;
  activeAlerts: Alert[];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Query all relevant patient data needed to build the AI system prompt and
 * display context in the UI.
 *
 * @param patientId - The UUID of the patient.
 * @param db - The Drizzle database instance.
 * @returns A fully-hydrated PatientContext or null if the patient is not found.
 */
export async function buildPatientContext(
  patientId: string,
  db: Database,
): Promise<PatientContext | null> {
  // ------------------------------------------------------------------
  // 1. Fetch the patient record
  // ------------------------------------------------------------------
  const patientRows = await db
    .select()
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);

  const patient = patientRows[0];
  if (!patient) return null;

  // ------------------------------------------------------------------
  // 2. Fetch recent vitals (last 7 days, up to 50 readings)
  // ------------------------------------------------------------------
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentVitals = await db
    .select()
    .from(vitals)
    .where(
      and(
        eq(vitals.patientId, patientId),
        gte(vitals.recordedAt, sevenDaysAgo),
      ),
    )
    .orderBy(desc(vitals.recordedAt))
    .limit(50);

  // ------------------------------------------------------------------
  // 3. Fetch active medications
  // ------------------------------------------------------------------
  const activeMeds = await db
    .select()
    .from(medications)
    .where(
      and(
        eq(medications.patientId, patientId),
        eq(medications.isActive, true),
      ),
    );

  // ------------------------------------------------------------------
  // 4. Calculate medication adherence (last 30 days)
  // ------------------------------------------------------------------
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const adherenceRows = await db
    .select({
      total: sql<number>`count(*)`,
      taken: sql<number>`count(*) filter (where ${medicationLogs.status} = 'taken')`,
    })
    .from(medicationLogs)
    .where(
      and(
        eq(medicationLogs.patientId, patientId),
        gte(medicationLogs.scheduledAt, thirtyDaysAgo),
      ),
    );

  const total = Number(adherenceRows[0]?.total ?? 0);
  const taken = Number(adherenceRows[0]?.taken ?? 0);
  const adherenceRate = total > 0 ? (taken / total) * 100 : null;

  // ------------------------------------------------------------------
  // 5. Fetch active alerts
  // ------------------------------------------------------------------
  const activeAlerts = await db
    .select()
    .from(alerts)
    .where(
      and(
        eq(alerts.patientId, patientId),
        eq(alerts.status, "active"),
      ),
    )
    .orderBy(desc(alerts.createdAt));

  // ------------------------------------------------------------------
  // Assemble
  // ------------------------------------------------------------------
  return {
    patient,
    recentVitals,
    medications: activeMeds,
    adherenceRate,
    activeAlerts,
  };
}
