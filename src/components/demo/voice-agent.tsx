"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDemo } from "./demo-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceAgentProps {
  patientName: string;
}

interface ScriptLine {
  speaker: "ai" | "patient";
  text: string;
  speakDuration: number;
  preDelay: number;
}

// ---------------------------------------------------------------------------
// Scripted conversation (fallback / simulated mode)
// ---------------------------------------------------------------------------

function buildScript(name: string): ScriptLine[] {
  return [
    {
      speaker: "ai",
      text: `Good morning, ${name}. I noticed your blood pressure was 155/95 this morning. That's a bit higher than your usual 130. Did you remember to take your Lisinopril with breakfast?`,
      speakDuration: 4800,
      preDelay: 1200,
    },
    {
      speaker: "patient",
      text: "Oh, I think I forgot. I was rushing to see my grandson.",
      speakDuration: 2600,
      preDelay: 1800,
    },
    {
      speaker: "ai",
      text: "No worries, it happens! Go ahead and take it now. I'll check back in two hours to see if it's settled down. Should I add a note for Dr. Patel, or do you have it under control?",
      speakDuration: 4400,
      preDelay: 1400,
    },
    {
      speaker: "patient",
      text: "Better add a note. I've been forgetting more lately.",
      speakDuration: 2200,
      preDelay: 1600,
    },
    {
      speaker: "ai",
      text: `Done! I've flagged this for Dr. Patel and set a reminder for your evening dose at 6 PM. Your heart rate looks good at 72, and your glucose was 118 this morning — both in range. You're doing great overall, ${name}.`,
      speakDuration: 5200,
      preDelay: 1200,
    },
  ];
}

// ---------------------------------------------------------------------------
// Waveform component
// ---------------------------------------------------------------------------

function VoiceWaveform({ active }: { active: boolean }) {
  const barCount = 7;
  return (
    <div className="flex items-center justify-center gap-[3px] h-8">
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-[3px] rounded-full bg-emerald-400 transition-all duration-200"
          style={{
            height: active ? undefined : "4px",
            animation: active
              ? `voiceBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`
              : "none",
            ...(!active ? { height: "4px" } : {}),
          }}
        />
      ))}
      <style>{`
        @keyframes voiceBar {
          0%   { height: 4px; }
          50%  { height: 22px; }
          100% { height: 6px; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bot avatar (compact)
// ---------------------------------------------------------------------------

function BotAvatar() {
  return (
    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V7a2 2 0 0 1 2-2h3V4a2 2 0 0 1 2-2z" />
        <circle cx="9" cy="9" r="1" fill="white" stroke="none" />
        <circle cx="15" cy="9" r="1" fill="white" stroke="none" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VoiceAgent({ patientName }: VoiceAgentProps) {
  const {
    demoPhase,
    transcript,
    addTranscript,
    addLog,
    setPhaseActive,
    endDemo,
    updateBilling,
    toggleScript,
  } = useDemo();

  // Local UI state
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [isSimulated, setIsSimulated] = useState(false);

  // Refs
  const conversationRef = useRef<unknown>(null);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const billingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );

  // ------ Auto-scroll ------
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ------ Elapsed timer ------
  useEffect(() => {
    if (connectionStatus === "connected") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [connectionStatus]);

  // ------ Billing minute tracker ------
  useEffect(() => {
    if (connectionStatus === "connected") {
      billingIntervalRef.current = setInterval(() => {
        setElapsed((e) => {
          const minutes = Math.floor((e + 1) / 60);
          if (minutes > 0) {
            updateBilling(minutes);
          }
          return e;
        });
      }, 60000);
      return () => {
        if (billingIntervalRef.current)
          clearInterval(billingIntervalRef.current);
      };
    }
    return () => {
      if (billingIntervalRef.current)
        clearInterval(billingIntervalRef.current);
    };
  }, [connectionStatus, updateBilling]);

  // ------ Format timer ------
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ------ Simulated conversation playback ------
  const runSimulatedConversation = useCallback(() => {
    const script = buildScript(patientName);
    let cumulativeDelay = 600;

    script.forEach((line, idx) => {
      const startDelay = cumulativeDelay + line.preDelay;

      // Start "speaking" / "listening"
      const t1 = setTimeout(() => {
        if (line.speaker === "ai") {
          setAiSpeaking(true);
          setIsListening(false);
        } else {
          setAiSpeaking(false);
          setIsListening(true);
        }
      }, startDelay);

      // Add transcript entry after a short typing duration
      const typeDuration = Math.min(line.text.length * 16, 1600);
      const t2 = setTimeout(() => {
        addTranscript(line.speaker, line.text);
      }, startDelay + typeDuration);

      // End speaking/listening after speakDuration
      const t3 = setTimeout(() => {
        setAiSpeaking(false);
        setIsListening(false);
      }, startDelay + typeDuration + line.speakDuration);

      timeoutsRef.current.push(t1, t2, t3);
      cumulativeDelay = startDelay + typeDuration + line.speakDuration;

      // Update billing on last line
      if (idx === script.length - 1) {
        const tBill = setTimeout(() => {
          updateBilling(Math.ceil(cumulativeDelay / 60000) + 1);
        }, startDelay + typeDuration + line.speakDuration + 200);
        timeoutsRef.current.push(tBill);
      }
    });

    // End the demo after conversation finishes
    const tEnd = setTimeout(() => {
      setAiSpeaking(false);
      setIsListening(false);
      endDemo();
      addLog("voice", "Call ended — session complete");
      setConnectionStatus("disconnected");
    }, cumulativeDelay + 1200);
    timeoutsRef.current.push(tEnd);
  }, [patientName, addTranscript, addLog, endDemo, updateBilling]);

  // ------ Connect to ElevenLabs or fall back to simulated ------
  useEffect(() => {
    if (demoPhase !== "connecting") return;

    setConnectionStatus("connecting");
    addLog("voice", "Initializing voice session...");

    let cancelled = false;

    const initSession = async () => {
      try {
        // Attempt to load the @11labs/client SDK
        const { Conversation } = await import("@11labs/client");

        if (cancelled) return;

        addLog("voice", "ElevenLabs SDK loaded, starting session...");

        const conversation = await Conversation.startSession({
          agentId: "agent_8601kh042d5yf7atvdqa6nbfm9yb",
          connectionType: "websocket",
          onConnect: () => {
            if (cancelled) return;
            setConnectionStatus("connected");
            setPhaseActive();
            addLog("voice", "Connected to ElevenLabs Conversational AI");
            setIsListening(true);
          },
          onDisconnect: () => {
            if (cancelled) return;
            setConnectionStatus("disconnected");
            setIsListening(false);
            setAiSpeaking(false);
            endDemo();
            addLog("voice", "Call ended — session disconnected");
          },
          onMessage: (message: { source?: string; message?: string }) => {
            if (cancelled) return;
            const speaker =
              message.source === "user" ? "patient" : "ai";
            const text =
              typeof message.message === "string"
                ? message.message
                : String(message.message ?? "");
            if (text.trim()) {
              addTranscript(speaker, text);
            }
          },
          onModeChange: ({ mode }: { mode: string }) => {
            if (cancelled) return;
            if (mode === "speaking") {
              setAiSpeaking(true);
              setIsListening(false);
            } else {
              setAiSpeaking(false);
              setIsListening(true);
            }
          },
        });

        if (cancelled) {
          // If we got cancelled while awaiting, end the session
          try {
            await (conversation as { endSession?: () => Promise<void> })
              .endSession?.();
          } catch {
            // ignore
          }
          return;
        }

        conversationRef.current = conversation;
      } catch (err) {
        if (cancelled) return;

        // SDK failed — fall back to simulated mode
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        addLog(
          "voice",
          `ElevenLabs SDK unavailable, using simulated mode`,
          errorMsg,
        );
        setIsSimulated(true);
        setConnectionStatus("connected");
        setPhaseActive();
        addLog("voice", "Connected (simulated voice session)");
        setIsListening(true);

        // Start scripted playback
        runSimulatedConversation();
      }
    };

    initSession();

    return () => {
      cancelled = true;
      // Clean up timeouts
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      // End ElevenLabs session if live
      if (conversationRef.current) {
        try {
          (
            conversationRef.current as {
              endSession?: () => Promise<void>;
            }
          ).endSession?.();
        } catch {
          // ignore
        }
        conversationRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPhase]);

  // ------ Cleanup on unmount ------
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
      if (billingIntervalRef.current)
        clearInterval(billingIntervalRef.current);
    };
  }, []);

  // ------ Connection status helpers ------
  const isConnecting = connectionStatus === "connecting";
  const isConnected = connectionStatus === "connected";

  // ------ Render ------
  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white overflow-hidden select-none">
      {/* Inline keyframes */}
      <style>{`
        @keyframes bubbleFadeIn {
          0%   { opacity: 0; transform: translateY(6px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes typingDot {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes micPulse {
          0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ---------------------------------------------------------------- */}
      {/* Call header                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41a16 16 0 0 0 6.5 6.5l1.22-1.22a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              {/* Status pulse dot */}
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                {isConnected && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </>
                )}
                {isConnecting && (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-400" />
                  </>
                )}
                {!isConnected && !isConnecting && (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500" />
                )}
              </span>
            </div>
            <div className="leading-tight">
              <div className="text-[10px] font-semibold text-white tracking-wide">
                CareCompanion AI
              </div>
              <div
                className={`flex items-center gap-1 text-[8px] font-medium ${
                  isConnected
                    ? "text-emerald-400"
                    : isConnecting
                      ? "text-yellow-400"
                      : "text-slate-500"
                }`}
              >
                <span
                  className={`inline-block w-1 h-1 rounded-full ${
                    isConnected
                      ? "bg-emerald-400"
                      : isConnecting
                        ? "bg-yellow-400"
                        : "bg-slate-500"
                  }`}
                />
                {isConnected
                  ? isSimulated
                    ? "Connected (demo)"
                    : "Connected"
                  : isConnecting
                    ? "Connecting..."
                    : "Disconnected"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Call timer */}
            <div className="text-[10px] tabular-nums text-slate-400 font-mono bg-slate-800/60 px-1.5 py-0.5 rounded-full">
              {formatTime(elapsed)}
            </div>
            {/* Info / script toggle button */}
            <button
              onClick={toggleScript}
              className="w-5 h-5 rounded-full bg-slate-800/60 hover:bg-slate-700/80 flex items-center justify-center transition-colors"
              title="Toggle script overlay"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-400"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4" />
                <path d="M12 8h.01" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Voice waveform                                                   */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 flex items-center justify-center py-1">
        <VoiceWaveform active={aiSpeaking} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Transcript / chat area                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-1.5 scrollbar-hide">
        {/* Waiting message when idle or connecting */}
        {transcript.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-1.5">
              {isConnecting ? (
                <>
                  <div className="flex items-center justify-center gap-1.5">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="inline-block w-1.5 h-1.5 rounded-full bg-yellow-400"
                        style={{
                          animation: `typingDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-500">
                    Connecting to voice agent...
                  </p>
                </>
              ) : isConnected ? (
                <p className="text-[9px] text-slate-500">
                  Listening for conversation...
                </p>
              ) : demoPhase === "complete" ? (
                <p className="text-[9px] text-slate-500">
                  Call ended
                </p>
              ) : (
                <p className="text-[9px] text-slate-500">
                  Ready to connect
                </p>
              )}
            </div>
          </div>
        )}

        {transcript.map((entry, idx) => {
          const isAi = entry.speaker === "ai";

          return (
            <div
              key={idx}
              className={`flex gap-1 ${isAi ? "justify-start" : "justify-end"}`}
              style={{
                animation: "bubbleFadeIn 0.35s ease-out both",
              }}
            >
              {isAi && <BotAvatar />}
              <div
                className={`relative max-w-[85%] rounded-xl px-2.5 py-1.5 text-[9px] leading-[1.5] ${
                  isAi
                    ? "bg-slate-800/90 text-slate-100 rounded-tl-sm"
                    : "bg-emerald-600/90 text-white rounded-tr-sm"
                }`}
                style={{
                  boxShadow: isAi
                    ? "0 1px 6px rgba(0,0,0,0.3)"
                    : "0 1px 6px rgba(16,185,129,0.15)",
                }}
              >
                {/* Speaker label */}
                <div
                  className={`text-[7px] font-bold uppercase tracking-widest mb-0.5 ${
                    isAi ? "text-emerald-400" : "text-emerald-200"
                  }`}
                >
                  {isAi ? "CareCompanion" : patientName}
                </div>
                <span>{entry.text}</span>
              </div>
            </div>
          );
        })}

        <div ref={chatEndRef} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Bottom: microphone button + status                               */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 px-3 pb-3 pt-1.5">
        <div className="flex flex-col items-center gap-1.5">
          {/* Mic button */}
          <button
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${
              isListening
                ? "bg-red-500 shadow-lg"
                : aiSpeaking
                  ? "bg-slate-700"
                  : isConnected
                    ? "bg-slate-600 hover:bg-slate-500"
                    : "bg-slate-700/50"
            }`}
            style={{
              animation: isListening
                ? "micPulse 1.5s ease-out infinite"
                : "none",
            }}
            disabled={!isConnected}
          >
            {aiSpeaking ? (
              /* Muted mic icon when AI speaking */
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-400"
              >
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .76-.13 1.5-.35 2.18" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            ) : (
              /* Active mic icon */
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={
                  isListening
                    ? "text-white"
                    : isConnected
                      ? "text-slate-300"
                      : "text-slate-500"
                }
              >
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            )}
          </button>

          {/* Status text */}
          <div className="text-[8px] text-slate-500 text-center">
            {demoPhase === "complete" ? (
              "Call complete"
            ) : aiSpeaking ? (
              <span className="text-emerald-400">AI is speaking...</span>
            ) : isListening ? (
              <span className="text-red-400 flex items-center gap-1 justify-center">
                <span className="inline-block w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                Listening...
              </span>
            ) : isConnecting ? (
              "Connecting..."
            ) : (
              "Tap to speak"
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
