// Set RAILWAY_API_URL on Vercel only — Railway has the keys locally
const RAILWAY_URL = process.env.RAILWAY_API_URL;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { text, voice } = body as { text: string; voice?: string };

    if (!text || text.trim().length === 0) {
      return Response.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Voice IDs:
    // "ai"     → Sarah (mature, reassuring, confident — professional AI agent)
    // "patient" → Lily (velvety actress, middle-aged — Margaret Chen, 72F)
    const VOICES: Record<string, string> = {
      ai: "EXAVITQu4vr4xnSDxMaL",      // Sarah
      patient: "pFZP5JQG7iQjIQuC4Bku",  // Lily
    };
    const voiceId = VOICES[voice ?? "ai"] ?? VOICES.ai;
    const isPatient = (voice === "patient");

    // Try local ELEVENLABS_API_KEY first, then proxy through Railway
    const localKey = process.env.ELEVENLABS_API_KEY;

    if (localKey) {
      const result = await callElevenLabs(text, voiceId, localKey, isPatient);
      if (result.ok) return result.response;
      console.error("Local ElevenLabs error:", result.error);
    }

    // Proxy through Railway (where ElevenLabs key lives) — only if RAILWAY_API_URL is set
    if (!RAILWAY_URL) {
      return Response.json(
        { error: "TTS not configured — set ELEVENLABS_API_KEY or RAILWAY_API_URL" },
        { status: 501 }
      );
    }

    try {
      const railwayRes = await fetch(`${RAILWAY_URL}/api/tts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + btoa("ms:openclaw"),
        },
        body: JSON.stringify({ text, voice }),
      });

      if (railwayRes.ok) {
        return new Response(railwayRes.body, {
          headers: {
            "Content-Type": "audio/mpeg",
            "Transfer-Encoding": "chunked",
          },
        });
      }

      const railwayError = await railwayRes.text();
      console.error("Railway TTS proxy error:", railwayError);
    } catch (proxyErr) {
      console.error("Railway proxy failed:", proxyErr);
    }

    return Response.json(
      { error: "TTS generation failed — check ElevenLabs API key" },
      { status: 502 }
    );
  } catch (error) {
    console.error("Error in TTS route:", error);
    return Response.json(
      { error: "Failed to process TTS request" },
      { status: 500 }
    );
  }
}

async function callElevenLabs(
  text: string,
  voiceId: string,
  apiKey: string,
  isPatient: boolean = false,
): Promise<{ ok: true; response: Response } | { ok: false; error: string }> {
  try {
    // Patient (Margaret, 72F): higher stability + lower similarity for a
    // softer, steadier, more mature delivery
    const voice_settings = isPatient
      ? { stability: 0.85, similarity_boost: 0.6, style: 0.15, use_speaker_boost: false }
      : { stability: 0.75, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true };

    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return { ok: false, error: errorText };
    }

    return {
      ok: true,
      response: new Response(response.body, {
        headers: {
          "Content-Type": "audio/mpeg",
          "Transfer-Encoding": "chunked",
        },
      }),
    };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
