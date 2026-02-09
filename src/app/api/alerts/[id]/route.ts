import { db } from "@/lib/db";
import { alerts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const alertId = params.id;
    const body = await request.json();

    const { status, resolutionNote } = body as {
      status: "resolved" | "acknowledged" | "dismissed";
      resolutionNote?: string;
    };

    if (!status) {
      return Response.json(
        { error: "status is required" },
        { status: 400 }
      );
    }

    const validStatuses = ["resolved", "acknowledged", "dismissed"];
    if (!validStatuses.includes(status)) {
      return Response.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 }
      );
    }

    // Build the update payload
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };

    if (status === "resolved") {
      updateData.resolvedAt = new Date();
    }

    if (resolutionNote) {
      updateData.resolutionNote = resolutionNote;
    }

    const updated = await db
      .update(alerts)
      .set(updateData)
      .where(eq(alerts.id, alertId))
      .returning();

    if (updated.length === 0) {
      return Response.json({ error: "Alert not found" }, { status: 404 });
    }

    return Response.json(updated[0]);
  } catch (error) {
    console.error("Error updating alert:", error);
    return Response.json(
      { error: "Failed to update alert" },
      { status: 500 }
    );
  }
}
