"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceExperienceProps {
  patientName: string;
  patientId: string;
}

type Speaker = "ai" | "patient";

interface ConversationLine {
  speaker: Speaker;
  text: string;
  /** How long (ms) to keep the waveform active *after* the bubble appears */
  speakDuration: number;
  /** Delay (ms) before this line starts appearing */
  preDelay: number;
}

// ---------------------------------------------------------------------------
// Conversation script builder (injects patient name)
// ---------------------------------------------------------------------------

function buildScript(name: string): ConversationLine[] {
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
      text: `Done! I've flagged this for Dr. Patel and set a reminder for your evening dose at 6 PM. Your heart rate looks good at 72, and your glucose was 118 this morning \u2014 both in range. You're doing great overall, ${name}.`,
      speakDuration: 5200,
      preDelay: 1200,
    },
  ];
}

// ---------------------------------------------------------------------------
// Waveform bars component
// ---------------------------------------------------------------------------

function VoiceWaveform({ active }: { active: boolean }) {
  const barCount = 7;
  return (
    <div className="flex items-center justify-center gap-[3px] h-5">
      {Array.from({ length: barCount }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-[3px] rounded-full bg-emerald-400 transition-all duration-200"
          style={{
            height: active ? undefined : "4px",
            animation: active
              ? `waveBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`
              : "none",
            // fallback static height when not active
            ...(!active ? { height: "4px" } : {}),
          }}
        />
      ))}
      {/* Keyframe injected via style tag (scoped) */}
      <style>{`
        @keyframes waveBar {
          0%   { height: 4px; }
          50%  { height: 16px; }
          100% { height: 6px; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small bot avatar
// ---------------------------------------------------------------------------

function BotAvatar() {
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-md">
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6h-2a6 6 0 0 1-6-6V7a2 2 0 0 1 2-2h3V4a2 2 0 0 1 2-2z" />
        <circle cx="9" cy="9" r="1" fill="white" stroke="none" />
        <circle cx="15" cy="9" r="1" fill="white" stroke="none" />
        <path d="M9 13c.6.9 1.6 1.5 3 1.5s2.4-.6 3-1.5" />
        <path d="M5 18c1 2 3.5 4 7 4s6-2 7-4" />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function VoiceExperience({
  patientName,
  patientId,
}: VoiceExperienceProps) {
  const script = useRef(buildScript(patientName));

  // Index of lines that are fully visible
  const [visibleCount, setVisibleCount] = useState(0);
  // Which line is currently "typing" (animating in)
  const [typingIndex, setTypingIndex] = useState<number | null>(null);
  // Whether the AI waveform should animate
  const [aiSpeaking, setAiSpeaking] = useState(false);
  // Whether the whole conversation has finished
  const [finished, setFinished] = useState(false);
  // Call duration timer (seconds)
  const [elapsed, setElapsed] = useState(0);
  // Controls whether the sequence is running
  const [running, setRunning] = useState(true);
  // Show summary card (fades in after conversation)
  const [showSummary, setShowSummary] = useState(false);

  // Ref used to cancel pending timeouts on replay
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Auto-scroll ref
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ---- Elapsed timer ----
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  // ---- Auto-scroll ----
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleCount, typingIndex, showSummary]);

  // ---- Conversation sequencer ----
  const runSequence = useCallback(() => {
    const lines = script.current;
    let cumulativeDelay = 400; // initial pause

    lines.forEach((line, idx) => {
      const startDelay = cumulativeDelay + line.preDelay;

      // Start typing
      const t1 = setTimeout(() => {
        setTypingIndex(idx);
        if (line.speaker === "ai") setAiSpeaking(true);
      }, startDelay);

      // Finish typing -> show bubble fully
      const typeDuration = Math.min(line.text.length * 18, 1800);
      const t2 = setTimeout(() => {
        setTypingIndex(null);
        setVisibleCount(idx + 1);
      }, startDelay + typeDuration);

      // Stop AI speaking waveform after speakDuration
      const t3 =
        line.speaker === "ai"
          ? setTimeout(() => {
              setAiSpeaking(false);
            }, startDelay + typeDuration + line.speakDuration)
          : null;

      timeoutsRef.current.push(t1, t2);
      if (t3 !== null) timeoutsRef.current.push(t3);

      cumulativeDelay = startDelay + typeDuration + line.speakDuration;
    });

    // After last line, mark finished
    const tEnd = setTimeout(() => {
      setFinished(true);
      setRunning(false);
    }, cumulativeDelay + 600);
    timeoutsRef.current.push(tEnd);

    // Show summary after a short pause
    const tSummary = setTimeout(() => {
      setShowSummary(true);
    }, cumulativeDelay + 1400);
    timeoutsRef.current.push(tSummary);
  }, []);

  // ---- Kick off on mount ----
  useEffect(() => {
    runSequence();
    return () => timeoutsRef.current.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Replay handler ----
  const handleReplay = () => {
    // Clear all running timeouts
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    // Reset state
    setVisibleCount(0);
    setTypingIndex(null);
    setAiSpeaking(false);
    setFinished(false);
    setShowSummary(false);
    setElapsed(0);
    setRunning(true);
    // Re-run
    setTimeout(() => runSequence(), 100);
  };

  // ---- Format timer ----
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ---- Render helpers ----
  const lines = script.current;

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white overflow-hidden select-none">
      {/* ---------------------------------------------------------------- */}
      {/* Call header                                                      */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg
                  width="16"
                  height="16"
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
              {/* Green pulse dot */}
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
              </span>
            </div>
            <div className="leading-tight">
              <div className="text-[11px] font-semibold text-white tracking-wide">
                CareCompanion AI
              </div>
              <div className="flex items-center gap-1 text-[9px] text-emerald-400 font-medium">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Connected
              </div>
            </div>
          </div>
          <div className="text-[11px] tabular-nums text-slate-400 font-mono bg-slate-800/60 px-2 py-0.5 rounded-full">
            {formatTime(elapsed)}
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Vital alert card                                                 */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 mx-3 mb-2">
        <div className="bg-gradient-to-r from-red-950/80 to-slate-900/80 border border-red-800/40 rounded-lg px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </div>
              <div>
                <div className="text-[9px] text-red-400 font-semibold uppercase tracking-wider">
                  Blood Pressure Elevated
                </div>
                <div className="text-[13px] font-bold text-white">
                  155/95{" "}
                  <span className="text-[9px] font-normal text-slate-400">
                    mmHg
                  </span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[9px] text-slate-500">Usual</div>
              <div className="text-[11px] text-slate-400 font-medium">
                130/85
              </div>
            </div>
          </div>
          <div className="mt-1.5 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-yellow-500 via-red-500 to-red-600"
              style={{ width: "78%" }}
            />
          </div>
          <div className="flex justify-between mt-0.5 text-[8px] text-slate-600">
            <span>Normal</span>
            <span>Elevated</span>
            <span>High</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Waveform when AI speaks                                          */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 flex items-center justify-center py-1">
        <VoiceWaveform active={aiSpeaking} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Conversation area                                                */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-1 overflow-y-auto px-3 pb-2 space-y-2 scrollbar-hide">
        <style>{`
          .scrollbar-hide::-webkit-scrollbar { display: none; }
          .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }

          @keyframes bubbleFadeIn {
            0%   { opacity: 0; transform: translateY(8px) scale(0.97); }
            100% { opacity: 1; transform: translateY(0) scale(1); }
          }
          @keyframes typingDot {
            0%, 80%, 100% { opacity: 0.3; transform: scale(0.85); }
            40% { opacity: 1; transform: scale(1); }
          }
        `}</style>

        {lines.map((line, idx) => {
          const isVisible = idx < visibleCount;
          const isTyping = typingIndex === idx;
          if (!isVisible && !isTyping) return null;

          const isAi = line.speaker === "ai";

          return (
            <div
              key={idx}
              className={`flex gap-1.5 ${isAi ? "justify-start" : "justify-end"}`}
              style={{
                animation: "bubbleFadeIn 0.4s ease-out both",
              }}
            >
              {isAi && <BotAvatar />}
              <div
                className={`relative max-w-[85%] rounded-2xl px-3 py-2 text-[11px] leading-[1.55] ${
                  isAi
                    ? "bg-slate-800/90 text-slate-100 rounded-tl-md"
                    : "bg-emerald-600/90 text-white rounded-tr-md"
                }`}
                style={{
                  boxShadow: isAi
                    ? "0 2px 8px rgba(0,0,0,0.3)"
                    : "0 2px 8px rgba(16,185,129,0.15)",
                }}
              >
                {/* Speaker label */}
                <div
                  className={`text-[8px] font-bold uppercase tracking-widest mb-0.5 ${
                    isAi ? "text-emerald-400" : "text-emerald-200"
                  }`}
                >
                  {isAi ? "CareCompanion" : patientName}
                </div>

                {/* Typing indicator or actual text */}
                {isTyping && !isVisible ? (
                  <div className="flex items-center gap-1 py-1 px-0.5">
                    {[0, 1, 2].map((d) => (
                      <span
                        key={d}
                        className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400"
                        style={{
                          animation: `typingDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                ) : (
                  <span>{line.text}</span>
                )}
              </div>
            </div>
          );
        })}

        {/* ---- Summary card ---- */}
        {showSummary && (
          <div
            className="mt-2"
            style={{ animation: "bubbleFadeIn 0.6s ease-out both" }}
          >
            <div className="bg-gradient-to-br from-slate-800/90 to-slate-900/90 border border-emerald-800/30 rounded-xl px-3 py-2.5 shadow-lg">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                  Actions Taken
                </span>
              </div>
              <div className="space-y-1.5">
                {[
                  {
                    icon: (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#facc15"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                        <line x1="4" y1="22" x2="4" y2="15" />
                      </svg>
                    ),
                    text: "Flagged for Dr. Patel",
                    sub: "Missed Lisinopril + elevated BP",
                  },
                  {
                    icon: (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#60a5fa"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ),
                    text: "Reminder set for 6 PM",
                    sub: "Evening Lisinopril dose",
                  },
                  {
                    icon: (
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#a78bfa"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                    ),
                    text: "Check-back in 2 hours",
                    sub: "Re-measure blood pressure",
                  },
                ].map((action, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2 bg-slate-800/50 rounded-lg px-2 py-1.5"
                  >
                    <div className="w-5 h-5 rounded-md bg-slate-700/60 flex items-center justify-center flex-shrink-0 mt-0.5">
                      {action.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-[10px] font-semibold text-white leading-tight">
                        {action.text}
                      </div>
                      <div className="text-[8px] text-slate-400 leading-tight">
                        {action.sub}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 pt-1.5 border-t border-slate-700/50 text-center">
                <span className="text-[8px] text-slate-500">
                  Patient ID: {patientId} &middot; Auto-documented in EHR
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* Bottom bar: waveform status + replay                             */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex-shrink-0 px-3 pb-3 pt-1">
        {!finished ? (
          <div className="flex items-center justify-center gap-2 text-[10px] text-slate-500">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {aiSpeaking ? "AI is speaking..." : "Listening..."}
          </div>
        ) : (
          <button
            onClick={handleReplay}
            className="w-full flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-[11px] font-semibold py-2 rounded-xl transition-colors duration-150 shadow-lg shadow-emerald-600/20"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="1 4 1 10 7 10" />
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
            </svg>
            Replay Conversation
          </button>
        )}
      </div>
    </div>
  );
}
