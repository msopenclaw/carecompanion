import { db } from "@/lib/db";
import { medications, medicationLogs } from "@/lib/db/schema";
import { eq, and, gte, lte } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");

    if (!patientId) {
      return Response.json(
        { error: "patientId is required" },
        { status: 400 }
      );
    }

    // Get active medications for this patient
    const activeMeds = await db
      .select()
      .from(medications)
      .where(
        and(
          eq(medications.patientId, patientId),
          eq(medications.isActive, true)
        )
      );

    // Get today's date range (start of day to end of day in UTC)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    // Get today's medication logs for this patient
    const todayLogs = await db
      .select()
      .from(medicationLogs)
      .where(
        and(
          eq(medicationLogs.patientId, patientId),
          gte(medicationLogs.scheduledAt, todayStart),
          lte(medicationLogs.scheduledAt, todayEnd)
        )
      );

    // Attach today's logs to each medication
    const medsWithLogs = activeMeds.map((med) => ({
      ...med,
      todayLogs: todayLogs.filter((log) => log.medicationId === med.id),
    }));

    return Response.json(medsWithLogs);
  } catch (error) {
    console.error("Error fetching medications:", error);
    return Response.json(
      { error: "Failed to fetch medications" },
      { status: 500 }
    );
  }
}
