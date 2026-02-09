import { db } from "@/lib/db";
import { medicationLogs } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { medicationId, patientId, scheduledAt } = body as {
      medicationId: string;
      patientId: string;
      scheduledAt: string;
    };

    if (!medicationId || !patientId || !scheduledAt) {
      return Response.json(
        { error: "medicationId, patientId, and scheduledAt are required" },
        { status: 400 }
      );
    }

    const scheduledDate = new Date(scheduledAt);
    const now = new Date();

    // Try to find an existing log entry for this medication at this scheduled time
    const existingLogs = await db
      .select()
      .from(medicationLogs)
      .where(
        and(
          eq(medicationLogs.medicationId, medicationId),
          eq(medicationLogs.patientId, patientId),
          eq(medicationLogs.scheduledAt, scheduledDate)
        )
      )
      .limit(1);

    let result;

    if (existingLogs.length > 0) {
      // Update existing log entry
      const updated = await db
        .update(medicationLogs)
        .set({
          status: "taken",
          takenAt: now,
          updatedAt: now,
        })
        .where(eq(medicationLogs.id, existingLogs[0].id))
        .returning();

      result = updated[0];
    } else {
      // Create a new log entry
      const inserted = await db
        .insert(medicationLogs)
        .values({
          medicationId,
          patientId,
          scheduledAt: scheduledDate,
          takenAt: now,
          status: "taken",
        })
        .returning();

      result = inserted[0];
    }

    return Response.json(result);
  } catch (error) {
    console.error("Error logging medication:", error);
    return Response.json(
      { error: "Failed to log medication" },
      { status: 500 }
    );
  }
}
