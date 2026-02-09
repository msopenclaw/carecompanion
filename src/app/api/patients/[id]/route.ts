import { db } from "@/lib/db";
import {
  patients,
  providers,
  vitals,
  medications,
  medicationLogs,
  alerts,
} from "@/lib/db/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const patientId = params.id;

    // 1. Get the patient with their assigned provider
    const patientRows = await db
      .select({
        id: patients.id,
        firstName: patients.firstName,
        lastName: patients.lastName,
        dateOfBirth: patients.dateOfBirth,
        gender: patients.gender,
        conditions: patients.conditions,
        statusBadge: patients.statusBadge,
        assignedProviderId: patients.assignedProviderId,
        phone: patients.phone,
        email: patients.email,
        createdAt: patients.createdAt,
        updatedAt: patients.updatedAt,
        providerFirstName: providers.firstName,
        providerLastName: providers.lastName,
        providerSpecialty: providers.specialty,
      })
      .from(patients)
      .leftJoin(providers, eq(patients.assignedProviderId, providers.id))
      .where(eq(patients.id, patientId))
      .limit(1);

    if (patientRows.length === 0) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    const patient = patientRows[0];

    // 2. Get latest vitals (one per type) using a subquery approach
    // We get the most recent vital of each type for this patient
    const latestVitals = await db
      .select({
        id: vitals.id,
        vitalType: vitals.vitalType,
        value: vitals.value,
        unit: vitals.unit,
        recordedAt: vitals.recordedAt,
        source: vitals.source,
      })
      .from(vitals)
      .where(eq(vitals.patientId, patientId))
      .orderBy(desc(vitals.recordedAt));

    // Deduplicate to get one per type (most recent first)
    const latestByType = new Map<string, (typeof latestVitals)[0]>();
    for (const v of latestVitals) {
      if (!latestByType.has(v.vitalType)) {
        latestByType.set(v.vitalType, v);
      }
    }
    const latestVitalsSummary = Array.from(latestByType.values());

    // 3. Get active medications
    const activeMedications = await db
      .select()
      .from(medications)
      .where(
        and(
          eq(medications.patientId, patientId),
          eq(medications.isActive, true)
        )
      );

    // 4. Get active alerts count
    const activeAlertsResult = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(alerts)
      .where(
        and(eq(alerts.patientId, patientId), eq(alerts.status, "active"))
      );

    const activeAlertsCount = activeAlertsResult[0]?.count ?? 0;

    // 5. Medication adherence rate for last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const adherenceResult = await db
      .select({
        total: sql<number>`count(*)::int`,
        taken: sql<number>`count(*) filter (where ${medicationLogs.status} = 'taken')::int`,
      })
      .from(medicationLogs)
      .where(
        and(
          eq(medicationLogs.patientId, patientId),
          gte(medicationLogs.scheduledAt, sevenDaysAgo)
        )
      );

    const total = adherenceResult[0]?.total ?? 0;
    const taken = adherenceResult[0]?.taken ?? 0;
    const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

    return Response.json({
      ...patient,
      latestVitals: latestVitalsSummary,
      activeMedications,
      activeAlertsCount,
      adherenceRate,
    });
  } catch (error) {
    console.error("Error fetching patient:", error);
    return Response.json(
      { error: "Failed to fetch patient" },
      { status: 500 }
    );
  }
}
