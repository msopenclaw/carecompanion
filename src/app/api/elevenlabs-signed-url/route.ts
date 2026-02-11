export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return Response.json({ error: "ElevenLabs not configured" }, { status: 501 });
  }

  const agentId = "agent_8601kh042d5yf7atvdqa6nbfm9yb";

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${agentId}`,
      { headers: { "xi-api-key": apiKey } }
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("ElevenLabs signed URL error:", text);
      return Response.json({ error: "Failed to get signed URL" }, { status: 502 });
    }

    const data = await res.json();
    return Response.json(data);
  } catch (err) {
    console.error("Signed URL error:", err);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }
}
