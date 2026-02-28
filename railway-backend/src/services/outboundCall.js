const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { userProfiles, patientMemory, voiceSessions, aiActions, userCoordinator, careCoordinators } = require("../db/schema");
const { decrypt } = require("./encryption");

/**
 * initiateOutboundCall — Call a patient via ElevenLabs Twilio integration.
 *
 * Uses the first-call prep (opening script + talking points) stored in patient_memory.
 * Falls back to a generic opening if no prep exists.
 *
 * @param {string} userId
 * @returns {object} { success, callId?, error? }
 */
async function initiateOutboundCall(userId) {
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

  // Load first-call prep from patient memory
  const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  const firstCallPrep = mem?.tier2?.first_call_prep || null;

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

  // Build dynamic variables for the agent
  const dynamicVariables = {
    patient_name: firstName,
    opening_script: firstCallPrep?.opening_script || `Hey ${firstName}, this is ${coordinatorName} from TodyAI. Thanks for signing up — I wanted to check in and see how things are going. How are you feeling today?`,
    hook_anchor: firstCallPrep?.hook_anchor || "medication management",
    talking_points: firstCallPrep?.talking_points?.join("; ") || "medication adherence, side effects, daily routine",
    follow_up_question: firstCallPrep?.follow_up_question || "What's been the biggest challenge so far — remembering to take it, dealing with side effects, or fitting it into your routine?",
  };

  // Call ElevenLabs outbound API
  const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
  if (!phoneNumberId) {
    console.error("[OUTBOUND_CALL] No ELEVENLABS_PHONE_NUMBER_ID set");
    return { success: false, error: "no_phone_number_id" };
  }

  const response = await fetch("https://api.elevenlabs.io/v1/convai/twilio/outbound-call", {
    method: "POST",
    headers: {
      "xi-api-key": ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      agent_id: agentId,
      agent_phone_number_id: phoneNumberId,
      to_number: phone,
      dynamic_variables: dynamicVariables,
      first_message: dynamicVariables.opening_script,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[OUTBOUND_CALL] ElevenLabs API error: ${response.status} ${errorText}`);
    return { success: false, error: `api_error_${response.status}` };
  }

  const callData = await response.json();

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

  console.log(`[OUTBOUND_CALL] Call initiated for ${userId} via ${coordinatorName}`);
  return { success: true, callId: callData.call_id || session.id };
}

module.exports = { initiateOutboundCall };
