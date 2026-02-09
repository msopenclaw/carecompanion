import { db } from "@/lib/db";
import { patients, providers } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const allPatients = await db
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
      })
      .from(patients)
      .leftJoin(providers, eq(patients.assignedProviderId, providers.id));

    return Response.json(allPatients);
  } catch (error) {
    console.error("Error fetching patients:", error);
    return Response.json(
      { error: "Failed to fetch patients" },
      { status: 500 }
    );
  }
}
