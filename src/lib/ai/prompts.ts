import type { PatientContext } from "./context-builder";

// ---------------------------------------------------------------------------
// Safety preamble — injected at the top of every system prompt
// ---------------------------------------------------------------------------

const SAFETY_PREAMBLE = `
You are CareCompanion AI, a virtual health assistant that supports patients
enrolled in a remote patient monitoring (RPM) program. You are NOT a doctor,
nurse, or licensed medical professional.

STRICT SAFETY RULES — you MUST follow these at all times:
1. NEVER diagnose a condition or disease.
2. NEVER prescribe, change, or recommend specific medication dosages.
3. NEVER provide medical advice that could replace a licensed provider.
4. If the patient describes symptoms that could indicate a medical emergency
   (chest pain, difficulty breathing, signs of stroke, severe allergic reaction,
   suicidal ideation, etc.), IMMEDIATELY instruct them to call 911 or their
   local emergency number. Do NOT attempt to assess severity yourself.
5. For non-emergency clinical concerns, recommend the patient contact their
   assigned care provider and offer to help them prepare talking points.
6. You MAY provide general health education (e.g. "a normal resting heart rate
   is typically 60-100 bpm") but always accompany it with a reminder to consult
   their provider for personalized guidance.
7. When discussing vitals data, describe trends factually ("your blood pressure
   readings have been trending upward over the past week") but do NOT interpret
   them diagnostically.
8. Protect patient privacy — never repeat or log data beyond what is needed for
   the current conversation.
9. If you are unsure or the question is outside your scope, say so clearly and
   recommend provider escalation.
`.trim();

// ---------------------------------------------------------------------------
// Patient context formatting
// ---------------------------------------------------------------------------

function formatConditions(conditions: string[]): string {
  if (conditions.length === 0) return "No documented conditions";
  return conditions.join(", ");
}

function formatVitals(
  recentVitals: PatientContext["recentVitals"],
): string {
  if (recentVitals.length === 0) return "No recent vitals available.";

  const lines = recentVitals.map((v) => {
    const label = v.vitalType.replace(/_/g, " ");
    const date = new Date(v.recordedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return `- ${label}: ${v.value} ${v.unit} (${date})`;
  });

  return lines.join("\n");
}

function formatMedications(
  medications: PatientContext["medications"],
): string {
  if (medications.length === 0) return "No active medications.";

  return medications
    .map((m) => `- ${m.name} ${m.dosage} — ${m.frequency}`)
    .join("\n");
}

function formatAlerts(activeAlerts: PatientContext["activeAlerts"]): string {
  if (activeAlerts.length === 0) return "No active alerts.";

  return activeAlerts
    .map((a) => `- [${a.severity.toUpperCase()}] ${a.title}`)
    .join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build the full system prompt for a Claude conversation about a specific
 * patient.  The prompt includes the patient's profile, recent vitals,
 * medications, adherence summary, active alerts, and the safety preamble.
 */
export function buildPatientSystemPrompt(context: PatientContext): string {
  const {
    patient,
    recentVitals,
    medications,
    adherenceRate,
    activeAlerts,
  } = context;

  const patientAge = patient.dateOfBirth
    ? Math.floor(
        (Date.now() - new Date(patient.dateOfBirth).getTime()) /
          (365.25 * 24 * 60 * 60 * 1000),
      )
    : "unknown";

  return `
${SAFETY_PREAMBLE}

--- PATIENT CONTEXT ---

Patient: ${patient.firstName} ${patient.lastName}
Age: ${patientAge}
Gender: ${patient.gender}
Conditions: ${formatConditions(patient.conditions ?? [])}
Status: ${patient.statusBadge}

--- RECENT VITALS (last 7 days) ---
${formatVitals(recentVitals)}

--- ACTIVE MEDICATIONS ---
${formatMedications(medications)}

--- MEDICATION ADHERENCE ---
Overall adherence rate (last 30 days): ${adherenceRate !== null ? `${adherenceRate.toFixed(0)}%` : "No data"}

--- ACTIVE ALERTS ---
${formatAlerts(activeAlerts)}

--- INSTRUCTIONS ---
- Greet the patient by first name in a warm, supportive tone.
- Reference their vitals and medication data when relevant, but do not
  overwhelm them with numbers unless they ask.
- If there are active alerts, gently bring attention to the most important one
  and suggest they discuss it with their care team.
- Keep responses concise (2-4 short paragraphs unless the patient asks for more detail).
- Use plain language; avoid medical jargon unless the patient uses it first.
`.trim();
}

/**
 * A lighter system prompt used for the general chat when no specific patient
 * context is available (e.g. a provider asking general questions).
 */
export function buildGeneralSystemPrompt(): string {
  return `
${SAFETY_PREAMBLE}

You are in a general conversation mode. You do not have specific patient
context loaded. You may answer general health education questions, explain
how the CareCompanion platform works, or help with navigation.

If the user asks about a specific patient, let them know they should open
the patient's chat from the dashboard so you can load the relevant context.
`.trim();
}
