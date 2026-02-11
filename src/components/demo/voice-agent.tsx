"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDemo, DAY_DATA, type DayData } from "./demo-context";

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
// Helpers
// ---------------------------------------------------------------------------

function nauseaLabel(grade: number): string {
  switch (grade) {
    case 0: return "None";
    case 1: return "Mild";
    case 2: return "Moderate";
    case 3: return "Severe";
    default: return "None";
  }
}

function nauseaColor(grade: number): string {
  switch (grade) {
    case 0: return "text-emerald-400";
    case 1: return "text-amber-400";
    case 2: return "text-orange-400";
    case 3: return "text-red-400";
    default: return "text-emerald-400";
  }
}

function fluidBarColor(oz: number): string {
  if (oz > 56) return "bg-emerald-500";
  if (oz > 40) return "bg-amber-500";
  return "bg-red-500";
}

function fluidBarBg(oz: number): string {
  if (oz > 56) return "bg-emerald-500/20";
  if (oz > 40) return "bg-amber-500/20";
  return "bg-red-500/20";
}

function wegovyStatus(day: number): string {
  if (day === 1) return "Taken";
  // Next dose is Monday (Day 1), so remaining days until next Monday
  const daysUntil = 8 - day; // day 2 → 6 days, day 7 → 1 day
  return `Next in ${daysUntil}d`;
}

// ---------------------------------------------------------------------------
// Fallback conversation script (GLP-1 / Nausea)
// ---------------------------------------------------------------------------

function buildScript(): ScriptLine[] {
  return [
    {
      speaker: "ai",
      text: "Hi Margaret, I noticed you missed your check-in today, and your nausea has been increasing. How are you feeling?",
      speakDuration: 4500,
      preDelay: 1200,
    },
    {
      speaker: "patient",
      text: "Honestly, the nausea has been terrible. I almost stopped taking the Wegovy altogether.",
      speakDuration: 3200,
      preDelay: 1800,
    },
    {
      speaker: "ai",
      text: "I'm sorry to hear that. Nausea is actually very common in the first week — about a third of patients experience it. The good news is it almost always gets better. Can I share some tips?",
      speakDuration: 5200,
      preDelay: 1400,
    },
    {
      speaker: "patient",
      text: "Yes please. I really want this to work but the nausea made me feel like I should quit.",
      speakDuration: 3000,
      preDelay: 1600,
    },
    {
      speaker: "ai",
      text: "Try eating smaller meals throughout the day, keep ginger tea handy, and sip water often — your fluid intake has been low. I'll note this for Dr. Patel in case they want to consider an anti-nausea medication. You're doing really well — you've already lost 1.2 pounds and your glucose is improving!",
      speakDuration: 7000,
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
// DailyVitalsCard — shown for Days 1-7 (non-call states)
// ---------------------------------------------------------------------------

function DailyVitalsCard({
  dayData,
  showMissedAlert,
  showAnalyzingHint,
}: {
  dayData: DayData;
  showMissedAlert: boolean;
  showAnalyzingHint: boolean;
}) {
  const statusGood = dayData.engagementScore > 70;

  return (
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
            statusGood
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
              statusGood
                ? "bg-emerald-400"
                : "bg-amber-400 animate-pulse"
            }`}
          />
          {statusGood ? "On Track" : "Attention"}
        </div>
      </div>

      {/* Day banner */}
      <div className="mx-3 mb-1.5 px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-indigo-600/30 to-violet-600/20 border border-indigo-500/30">
        <div className="text-[10px] font-bold text-white">
          Day {dayData.day} of Wegovy Journey
        </div>
        <div className="text-[8px] text-indigo-300">{dayData.date}</div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-2 space-y-1.5">
        {/* Missed check-in alert (Day 4) */}
        {showMissedAlert && (
          <div
            className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30"
            style={{ animation: "slideUp 0.3s ease-out both" }}
          >
            <div className="flex items-center gap-1.5">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-[9px] font-semibold text-red-400">
                Missed Check-in {showAnalyzingHint ? "— AI analyzing..." : "— engagement drop detected"}
              </span>
            </div>
          </div>
        )}

        {/* 2x2 Vitals grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Weight */}
          <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
            <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">Weight</div>
            <div className="text-lg font-bold tabular-nums text-white leading-none">{dayData.weight}</div>
            <div className="text-[8px] text-slate-500 mt-0.5">lbs</div>
          </div>

          {/* Blood Pressure */}
          <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
            <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">Blood Pressure</div>
            <div className="text-lg font-bold tabular-nums text-white leading-none">
              {dayData.bpSys}/{dayData.bpDia}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">mmHg</div>
          </div>

          {/* Glucose */}
          <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
            <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">Glucose</div>
            <div className="text-lg font-bold tabular-nums text-white leading-none">{dayData.glucose}</div>
            <div className="text-[8px] text-slate-500 mt-0.5">mg/dL</div>
          </div>

          {/* Nausea Grade */}
          <div className={`rounded-lg p-2 border ${
            dayData.nauseaGrade >= 2
              ? "bg-orange-500/10 border-orange-500/30"
              : "bg-slate-800/60 border-slate-700/50"
          }`}>
            <div className="text-[8px] text-slate-400 uppercase tracking-wider font-medium mb-1">Nausea</div>
            <div className={`text-lg font-bold leading-none ${nauseaColor(dayData.nauseaGrade)}`}>
              {nauseaLabel(dayData.nauseaGrade)}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">Grade {dayData.nauseaGrade}</div>
          </div>
        </div>

        {/* Symptom tracker */}
        {dayData.symptomNote && (
          <div className="px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <div className="text-[8px] text-slate-400 uppercase tracking-wider font-bold mb-1">Symptom Notes</div>
            <div className="text-[9px] text-slate-300 leading-[1.5]">{dayData.symptomNote}</div>
          </div>
        )}

        {/* AI message bubble */}
        {dayData.phoneMessage && (
          <div
            className="px-2.5 py-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30"
            style={{ animation: "slideUp 0.3s ease-out both" }}
          >
            <div className="flex items-center gap-1 mb-1">
              <div className="w-3.5 h-3.5 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
                <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09" />
                </svg>
              </div>
              <span className="text-[7px] font-bold text-emerald-400 uppercase tracking-widest">CareCompanion AI</span>
            </div>
            <div className="text-[9px] text-emerald-100 leading-[1.5]">{dayData.phoneMessage}</div>
          </div>
        )}

        {/* Hydration bar */}
        <div className="px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[8px] text-slate-400 uppercase tracking-wider font-bold">Hydration</span>
            <span className={`text-[8px] font-bold tabular-nums ${
              dayData.fluidOz > 56 ? "text-emerald-400" : dayData.fluidOz > 40 ? "text-amber-400" : "text-red-400"
            }`}>
              {dayData.fluidOz} / 64 oz
            </span>
          </div>
          <div className={`w-full h-2 rounded-full ${fluidBarBg(dayData.fluidOz)}`}>
            <div
              className={`h-full rounded-full transition-all duration-500 ${fluidBarColor(dayData.fluidOz)}`}
              style={{ width: `${Math.min((dayData.fluidOz / 64) * 100, 100)}%` }}
            />
          </div>
        </div>

        {/* Medications */}
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Medications</div>
          <div className="space-y-1">
            {/* Wegovy */}
            <div className="flex items-center gap-2 bg-slate-800/40 rounded-md px-2 py-1.5">
              <div className={`w-4 h-4 rounded flex items-center justify-center ${
                dayData.day === 1 ? "bg-emerald-500/20" : "bg-slate-700"
              }`}>
                {dayData.day === 1 ? (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                ) : (
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                )}
              </div>
              <div className="flex-1">
                <span className="text-[9px] text-white font-medium">Wegovy 0.25mg</span>
                <span className="text-[8px] text-slate-500 ml-1">Weekly - Monday</span>
              </div>
              <span className={`text-[8px] font-medium ${dayData.day === 1 ? "text-emerald-400" : "text-slate-500"}`}>
                {wegovyStatus(dayData.day)}
              </span>
            </div>

            {/* Metformin */}
            <div className="flex items-center gap-2 bg-slate-800/40 rounded-md px-2 py-1.5">
              <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <div className="flex-1">
                <span className="text-[9px] text-white font-medium">Metformin 1000mg</span>
                <span className="text-[8px] text-slate-500 ml-1">Twice daily</span>
              </div>
              <span className="text-[8px] text-emerald-400 font-medium">Taken</span>
            </div>

            {/* Lisinopril */}
            <div className="flex items-center gap-2 bg-slate-800/40 rounded-md px-2 py-1.5">
              <div className="w-4 h-4 rounded bg-emerald-500/20 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
              </div>
              <div className="flex-1">
                <span className="text-[9px] text-white font-medium">Lisinopril 20mg</span>
                <span className="text-[8px] text-slate-500 ml-1">Daily</span>
              </div>
              <span className="text-[8px] text-emerald-400 font-medium">Taken</span>
            </div>
          </div>
        </div>
      </div>

      {/* Engagement score at bottom */}
      <div className="flex-shrink-0 px-3 pb-3 pt-1">
        <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <span className="text-[8px] text-slate-400 uppercase tracking-wider font-bold">Engagement Score</span>
          <div className="flex items-center gap-1.5">
            <div className="w-16 h-1.5 rounded-full bg-slate-700">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  dayData.engagementScore > 70
                    ? "bg-emerald-500"
                    : dayData.engagementScore > 50
                      ? "bg-amber-500"
                      : "bg-red-500"
                }`}
                style={{ width: `${dayData.engagementScore}%` }}
              />
            </div>
            <span className={`text-[10px] font-bold tabular-nums ${
              dayData.engagementScore > 70
                ? "text-emerald-400"
                : dayData.engagementScore > 50
                  ? "text-amber-400"
                  : "text-red-400"
            }`}>
              {dayData.engagementScore}%
            </span>
          </div>
        </div>
        {(showMissedAlert || showAnalyzingHint) && (
          <div className="flex items-center justify-center gap-1 mt-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="inline-block w-1 h-1 rounded-full bg-amber-400"
                style={{ animation: `fadeIn 0.6s ease-in-out ${i * 0.15}s infinite alternate` }} />
            ))}
          </div>
        )}
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
    currentDay,
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
  const [showAlertBanner, setShowAlertBanner] = useState(false);
  const [isLive, setIsLive] = useState(false);
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
    const script = buildScript();
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
    // Reuse existing stream if already granted
    if (micStreamRef.current) return true;
    try {
      addLog("voice", "Requesting microphone access...");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      // Step 1: Request mic permission first (may already be granted)
      const micGranted = await requestMicPermission();
      if (!micGranted) {
        addLog("voice", "Cannot start voice call without microphone");
        return false;
      }

      // Step 2: Load SDK
      const { Conversation } = await import("@elevenlabs/client");
      addLog("voice", "ElevenLabs SDK loaded, connecting...");

      // Step 3: Try to get a signed URL from our API (production), fall back to agentId
      let signedUrl: string | null = null;
      try {
        const urlRes = await fetch("/api/elevenlabs-signed-url");
        if (urlRes.ok) {
          const data = await urlRes.json();
          if (data.signed_url) {
            signedUrl = data.signed_url;
            addLog("voice", "Using signed URL for secure connection");
          }
        }
      } catch {
        // ignore — fall back to agentId
      }
      if (!signedUrl) {
        addLog("voice", "Using public agent ID");
      }

      const firstMsg = `Hi Margaret, this is CareCompanion AI. I noticed you missed your check-in today and I see your nausea has been increasing. I wanted to check in — how are you feeling?`;

      const conversation = await Conversation.startSession({
        ...(signedUrl
          ? { signedUrl }
          : { agentId: "agent_8601kh042d5yf7atvdqa6nbfm9yb", connectionType: "webrtc" as const }),

        overrides: {
          agent: {
            prompt: {
              prompt: `You are CareCompanion AI, a friendly and empathetic voice-based health companion for Medicare patients on GLP-1 medications. You are making an OUTBOUND proactive engagement call to a patient named Margaret Chen.

CONTEXT — why you are calling:
- It is Wegovy Day 4 (Thursday, Jul 10). Margaret started Wegovy (semaglutide) 0.25mg on Monday.
- She missed her daily check-in today — this is the first missed check-in since starting.
- Her nausea has been escalating: Grade 0 (Day 1) → Grade 1 (Day 2) → Grade 2 (Day 3) → Grade 2 estimated today.
- Her fluid intake has been declining: 64oz → 56oz → 38oz → estimated <32oz today. Dehydration risk.
- Margaret is 72 years old with Type 2 Diabetes, Obesity (BMI 38), and Hypertension.
- Her other vitals are actually improving: weight 247.2 → 246.0 (down 1.2 lbs), glucose 168 → 132 (improving), BP stable.
- Her engagement score dropped from 92 → 41 over 4 days.
- Her primary care provider is Dr. Patel.

YOUR ROLE:
1. Check on her nausea symptoms — ask how she's feeling.
2. Normalize the experience — nausea is very common in week 1 (affects ~1/3 of patients) and almost always resolves.
3. Provide practical tips: eat smaller meals throughout the day, try ginger tea, sip water frequently, avoid fatty or spicy foods.
4. Celebrate her early results — she's already lost 1.2 pounds and her glucose is coming down nicely.
5. Offer to note her symptoms for Dr. Patel in case they want to consider an anti-nausea medication (ondansetron).
6. Encourage her to keep going — the first week is the hardest and it gets better.

SAFETY RULES — you MUST follow these:
- NEVER diagnose conditions or change medication dosages.
- NEVER provide medical advice beyond general wellness tips and "take your prescribed medication."
- If the patient reports severe vomiting, inability to keep fluids down, or any emergency symptom, tell them to call 911 or contact Dr. Patel immediately.
- Always offer to connect them with Dr. Patel for clinical decisions.
- Speak in simple, clear, warm language appropriate for a senior patient.`,
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
  }, [addLog, addTranscript, completeCall, requestMicPermission]);

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

  // ------ Demo phase: "detecting" — show engagement drop + missed check-in ------
  useEffect(() => {
    if (demoPhase !== "detecting") return;
    if (phonePhase !== "app") return;

    addLog("voice", "AI monitoring detected engagement decline...");

    // Pre-request mic permission now (close to user gesture from "Run Demo" click)
    requestMicPermission();

    // After ~2.5s, show alert state
    const t1 = setTimeout(() => {
      setPhonePhase("alert");
      setShowAlertBanner(true);
      addLog("rules", "Threshold: missed check-in + nausea Grade 2 + low fluid intake");
    }, 2500);

    timeoutsRef.current.push(t1);

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
    addLog("voice", "Initiating engagement outreach call to patient...");

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
      setShowAlertBanner(false);
      setAiSpeaking(false);
      setIsListening(false);
      setElapsed(0);
      setIsLive(false);
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

  // ------ Resolve current day data ------
  const dayData: DayData | null =
    currentDay >= 1 && currentDay <= 7 ? DAY_DATA[currentDay - 1] : null;

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
      {/* IDLE STATE — Day 0, no data yet                                  */}
      {/* ================================================================ */}
      {currentDay === 0 && phonePhase !== "ringing" && phonePhase !== "call" && phonePhase !== "ended" && (
        <div className="flex flex-col h-full items-center justify-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-3">
            <span className="text-white font-bold text-sm">CC</span>
          </div>
          <h2 className="text-sm font-bold text-white mb-1">CareCompanion</h2>
          <p className="text-[10px] text-slate-400 mb-4">Patient Health Monitor</p>
          <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-slate-800/60 border border-slate-700/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-slate-300">Ready to begin</span>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* DAILY VITALS CARD — Days 1-7 (non-call states)                   */}
      {/* ================================================================ */}
      {dayData && (phonePhase === "app" || phonePhase === "alert") && currentDay >= 1 && (
        <DailyVitalsCard
          dayData={dayData}
          showMissedAlert={
            dayData.isIncidentDay && (showAlertBanner || demoPhase === "detecting" || demoPhase === "analyzing")
          }
          showAnalyzingHint={showAnalyzingHint}
        />
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
          <p className="text-[10px] text-slate-400 mb-1">GLP-1 engagement check-in</p>
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
