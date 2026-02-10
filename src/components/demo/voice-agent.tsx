"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDemo } from "./demo-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceAgentProps {
  patientName: string;
}

type PhonePhase = "app" | "alert" | "ringing" | "call" | "ended";

interface ScriptLine {
  speaker: "ai" | "patient";
  text: string;
  speakDuration: number;
  preDelay: number;
}

// ---------------------------------------------------------------------------
// 3-day BP trend data
// ---------------------------------------------------------------------------

interface BPReading {
  label: string;
  sys: number;
  dia: number;
  color: "green" | "yellow" | "red";
}

const BP_TREND: BPReading[] = [
  { label: "2 days ago", sys: 132, dia: 86, color: "green" },
  { label: "Yesterday", sys: 142, dia: 90, color: "yellow" },
  { label: "Today", sys: 155, dia: 95, color: "red" },
];

// ---------------------------------------------------------------------------
// Fallback conversation script (if ElevenLabs SDK fails)
// ---------------------------------------------------------------------------

function buildScript(name: string): ScriptLine[] {
  return [
    {
      speaker: "ai",
      text: `Good morning, ${name}. I noticed your blood pressure reading was 155 over 95 this morning — that's higher than your usual range. Did you remember to take your Lisinopril?`,
      speakDuration: 5000,
      preDelay: 1200,
    },
    {
      speaker: "patient",
      text: "Oh, I think I forgot this morning. I was rushing out to see my grandson.",
      speakDuration: 2800,
      preDelay: 1800,
    },
    {
      speaker: "ai",
      text: "That's understandable! I'd recommend taking it now with a glass of water. I'll check back in two hours to see if it's come down. Should I flag this for Dr. Patel?",
      speakDuration: 4600,
      preDelay: 1400,
    },
    {
      speaker: "patient",
      text: "Yes, please add a note. I've been forgetting more often lately.",
      speakDuration: 2400,
      preDelay: 1600,
    },
    {
      speaker: "ai",
      text: `Done! I've notified Dr. Patel and set a reminder for your evening dose at 6 PM. Your heart rate is 72 and glucose was 118 — both in range. You're doing great, ${name}.`,
      speakDuration: 5400,
      preDelay: 1200,
    },
  ];
}

// ---------------------------------------------------------------------------
// Animated waveform
// ---------------------------------------------------------------------------

function VoiceWaveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-center justify-center gap-[3px] h-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className="inline-block w-[3px] rounded-full bg-emerald-400 transition-all"
          style={{
            height: active ? undefined : "3px",
            animation: active
              ? `voiceBar 0.8s ease-in-out ${i * 0.1}s infinite alternate`
              : "none",
            ...(!active ? { height: "3px" } : {}),
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3-day BP Trend mini-timeline component
// ---------------------------------------------------------------------------

function BPTrendTimeline({ visibleCount }: { visibleCount: number }) {
  const colorMap = {
    green: {
      dot: "bg-emerald-400",
      line: "bg-emerald-400/40",
      text: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    yellow: {
      dot: "bg-amber-400",
      line: "bg-amber-400/40",
      text: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
    },
    red: {
      dot: "bg-red-400",
      line: "bg-red-400/40",
      text: "text-red-400",
      bg: "bg-red-500/10",
      border: "border-red-500/30",
    },
  };

  return (
    <div
      className="mx-3 mb-1.5 px-2.5 py-2 rounded-lg bg-slate-800/80 border border-slate-700/50"
      style={{ animation: "slideUp 0.3s ease-out both" }}
    >
      <div className="text-[8px] text-slate-400 uppercase tracking-wider font-bold mb-2">
        3-Day BP Trend
      </div>
      <div className="flex items-end justify-between gap-1">
        {BP_TREND.map((reading, idx) => {
          const visible = idx < visibleCount;
          const colors = colorMap[reading.color];
          // Bar height proportional to systolic (scale: 120=min, 160=max)
          const minSys = 120;
          const maxSys = 165;
          const barHeight = ((reading.sys - minSys) / (maxSys - minSys)) * 40 + 12;

          return (
            <div
              key={idx}
              className="flex-1 flex flex-col items-center gap-1"
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translateY(0)" : "translateY(8px)",
                transition: "opacity 0.4s ease-out, transform 0.4s ease-out",
              }}
            >
              <div
                className={`text-[10px] font-bold tabular-nums ${colors.text}`}
              >
                {reading.sys}/{reading.dia}
              </div>
              <div
                className={`w-full rounded-t-sm ${colors.dot}`}
                style={{
                  height: `${barHeight}px`,
                  transition: "height 0.4s ease-out",
                }}
              />
              <div className="text-[7px] text-slate-500 leading-tight text-center">
                {reading.label}
              </div>
            </div>
          );
        })}
      </div>
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
    completeCall,
    updateBilling,
  } = useDemo();

  // Local state
  const [phonePhase, setPhonePhase] = useState<PhonePhase>("app");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [bpSys, setBpSys] = useState(130);
  const [bpDia, setBpDia] = useState(85);
  const [statusColor, setStatusColor] = useState<"green" | "yellow">("green");
  const [showAlertBanner, setShowAlertBanner] = useState(false);
  const [isLive, setIsLive] = useState(false);
  const [trendVisible, setTrendVisible] = useState(0); // 0-3 how many trend bars shown
  const [showTrend, setShowTrend] = useState(false);
  const [showAnalyzingHint, setShowAnalyzingHint] = useState(false);

  // Refs
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const conversationRef = useRef<unknown>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  // ------ Auto-scroll transcript ------
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript]);

  // ------ Call duration timer ------
  useEffect(() => {
    if (phonePhase === "call") {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phonePhase]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // ------ Simulated conversation (fallback) ------
  const runSimulatedConversation = useCallback(() => {
    const script = buildScript(patientName);
    let cumDelay = 600;

    script.forEach((line, idx) => {
      const start = cumDelay + line.preDelay;

      const t1 = setTimeout(() => {
        if (line.speaker === "ai") {
          setAiSpeaking(true);
          setIsListening(false);
        } else {
          setAiSpeaking(false);
          setIsListening(true);
        }
      }, start);

      const typeDur = Math.min(line.text.length * 16, 1600);
      const t2 = setTimeout(() => {
        addTranscript(line.speaker, line.text);
      }, start + typeDur);

      const t3 = setTimeout(() => {
        setAiSpeaking(false);
        setIsListening(false);
      }, start + typeDur + line.speakDuration);

      timeoutsRef.current.push(t1, t2, t3);
      cumDelay = start + typeDur + line.speakDuration;

      if (idx === script.length - 1) {
        const tBill = setTimeout(() => {
          updateBilling(Math.ceil(cumDelay / 60000) + 1);
        }, start + typeDur + line.speakDuration + 200);
        timeoutsRef.current.push(tBill);
      }
    });

    const tEnd = setTimeout(() => {
      setAiSpeaking(false);
      setIsListening(false);
      setPhonePhase("ended");
      completeCall();
      addLog("voice", "Call ended — session complete");
    }, cumDelay + 1200);
    timeoutsRef.current.push(tEnd);
  }, [patientName, addTranscript, addLog, completeCall, updateBilling]);

  // ------ Request microphone permission upfront ------
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    try {
      addLog("voice", "Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Keep the stream active — some browsers release mic if we stop tracks
      // Store it so we can clean up later
      micStreamRef.current = stream;
      addLog("voice", "Microphone access granted");
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog("voice", `Microphone denied: ${msg}`);
      return false;
    }
  }, [addLog]);

  // ------ Connect to real ElevenLabs agent ------
  const connectToElevenLabs = useCallback(async () => {
    try {
      // Step 1: Request mic permission first (user gesture context)
      const micGranted = await requestMicPermission();
      if (!micGranted) {
        addLog("voice", "Cannot start voice call without microphone");
        return false;
      }

      // Step 2: Load SDK and start session
      const { Conversation } = await import("@elevenlabs/client");
      addLog("voice", "ElevenLabs SDK loaded, connecting...");

      const firstMsg = `Good morning, ${patientName}! This is CareCompanion AI calling. I noticed your blood pressure reading this morning was 155 over 95, which is a bit higher than your usual range. I wanted to check in with you — did you remember to take your Lisinopril last evening?`;

      const conversation = await Conversation.startSession({
        agentId: "agent_8601kh042d5yf7atvdqa6nbfm9yb",
        connectionType: "webrtc",

        overrides: {
          agent: {
            prompt: {
              prompt: `You are CareCompanion AI, a friendly and empathetic voice-based health companion for Medicare seniors with chronic conditions. You are making an OUTBOUND proactive call to a patient named ${patientName}.

CONTEXT — why you are calling:
- The patient's latest blood pressure reading is 155/95 mmHg, which is elevated above their usual baseline of ~130/85.
- Your system detected that they likely missed their evening dose of Lisinopril 10mg.
- Their other vitals are normal: heart rate 72 bpm, glucose 118 mg/dL, SpO2 98%.
- The patient is 74 years old with hypertension, Type 2 diabetes, and mild CHF.
- Their primary care provider is Dr. Patel.

YOUR ROLE:
1. Greet the patient warmly and explain you're calling because you noticed their BP reading was elevated.
2. Gently ask if they remembered to take their Lisinopril.
3. If they missed it, recommend taking it now and offer to set a reminder for their evening dose.
4. Offer to flag the reading for Dr. Patel.
5. Reassure them that their other vitals look good.
6. Keep the conversation brief (2-3 minutes), warm, and supportive.

SAFETY RULES — you MUST follow these:
- NEVER diagnose conditions or change medication dosages.
- NEVER provide medical advice beyond "take your prescribed medication" and "contact your doctor."
- If the patient reports chest pain, severe headache, or any emergency symptom, tell them to call 911 immediately.
- Always offer to connect them with Dr. Patel for clinical decisions.
- Speak in simple, clear language appropriate for a senior patient.`,
            },
            firstMessage: firstMsg,
            language: "en",
          },
        },

        onConnect: () => {
          addLog("voice", "Connected — ElevenLabs Conversational AI active");
          setIsLive(true);
          setIsListening(true);
        },

        onDisconnect: () => {
          setIsListening(false);
          setAiSpeaking(false);
          setPhonePhase("ended");
          completeCall();
          addLog("voice", "Call ended — session disconnected");
          conversationRef.current = null;
        },

        onMessage: (message: { source?: string; message?: string }) => {
          const speaker = message.source === "user" ? "patient" : "ai";
          const text =
            typeof message.message === "string"
              ? message.message
              : String(message.message ?? "");
          if (text.trim()) {
            addTranscript(speaker as "ai" | "patient", text);
          }
        },

        onModeChange: ({ mode }: { mode: string }) => {
          if (mode === "speaking") {
            setAiSpeaking(true);
            setIsListening(false);
          } else {
            setAiSpeaking(false);
            setIsListening(true);
          }
        },

        onError: (error: Error | string) => {
          const msg = typeof error === "string" ? error : error?.message ?? "Unknown error";
          addLog("voice", `ElevenLabs error: ${msg}`);
        },
      });

      conversationRef.current = conversation;
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      addLog("voice", `ElevenLabs unavailable: ${errorMsg}`);
      return false;
    }
  }, [addLog, addTranscript, completeCall, requestMicPermission, patientName]);

  // ------ Accept incoming call ------
  const acceptCall = useCallback(async () => {
    // Clear pending auto-accept timeout
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];

    setPhonePhase("call");
    setPhaseActive();

    // Try real ElevenLabs first, fall back to simulated
    const connected = await connectToElevenLabs();
    if (!connected) {
      addLog("voice", "Falling back to simulated conversation");
      setIsListening(true);
      runSimulatedConversation();
    }
  }, [setPhaseActive, connectToElevenLabs, addLog, runSimulatedConversation]);

  // ------ Stop mic stream ------
  const stopMicStream = useCallback(() => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  }, []);

  // ------ End call (hang up) ------
  const endCall = useCallback(async () => {
    if (conversationRef.current) {
      try {
        await (conversationRef.current as { endSession?: () => Promise<void> }).endSession?.();
      } catch {
        // ignore
      }
      conversationRef.current = null;
    }
    stopMicStream();
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setAiSpeaking(false);
    setIsListening(false);
    setPhonePhase("ended");
    completeCall();
    addLog("voice", "Call ended by user");
  }, [completeCall, addLog, stopMicStream]);

  // ------ Demo phase: "detecting" — animate 3-day BP trend ------
  useEffect(() => {
    if (demoPhase !== "detecting") return;
    if (phonePhase !== "app") return;

    addLog("voice", "AI monitoring detected vitals anomaly...");

    // Show the trend container
    const t0 = setTimeout(() => {
      setShowTrend(true);
    }, 300);

    // Animate each day appearing 500ms apart
    const t1 = setTimeout(() => {
      setTrendVisible(1); // Day 1: 132/86 green
    }, 800);

    const t2 = setTimeout(() => {
      setTrendVisible(2); // Day 2: 142/90 yellow
    }, 1300);

    const t3 = setTimeout(() => {
      setTrendVisible(3); // Day 3: 155/95 red
    }, 1800);

    // After all 3 shown, update the main BP card to 155/95 + alert state
    const t4 = setTimeout(() => {
      setPhonePhase("alert");
      setBpSys(155);
      setBpDia(95);
      setStatusColor("yellow");
      setShowAlertBanner(true);
      addLog("rules", "Threshold rule: BP 155/95 exceeds 140/90 limit");
      addLog("nlp", "Composite: missed dose + elevated BP detected");
    }, 2500);

    // Do NOT auto-advance to ringing — that's controlled by Panel 2 via triggerCall

    timeoutsRef.current.push(t0, t1, t2, t3, t4);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPhase]);

  // ------ Demo phase: "analyzing" — show hint text ------
  useEffect(() => {
    if (demoPhase === "analyzing") {
      setShowAnalyzingHint(true);
    } else {
      setShowAnalyzingHint(false);
    }
  }, [demoPhase]);

  // ------ Demo phase: "calling" — show incoming call, auto-accept after 3s ------
  useEffect(() => {
    if (demoPhase !== "calling") return;

    // Show incoming call screen
    setPhonePhase("ringing");
    addLog("voice", "Initiating ElevenLabs voice call to patient...");

    // Auto-accept after 3s (user can tap Accept sooner)
    const tAutoAccept = setTimeout(async () => {
      setPhonePhase("call");
      setPhaseActive();
      const connected = await connectToElevenLabs();
      if (!connected) {
        addLog("voice", "Falling back to simulated conversation");
        setIsListening(true);
        runSimulatedConversation();
      }
    }, 3000);

    timeoutsRef.current.push(tAutoAccept);

    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoPhase]);

  // ------ Reset on demo idle ------
  useEffect(() => {
    if (demoPhase === "idle") {
      // End any live session
      if (conversationRef.current) {
        try {
          (conversationRef.current as { endSession?: () => Promise<void> }).endSession?.();
        } catch {
          // ignore
        }
        conversationRef.current = null;
      }
      stopMicStream();
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      setPhonePhase("app");
      setBpSys(130);
      setBpDia(85);
      setStatusColor("green");
      setShowAlertBanner(false);
      setAiSpeaking(false);
      setIsListening(false);
      setElapsed(0);
      setIsLive(false);
      setTrendVisible(0);
      setShowTrend(false);
      setShowAnalyzingHint(false);
    }
  }, [demoPhase, stopMicStream]);

  // ------ Cleanup on unmount ------
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
      if (conversationRef.current) {
        try {
          (conversationRef.current as { endSession?: () => Promise<void> }).endSession?.();
        } catch {
          // ignore
        }
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ======================================================================
  // RENDER
  // ======================================================================

  return (
    <div className="flex flex-col h-full w-full bg-slate-950 text-white overflow-hidden select-none">
      <style>{`
        @keyframes voiceBar {
          0% { height: 4px; }
          50% { height: 18px; }
          100% { height: 6px; }
        }
        @keyframes bubbleFadeIn {
          0% { opacity: 0; transform: translateY(6px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ringPulse {
          0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.6); }
          70% { box-shadow: 0 0 0 16px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }
        @keyframes micPulse {
          0% { box-shadow: 0 0 0 0 rgba(239,68,68,0.5); }
          70% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
          100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
        }
        @keyframes slideUp {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          0% { opacity: 0; }
          100% { opacity: 1; }
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-1px); }
          20%, 40%, 60%, 80% { transform: translateX(1px); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* ================================================================ */}
      {/* PATIENT APP SCREEN (idle / detecting / analyzing / alert)        */}
      {/* ================================================================ */}
      {(phonePhase === "app" || phonePhase === "alert") && (
        <div className="flex flex-col h-full">
          {/* App header */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold text-[8px]">CC</span>
              </div>
              <div>
                <div className="text-[10px] font-bold text-white">My Health</div>
                <div className="text-[8px] text-slate-400">CareCompanion</div>
              </div>
            </div>
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wide transition-all duration-500 ${
                statusColor === "green"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
                  statusColor === "green"
                    ? "bg-emerald-400"
                    : "bg-amber-400 animate-pulse"
                }`}
              />
              {statusColor === "green" ? "All Good" : "Attention"}
            </div>
          </div>

          {/* 3-Day BP Trend Timeline (shown during detecting phase) */}
          {showTrend && (
            <BPTrendTimeline visibleCount={trendVisible} />
          )}

          {/* Alert banner */}
          {showAlertBanner && (
            <div
              className="mx-3 mb-1.5 px-2.5 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30"
              style={{ animation: "slideUp 0.3s ease-out both" }}
            >
              <div className="flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                <span className="text-[9px] font-semibold text-amber-400">
                  BP elevated — missed medication detected
                </span>
              </div>
            </div>
          )}

          {/* Vitals 2x2 grid */}
          <div className="grid grid-cols-2 gap-2 px-3 py-1.5">
            <div
              className={`rounded-lg p-2 transition-all duration-500 ${
                phonePhase === "alert"
                  ? "bg-amber-500/10 border border-amber-500/30"
                  : "bg-slate-800/60 border border-slate-700/50"
              }`}
              style={phonePhase === "alert" ? { animation: "shake 0.5s ease-in-out" } : undefined}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[8px] text-slate-400 uppercase tracking-wider font-medium">Blood Pressure</span>
                {phonePhase === "alert" && (
                  <span className="text-[7px] font-bold text-amber-400 bg-amber-500/20 px-1 rounded">HIGH</span>
                )}
              </div>
              <div className={`text-lg font-bold tabular-nums leading-none transition-colors duration-500 ${
                phonePhase === "alert" ? "text-amber-400" : "text-white"
              }`}>
                {bpSys}/{bpDia}
              </div>
              <div className="text-[8px] text-slate-500 mt-0.5">mmHg</div>
            </div>
            <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
              <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">Heart Rate</div>
              <div className="text-lg font-bold tabular-nums text-white leading-none">72</div>
              <div className="text-[8px] text-emerald-400 mt-0.5">Normal</div>
            </div>
            <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
              <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">Glucose</div>
              <div className="text-lg font-bold tabular-nums text-white leading-none">118</div>
              <div className="text-[8px] text-emerald-400 mt-0.5">In Range</div>
            </div>
            <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
              <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">SpO2</div>
              <div className="text-lg font-bold tabular-nums text-white leading-none">98%</div>
              <div className="text-[8px] text-emerald-400 mt-0.5">Normal</div>
            </div>
          </div>

          {/* Medications */}
          <div className="px-3 py-1.5">
            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Today&apos;s Medications</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 bg-slate-800/40 rounded-md px-2 py-1.5">
                <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <div className="flex-1">
                  <span className="text-[9px] text-white font-medium">Lisinopril 10mg</span>
                  <span className="text-[8px] text-slate-500 ml-1">Morning</span>
                </div>
                <span className="text-[8px] text-emerald-400 font-medium">Taken</span>
              </div>
              <div className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-all duration-500 ${
                phonePhase === "alert" ? "bg-red-500/10 border border-red-500/20" : "bg-slate-800/40"
              }`}>
                <div className={`w-4 h-4 rounded flex items-center justify-center ${phonePhase === "alert" ? "bg-red-500/20" : "bg-slate-700"}`}>
                  {phonePhase === "alert" ? (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 rounded-sm border border-slate-500" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="text-[9px] text-white font-medium">Lisinopril 10mg</span>
                  <span className="text-[8px] text-slate-500 ml-1">Evening</span>
                </div>
                <span className={`text-[8px] font-medium ${phonePhase === "alert" ? "text-red-400" : "text-slate-500"}`}>
                  {phonePhase === "alert" ? "Missed" : "Pending"}
                </span>
              </div>
              <div className="flex items-center gap-2 bg-slate-800/40 rounded-md px-2 py-1.5">
                <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                </div>
                <div className="flex-1">
                  <span className="text-[9px] text-white font-medium">Metformin 500mg</span>
                  <span className="text-[8px] text-slate-500 ml-1">With meals</span>
                </div>
                <span className="text-[8px] text-emerald-400 font-medium">Taken</span>
              </div>
            </div>
          </div>

          {/* Bottom status */}
          <div className="mt-auto px-3 pb-3">
            <div className="text-center">
              <div className="text-[8px] text-slate-500">
                {showAnalyzingHint
                  ? "AI reviewing your readings..."
                  : phonePhase === "alert"
                    ? "CareCompanion AI is reviewing your readings..."
                    : "Last check-in: Today, 8:00 AM"}
              </div>
              {(phonePhase === "alert" || showAnalyzingHint) && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="inline-block w-1 h-1 rounded-full bg-amber-400"
                      style={{ animation: `fadeIn 0.6s ease-in-out ${i * 0.15}s infinite alternate` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* INCOMING CALL SCREEN                                             */}
      {/* ================================================================ */}
      {phonePhase === "ringing" && (
        <div className="flex flex-col h-full items-center justify-center" style={{ animation: "fadeIn 0.4s ease-out both" }}>
          <div
            className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center mb-4"
            style={{ animation: "ringPulse 1.5s ease-out infinite" }}
          >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41a16 16 0 0 0 6.5 6.5l1.22-1.22a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>

          <h2 className="text-sm font-bold text-white mb-0.5">CareCompanion AI</h2>
          <p className="text-[10px] text-slate-400 mb-1">Health check-in call</p>
          <p className="text-[10px] text-emerald-400 animate-pulse mb-8">Incoming call...</p>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/40 mb-6">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-blue-400 to-violet-500" />
            <span className="text-[8px] text-slate-400">Powered by ElevenLabs</span>
          </div>

          <div className="flex items-center gap-8">
            <button className="flex flex-col items-center gap-1">
              <div className="w-12 h-12 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.1-1.1a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              </div>
              <span className="text-[8px] text-slate-500">Decline</span>
            </button>

            <button onClick={acceptCall} className="flex flex-col items-center gap-1">
              <div
                className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30"
                style={{ animation: "ringPulse 1.5s ease-out infinite" }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41a16 16 0 0 0 6.5 6.5l1.22-1.22a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <span className="text-[8px] text-emerald-400 font-medium">Accept</span>
            </button>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* ACTIVE CALL / ENDED SCREEN                                       */}
      {/* ================================================================ */}
      {(phonePhase === "call" || phonePhase === "ended") && (
        <>
          {/* Call header */}
          <div className="flex-shrink-0 px-3 pt-2 pb-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41a16 16 0 0 0 6.5 6.5l1.22-1.22a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92z" />
                    </svg>
                  </div>
                  <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
                    {phonePhase === "call" ? (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                      </>
                    ) : (
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500" />
                    )}
                  </span>
                </div>
                <div className="leading-tight">
                  <div className="text-[10px] font-semibold text-white">CareCompanion AI</div>
                  <div className="flex items-center gap-1">
                    <span className={`text-[8px] font-medium ${phonePhase === "call" ? "text-emerald-400" : "text-slate-500"}`}>
                      {phonePhase === "call" ? (isLive ? "Live call" : "In call") : "Call ended"}
                    </span>
                    <span className="text-[8px] text-slate-600">&bull;</span>
                    <span className="text-[8px] text-slate-400 font-mono tabular-nums">{formatTime(elapsed)}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isLive && (
                  <span className="flex items-center gap-1 text-[8px] text-emerald-400 font-bold uppercase bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Live
                  </span>
                )}
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-slate-800/60 border border-slate-700/40">
                  <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-blue-400 to-violet-500" />
                  <span className="text-[7px] text-slate-500">ElevenLabs</span>
                </div>
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div className="flex-shrink-0 flex items-center justify-center py-1">
            <VoiceWaveform active={aiSpeaking} />
          </div>

          {/* Transcript */}
          <div className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-1.5 scrollbar-hide">
            {transcript.length === 0 && phonePhase === "call" && (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <div className="flex items-center gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"
                      style={{ animation: `fadeIn 0.6s ease-in-out ${d * 0.15}s infinite alternate` }}
                    />
                  ))}
                </div>
                <p className="text-[9px] text-slate-500">
                  {isLive ? "Speak into your microphone..." : "Waiting for conversation..."}
                </p>
              </div>
            )}

            {transcript.map((entry, idx) => {
              const isAi = entry.speaker === "ai";
              return (
                <div
                  key={idx}
                  className={`flex gap-1 ${isAi ? "justify-start" : "justify-end"}`}
                  style={{ animation: "bubbleFadeIn 0.35s ease-out both" }}
                >
                  {isAi && (
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09" />
                      </svg>
                    </div>
                  )}
                  <div
                    className={`relative max-w-[82%] rounded-xl px-2.5 py-1.5 text-[9px] leading-[1.5] ${
                      isAi
                        ? "bg-slate-800/90 text-slate-100 rounded-tl-sm"
                        : "bg-emerald-600/90 text-white rounded-tr-sm"
                    }`}
                  >
                    <div className={`text-[7px] font-bold uppercase tracking-widest mb-0.5 ${
                      isAi ? "text-emerald-400" : "text-emerald-200"
                    }`}>
                      {isAi ? "CareCompanion" : patientName}
                    </div>
                    {entry.text}
                  </div>
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Bottom: mic + end call */}
          <div className="flex-shrink-0 px-3 pb-3 pt-1">
            <div className="flex items-center justify-center gap-6">
              {/* End call button */}
              {phonePhase === "call" && (
                <button
                  onClick={endCall}
                  className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30 hover:bg-red-600 transition-colors"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.1-1.1a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                </button>
              )}

              {/* Mic indicator */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? "bg-red-500 shadow-lg"
                      : aiSpeaking
                        ? "bg-slate-700"
                        : phonePhase === "call"
                          ? "bg-slate-600"
                          : "bg-slate-700/50"
                  }`}
                  style={isListening ? { animation: "micPulse 1.5s ease-out infinite" } : undefined}
                >
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={isListening ? "text-white" : aiSpeaking ? "text-slate-400" : "text-slate-300"}
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div className="text-[8px] text-slate-500">
                  {phonePhase === "ended" ? (
                    "Call complete"
                  ) : aiSpeaking ? (
                    <span className="text-emerald-400">AI speaking...</span>
                  ) : isListening ? (
                    <span className="text-red-400">Listening...</span>
                  ) : (
                    "Connecting..."
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
