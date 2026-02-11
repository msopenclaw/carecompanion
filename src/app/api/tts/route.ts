export async function POST(request: Request) {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return Response.json(
        { error: "TTS not configured" },
        { status: 501 }
      );
    }

    const body = await request.json();
    const { text, voice } = body as { text: string; voice?: string };

    if (!text || text.trim().length === 0) {
      return Response.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Voice IDs:
    // "ai"     → Rachel (calm, professional AI agent voice)
    // "patient" → Dorothy (warm, older female — Margaret Chen, 72F)
    const VOICES: Record<string, string> = {
      ai: "21m00Tcm4TlvDq8ikWAM",      // Rachel
      patient: "ThT5KcBeYPX3keUQqHPh",  // Dorothy
    };
    const voiceId = VOICES[voice ?? "ai"] ?? VOICES.ai;

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
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: true,
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ElevenLabs API error:", errorText);
      return Response.json(
        { error: "TTS generation failed" },
        { status: 502 }
      );
    }

    // Stream the audio response back to the client
    return new Response(response.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (error) {
    console.error("Error in TTS route:", error);
    return Response.json(
      { error: "Failed to process TTS request" },
      { status: 500 }
    );
  }
}
