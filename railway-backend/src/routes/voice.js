const jwt = require("jsonwebtoken");
const { db } = require("../db");
const { voiceSessions } = require("../db/schema");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/**
 * WebSocket handler for /ws/voice
 * Protocol:
 *   Client -> Server: JSON { type: "start", token: "jwt..." }
 *   Client -> Server: binary audio frames (PCM 16-bit 16kHz)
 *   Server -> Client: JSON { type: "transcript", text: "...", isFinal: bool }
 *   Server -> Client: JSON { type: "ai_response", text: "..." }
 *   Server -> Client: binary audio frames (TTS response)
 *   Client -> Server: JSON { type: "end" }
 *   Server -> Client: JSON { type: "session_complete", summary: "...", duration: N }
 */
function voiceHandler(ws, req) {
  let userId = null;
  let sessionId = null;
  let startTime = null;
  const transcript = [];

  ws.on("message", async (data) => {
    // JSON control messages
    if (typeof data === "string" || (data instanceof Buffer && data[0] === 0x7b)) {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "start") {
          // Authenticate
          try {
            const decoded = jwt.verify(msg.token, JWT_SECRET);
            userId = decoded.userId;
            startTime = new Date();

            // Create voice session
            const [session] = await db.insert(voiceSessions).values({
              userId,
              initiatedBy: msg.initiatedBy || "patient",
              coordinatorPersona: msg.coordinatorPersona || null,
            }).returning();

            sessionId = session.id;
            ws.send(JSON.stringify({
              type: "session_started",
              sessionId: session.id,
            }));
          } catch (err) {
            ws.send(JSON.stringify({ type: "error", message: "Authentication failed" }));
            ws.close();
          }
        }

        if (msg.type === "end") {
          // End session
          const endTime = new Date();
          const durationSeconds = startTime
            ? Math.round((endTime - startTime) / 1000)
            : 0;

          if (sessionId) {
            await db.update(voiceSessions)
              .set({
                endedAt: endTime,
                durationSeconds,
                transcript,
                summary: "Session completed",
              })
              .where(require("drizzle-orm").eq(voiceSessions.id, sessionId));
          }

          ws.send(JSON.stringify({
            type: "session_complete",
            sessionId,
            duration: durationSeconds,
            summary: "Session completed",
          }));
          ws.close();
        }
      } catch (e) {
        // Not JSON, treat as binary
      }
      return;
    }

    // Binary audio frames
    if (!userId) {
      ws.send(JSON.stringify({ type: "error", message: "Not authenticated" }));
      return;
    }

    // TODO: Pipe to Deepgram STT -> Gemini -> ElevenLabs TTS
    // For now, acknowledge receipt
    ws.send(JSON.stringify({
      type: "transcript",
      text: "[Voice processing not yet implemented]",
      isFinal: true,
    }));
  });

  ws.on("close", () => {
    console.log(`Voice session closed for user ${userId}`);
  });

  ws.on("error", (err) => {
    console.error("Voice WebSocket error:", err);
  });
}

module.exports = voiceHandler;
