const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { userProfiles, patientMemory, voiceSessions, aiActions, userCoordinator, careCoordinators } = require("../db/schema");
const { decrypt } = require("./encryption");
const { getCompactedContext } = require("./ehrCompaction");

/**
 * initiateOutboundCall — Call a patient via ElevenLabs Twilio integration.
 *
 * Uses the first-call prep (opening script + talking points) stored in patient_memory.
 * Falls back to a generic opening if no prep exists.
 *
 * @param {string} userId
 * @param {object} [prepOverride] — optional first-call prep to use instead of stored one (for per-run demos)
 * @returns {object} { success, callId?, error? }
 */
async function initiateOutboundCall(userId, prepOverride) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  if (!ELEVENLABS_API_KEY) throw new Error("No ELEVENLABS_API_KEY");

  console.log(`[OUTBOUND_CALL] Initiating call for user ${userId}`);

  // Load patient profile
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  if (!profile) throw new Error("No profile found");

  const firstName = decrypt(profile.firstName);
  const phone = profile.phone ? decrypt(profile.phone) : null;

  if (!phone) {
    console.log(`[OUTBOUND_CALL] No phone number for ${userId} — cannot call`);
    return { success: false, error: "no_phone_number" };
  }

  // Log masked phone for debugging
  const masked = phone.length > 4 ? phone.slice(0, -4).replace(/\d/g, '*') + phone.slice(-4) : '****';
  console.log(`[OUTBOUND_CALL] Calling ${masked} for user ${userId}`);

  // Load patient memory (needed for first_call_prep and rawRecords context)
  const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));

  // Use override if provided (per-run demo), otherwise from patient memory
  const firstCallPrep = prepOverride || mem?.tier2?.first_call_prep || null;

  // Get coordinator agent ID
  const [uc] = await db.select().from(userCoordinator).where(eq(userCoordinator.userId, userId));
  let agentId = process.env.ELEVENLABS_AGENT_ID_SARAH || process.env.ELEVENLABS_AGENT_ID;
  let coordinatorName = "Sarah";

  if (uc) {
    const [coord] = await db.select().from(careCoordinators).where(eq(careCoordinators.id, uc.coordinatorId));
    if (coord) {
      coordinatorName = coord.name;
      const agentIdMap = {
        Sarah: process.env.ELEVENLABS_AGENT_ID_SARAH,
        Michael: process.env.ELEVENLABS_AGENT_ID_MICHAEL,
        Hope: process.env.ELEVENLABS_AGENT_ID_HOPE,
        James: process.env.ELEVENLABS_AGENT_ID_JAMES,
      };
      agentId = agentIdMap[coord.name] || agentId;
    }
  }

  // Build dynamic variables — pass the full conversation guide to the agent
  const prep = firstCallPrep;
  const fallbackOpening = `Hey ${firstName}, this is ${coordinatorName} from your care team. Thanks for signing up — I wanted to check in and see how things are going. How are you feeling today?`;

  // Format conversation flow as a readable script the agent can follow
  let conversationGuide = "";
  if (prep?.conversation_flow?.length) {
    conversationGuide = prep.conversation_flow.map((phase, i) => {
      let s = `Phase ${i + 1}: ${phase.phase || phase.name || ""}`;
      if (phase.purpose) s += `\nPurpose: ${phase.purpose}`;
      if (phase.script) s += `\nScript: ${phase.script}`;
      if (phase.patient_signals_to_listen_for) s += `\nListen for: ${phase.patient_signals_to_listen_for}`;
      if (phase.pivot_if) s += `\nPivot if: ${phase.pivot_if}`;
      return s;
    }).join("\n\n");
  }

  // Format hook candidates the agent can use if the opening doesn't land
  let hookOptions = "";
  if (prep?.hook_candidates?.length) {
    hookOptions = prep.hook_candidates
      .filter(h => h.type !== "negative")
      .map(h => `- ${h.hook} (strength: ${h.strength || "medium"}, use when: ${h.when_to_use || "anytime"})`)
      .join("\n");
  }

  // Format anticipated responses so the agent knows how to react
  let anticipatedResponses = "";
  if (prep?.anticipated_responses?.length) {
    anticipatedResponses = prep.anticipated_responses.map(r =>
      `If patient says: "${r.patient_says || r.response || r}" → Respond: ${r.agent_responds || r.suggestion || ""}`
    ).join("\n");
  }

  // Get compacted patient context (3-tier memory)
  let patientContext = "";
  try {
    patientContext = await getCompactedContext(userId) || "";
  } catch (e) {
    console.error("[OUTBOUND_CALL] Failed to get compacted context:", e.message);
  }

  // Truncate helper — ElevenLabs dynamic_variables have size limits
  const trunc = (s, max = 1500) => {
    const str = String(s || "");
    return str.length > max ? str.slice(0, max) + "..." : str;
  };

  const dynamicVariables = {
    patient_name: firstName,
    coordinator_name: coordinatorName,
    opening_script: prep?.opening_script || fallbackOpening,
    hook_anchor: prep?.hook_anchor || "medication management",
    talking_points: trunc(prep?.talking_points?.join("; ") || "medication adherence, side effects, daily routine"),
    follow_up_question: prep?.follow_up_question || "What's been the biggest challenge so far — remembering to take it, dealing with side effects, or fitting it into your routine?",
    conversation_guide: trunc(conversationGuide, 2000),
    hook_options: trunc(hookOptions, 1000),
    anticipated_responses: trunc(anticipatedResponses, 1000),
    notes_for_this_call: trunc(prep?.notes_for_next_call || ""),
    patient_context: trunc(patientContext, 2000),
    care_gaps: trunc(mem?.rawRecords?.care_gaps?.map(g => `[${g.urgency}] ${g.description}`).join("; ") || ""),
    top_insights: trunc(mem?.rawRecords?.top_3_insights?.join("; ") || ""),
  };

  // Log payload size for debugging
  const payloadSize = JSON.stringify(dynamicVariables).length;
  console.log(`[OUTBOUND_CALL] Dynamic variables payload size: ${payloadSize} chars`);

  // Call ElevenLabs outbound API
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    console.error("[OUTBOUND_CALL] No ELEVENLABS_PHONE_NUMBER_ID set");
    return { success: false, error: "no_phone_number_id" };
  }

  const requestBody = {
    agent_id: agentId,
    agent_phone_number_id: phoneNumberId,
    to_number: phone,
    conversation_initiation_client_data: {
      dynamic_variables: dynamicVariables,
    },
  };

  const bodyJson = JSON.stringify(requestBody);
  console.log(`[OUTBOUND_CALL] Request body size: ${bodyJson.length} chars, agent_id: ${agentId}`);

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: bodyJson,
  });

  const responseText = await response.text();
  console.log(`[OUTBOUND_CALL] ElevenLabs response: ${response.status} ${responseText.slice(0, 500)}`);

  if (!response.ok) {
    console.error(`[OUTBOUND_CALL] ElevenLabs API error: ${response.status} ${responseText}`);
    return { success: false, error: `api_error_${response.status}` };
  }

  const callData = JSON.parse(responseText);

  // Create voice session record
  const [session] = await db.insert(voiceSessions).values({
    userId,
    initiatedBy: "ai",
    coordinatorPersona: coordinatorName,
  }).returning();

  // Log AI action
  await db.insert(aiActions).values({
    userId,
    observation: "First-call preparation complete, initiating outbound call",
    reasoning: `Calling ${firstName} with personalized hook opener. Anchor: ${dynamicVariables.hook_anchor}`,
    assessment: "Outbound call initiated",
    urgency: "medium",
    action: "call",
    messageContent: dynamicVariables.opening_script,
    coordinatorPersona: coordinatorName,
    source: "cron",
  });

  console.log(`[OUTBOUND_CALL] Call initiated for ${userId} via ${coordinatorName}, first_message: "${dynamicVariables.opening_script?.slice(0, 80)}..."`);
  return { success: true, callId: callData.call_id || session.id };
}

module.exports = { initiateOutboundCall };
