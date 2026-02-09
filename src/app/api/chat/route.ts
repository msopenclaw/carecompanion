import { db } from "@/lib/db";
import {
  patients,
  vitals,
  medications,
  medicationLogs,
  alerts,
} from "@/lib/db/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { messages, patientId } = body as {
      messages: { role: string; content: string }[];
      patientId: string;
    };

    if (!messages || !patientId) {
      return Response.json(
        { error: "messages and patientId are required" },
        { status: 400 }
      );
    }

    // -----------------------------------------------------------------------
    // Build patient context from the database
    // -----------------------------------------------------------------------

    // 1. Patient info
    const patientRows = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId))
      .limit(1);

    if (patientRows.length === 0) {
      return Response.json({ error: "Patient not found" }, { status: 404 });
    }

    const patient = patientRows[0];
    const age = Math.floor(
      (Date.now() - new Date(patient.dateOfBirth).getTime()) /
        (365.25 * 24 * 60 * 60 * 1000)
    );

    // 2. Last 7 days of vitals
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentVitals = await db
      .select()
      .from(vitals)
      .where(
        and(
          eq(vitals.patientId, patientId),
          gte(vitals.recordedAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(vitals.recordedAt));

    // 3. Active medications
    const activeMeds = await db
      .select()
      .from(medications)
      .where(
        and(
          eq(medications.patientId, patientId),
          eq(medications.isActive, true)
        )
      );

    // 4. Medication adherence rate (last 7 days)
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

    const totalLogs = adherenceResult[0]?.total ?? 0;
    const takenLogs = adherenceResult[0]?.taken ?? 0;
    const adherenceRate =
      totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : 100;

    // 5. Active alerts
    const activeAlerts = await db
      .select()
      .from(alerts)
      .where(
        and(eq(alerts.patientId, patientId), eq(alerts.status, "active"))
      );

    // -----------------------------------------------------------------------
    // Format context for the system prompt
    // -----------------------------------------------------------------------

    const vitalsText =
      recentVitals.length > 0
        ? recentVitals
            .slice(0, 30) // limit to most recent 30 readings
            .map(
              (v) =>
                `  - ${v.vitalType}: ${v.value} ${v.unit} (${new Date(v.recordedAt).toLocaleDateString()})`
            )
            .join("\n")
        : "  No recent vitals recorded.";

    const medsText =
      activeMeds.length > 0
        ? activeMeds
            .map(
              (m) =>
                `  - ${m.name} ${m.dosage}, ${m.frequency} (scheduled: ${(m.scheduledTimes as string[]).join(", ")})`
            )
            .join("\n")
        : "  No active medications.";

    const alertsText =
      activeAlerts.length > 0
        ? activeAlerts
            .map(
              (a) =>
                `  - [${a.severity.toUpperCase()}] ${a.title}: ${a.description ?? "No details"}`
            )
            .join("\n")
        : "  No active alerts.";

    const systemPrompt = `You are CareCompanion AI, a warm and empathetic virtual health assistant for elderly patients in a Remote Patient Monitoring (RPM) program. You communicate clearly, patiently, and in plain language.

PATIENT CONTEXT:
- Name: ${patient.firstName} ${patient.lastName}
- Age: ${age} years old
- Gender: ${patient.gender}
- Conditions: ${(patient.conditions as string[]).join(", ") || "None listed"}
- Status: ${patient.statusBadge}

CURRENT MEDICATIONS:
${medsText}

RECENT VITALS (Last 7 Days):
${vitalsText}

MEDICATION ADHERENCE (Last 7 Days): ${adherenceRate}% (${takenLogs} of ${totalLogs} doses taken)

ACTIVE ALERTS:
${alertsText}

SAFETY RULES - YOU MUST FOLLOW THESE AT ALL TIMES:
1. NEVER diagnose conditions or provide a medical diagnosis.
2. NEVER recommend changing, starting, or stopping medications.
3. ALWAYS suggest contacting their healthcare provider when medical advice is needed.
4. For ANY emergency symptoms (chest pain, difficulty breathing, severe bleeding, stroke symptoms, loss of consciousness), IMMEDIATELY tell them to call 911 or go to the nearest emergency room.
5. You may provide general wellness information, medication reminders, and emotional support.
6. When discussing vitals, you can note trends but must defer to their provider for interpretation.
7. Always maintain a warm, respectful tone appropriate for elderly patients.
8. Keep responses concise but caring - avoid overwhelming with information.
9. If asked about your capabilities, be transparent that you are an AI assistant and not a medical professional.`;

    // -----------------------------------------------------------------------
    // Check if ANTHROPIC_API_KEY is configured
    // -----------------------------------------------------------------------

    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      // Return a mock streaming response
      return createMockStreamResponse(patient, recentVitals, adherenceRate, activeMeds);
    }

    // -----------------------------------------------------------------------
    // Call Claude API with streaming
    // -----------------------------------------------------------------------

    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });

    const stream = await client.messages.stream({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
    });

    // Convert the Anthropic SDK stream to a ReadableStream for SSE
    const encoder = new TextEncoder();
    const readableStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({ text: event.delta.text });
              controller.enqueue(
                encoder.encode(`data: ${data}\n\n`)
              );
            }
          }

          // Send done event
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          const errorData = JSON.stringify({
            error: "Stream interrupted",
          });
          controller.enqueue(
            encoder.encode(`data: ${errorData}\n\n`)
          );
          controller.close();
        }
      },
    });

    return new Response(readableStream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Error in chat route:", error);
    return Response.json(
      { error: "Failed to process chat request" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Mock streaming response when ANTHROPIC_API_KEY is not set
// ---------------------------------------------------------------------------

function createMockStreamResponse(
  patient: { firstName: string; lastName: string },
  recentVitals: { vitalType: string; value: number; unit: string; recordedAt: Date }[],
  adherenceRate: number,
  activeMeds: { name: string; dosage: string }[]
) {
  // Find the most recent blood pressure reading for context
  const latestBP = recentVitals.find(
    (v) => v.vitalType === "blood_pressure_systolic"
  );
  const bpValue = latestBP ? `${latestBP.value} ${latestBP.unit}` : "elevated";

  const medNames = activeMeds.map((m) => m.name).join(", ");

  const mockResponse =
    `Good morning, ${patient.firstName}. I noticed your blood pressure has been trending ` +
    `upward over the past few days. Your most recent reading was ${bpValue}. ` +
    (adherenceRate < 90
      ? `I also see that your medication adherence has been at ${adherenceRate}% this week. `
      : "") +
    (medNames
      ? `This could be related to missed doses of your medications (${medNames}). `
      : "") +
    `Would you like me to set up a reminder for your medications, or should I alert ` +
    `your care team about this trend? And remember, if you ever feel chest pain, ` +
    `dizziness, or severe headaches, please call 911 right away.`;

  // Stream the mock response word by word with a small delay
  const words = mockResponse.split(" ");
  const encoder = new TextEncoder();

  const readableStream = new ReadableStream({
    async start(controller) {
      for (let i = 0; i < words.length; i++) {
        const word = (i === 0 ? "" : " ") + words[i];
        const data = JSON.stringify({ text: word });
        controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        // Simulate typing delay (~30ms per word)
        await new Promise((resolve) => setTimeout(resolve, 30));
      }

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(readableStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
