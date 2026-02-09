import { db } from "@/lib/db";
import { alerts, patients } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "active";
    const patientId = searchParams.get("patientId");

    // Build conditions
    const conditions: SQL[] = [
      eq(
        alerts.status,
        status as "active" | "acknowledged" | "resolved" | "dismissed"
      ),
    ];

    if (patientId) {
      conditions.push(eq(alerts.patientId, patientId));
    }

    // Order by severity (critical first, then elevated, then informational) then by createdAt desc
    const result = await db
      .select({
        id: alerts.id,
        patientId: alerts.patientId,
        severity: alerts.severity,
        status: alerts.status,
        ruleId: alerts.ruleId,
        ruleName: alerts.ruleName,
        title: alerts.title,
        description: alerts.description,
        vitalsSnapshot: alerts.vitalsSnapshot,
        resolvedAt: alerts.resolvedAt,
        resolvedBy: alerts.resolvedBy,
        resolutionNote: alerts.resolutionNote,
        createdAt: alerts.createdAt,
        updatedAt: alerts.updatedAt,
        patientFirstName: patients.firstName,
        patientLastName: patients.lastName,
      })
      .from(alerts)
      .innerJoin(patients, eq(alerts.patientId, patients.id))
      .where(and(...conditions))
      .orderBy(
        sql`CASE ${alerts.severity}
          WHEN 'critical' THEN 1
          WHEN 'elevated' THEN 2
          WHEN 'informational' THEN 3
        END`,
        desc(alerts.createdAt)
      );

    return Response.json(result);
  } catch (error) {
    console.error("Error fetching alerts:", error);
    return Response.json(
      { error: "Failed to fetch alerts" },
      { status: 500 }
    );
  }
}
