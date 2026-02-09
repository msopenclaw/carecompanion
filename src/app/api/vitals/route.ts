import { db } from "@/lib/db";
import { vitals } from "@/lib/db/schema";
import { eq, and, gte, asc } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const patientId = searchParams.get("patientId");
    const range = searchParams.get("range") ?? "7";
    const type = searchParams.get("type");

    if (!patientId) {
      return Response.json(
        { error: "patientId is required" },
        { status: 400 }
      );
    }

    // Calculate date range
    const days = parseInt(range, 10);
    if (![7, 30, 90].includes(days)) {
      return Response.json(
        { error: "range must be 7, 30, or 90" },
        { status: 400 }
      );
    }

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build conditions
    const conditions: SQL[] = [
      eq(vitals.patientId, patientId),
      gte(vitals.recordedAt, startDate),
    ];

    if (type) {
      conditions.push(
        eq(
          vitals.vitalType,
          type as
            | "blood_pressure_systolic"
            | "blood_pressure_diastolic"
            | "heart_rate"
            | "blood_glucose"
            | "weight"
            | "oxygen_saturation"
            | "temperature"
        )
      );
    }

    const result = await db
      .select()
      .from(vitals)
      .where(and(...conditions))
      .orderBy(asc(vitals.recordedAt));

    return Response.json(result);
  } catch (error) {
    console.error("Error fetching vitals:", error);
    return Response.json(
      { error: "Failed to fetch vitals" },
      { status: 500 }
    );
  }
}
