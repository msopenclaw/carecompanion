import { db } from "@/lib/db";
import { billingEntries, billingCodes, patients, providers } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("providerId");

    // Build where conditions
    const conditions: SQL[] = [];
    if (providerId) {
      conditions.push(eq(billingEntries.providerId, providerId));
    }

    const whereClause =
      conditions.length > 0 ? conditions[0] : undefined;

    // Fetch billing entries with joined billing code and patient info
    const entries = await db
      .select({
        id: billingEntries.id,
        providerId: billingEntries.providerId,
        patientId: billingEntries.patientId,
        billingCodeId: billingEntries.billingCodeId,
        alertId: billingEntries.alertId,
        minutesSpent: billingEntries.minutesSpent,
        serviceDate: billingEntries.serviceDate,
        notes: billingEntries.notes,
        createdAt: billingEntries.createdAt,
        updatedAt: billingEntries.updatedAt,
        // Billing code info
        billingCode: billingCodes.code,
        billingCodeDescription: billingCodes.description,
        billingCodeCategory: billingCodes.category,
        reimbursementAmount: billingCodes.reimbursementAmount,
        // Patient info
        patientFirstName: patients.firstName,
        patientLastName: patients.lastName,
        // Provider info
        providerFirstName: providers.firstName,
        providerLastName: providers.lastName,
      })
      .from(billingEntries)
      .innerJoin(billingCodes, eq(billingEntries.billingCodeId, billingCodes.id))
      .innerJoin(patients, eq(billingEntries.patientId, patients.id))
      .innerJoin(providers, eq(billingEntries.providerId, providers.id))
      .where(whereClause);

    // Calculate summary
    const summaryResult = await db
      .select({
        totalEntries: sql<number>`count(*)::int`,
        totalMinutes: sql<number>`coalesce(sum(${billingEntries.minutesSpent}), 0)::int`,
        totalRevenue: sql<number>`coalesce(sum(${billingCodes.reimbursementAmount}), 0)::numeric`,
      })
      .from(billingEntries)
      .innerJoin(billingCodes, eq(billingEntries.billingCodeId, billingCodes.id))
      .where(whereClause);

    const summary = {
      totalEntries: summaryResult[0]?.totalEntries ?? 0,
      totalMinutes: summaryResult[0]?.totalMinutes ?? 0,
      totalRevenue: Number(summaryResult[0]?.totalRevenue ?? 0),
    };

    return Response.json({ entries, summary });
  } catch (error) {
    console.error("Error fetching billing data:", error);
    return Response.json(
      { error: "Failed to fetch billing data" },
      { status: 500 }
    );
  }
}
