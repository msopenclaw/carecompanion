"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useDemo, DAY_DATA, personalizeText, type DayData, type TextMessage } from "./demo-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VoiceAgentProps {
  patientName: string;
}

type PhonePhase = "app" | "texting" | "alert" | "ringing" | "call" | "ended";

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
  const daysUntil = 8 - day;
  return `Next in ${daysUntil}d`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Conversation scripts (voice calls)
// ---------------------------------------------------------------------------

/** Day 2 proactive call — triggered by Margaret's concerning text about nausea */
function buildCheckInScript(): ScriptLine[] {
  return [
    {
      speaker: "ai",
      text: "Hi Margaret, I saw your message about the nausea and vomiting. I wanted to call and talk you through this. How are you feeling right now?",
      speakDuration: 4500,
      preDelay: 1200,
    },
    {
      speaker: "patient",
      text: "Not great. I threw up this morning and I'm honestly thinking about stopping the Wegovy.",
      speakDuration: 3000,
      preDelay: 1600,
    },
    {
      speaker: "ai",
      text: "I completely understand. Nausea is actually the most common side effect in the first week — about a third of patients experience it. The good news is it almost always gets better within a few days. Can I share some tips?",
      speakDuration: 5500,
      preDelay: 1200,
    },
    {
      speaker: "patient",
      text: "Yes please. I really want this to work.",
      speakDuration: 2000,
      preDelay: 1400,
    },
    {
      speaker: "ai",
      text: "Try eating smaller meals throughout the day, keep ginger tea handy, and sip water often. Avoid greasy or heavy foods for now. Most patients feel much better by day five or six. I'll check in with you tomorrow — you're doing great, Margaret!",
      speakDuration: 6000,
      preDelay: 1000,
    },
  ];
}

/** Day 4 incident — nausea intervention, missed check-in */
function buildIncidentScript(): ScriptLine[] {
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
// iOS-style text notification
// ---------------------------------------------------------------------------

function TextNotification({
  message,
  onDismiss,
  onTap,
}: {
  message: string;
  onDismiss: () => void;
  onTap: () => void;
}) {
  const [dismissing, setDismissing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDismissing(true);
      setTimeout(onDismiss, 400);
    }, 3500);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div
      className="mx-2 mt-2 rounded-2xl bg-white/95 backdrop-blur-md shadow-xl border border-slate-200/60 px-3 py-2.5 cursor-pointer"
      style={{
        animation: dismissing
          ? "notifSlideUp 0.35s ease-in forwards"
          : "notifSlideDown 0.35s ease-out both",
      }}
      onClick={() => {
        setDismissing(true);
        setTimeout(onTap, 350);
      }}
    >
      <div className="flex items-start gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-white font-bold text-[7px]">CC</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-bold text-slate-900">CareCompanion AI</span>
            <span className="text-[8px] text-slate-400">now</span>
          </div>
          <p className="text-[9px] text-slate-600 leading-[1.4] mt-0.5 line-clamp-2">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TextingView — iMessage-style animated text conversation
// ---------------------------------------------------------------------------

function TextingView({
  thread,
  onComplete,
}: {
  thread: TextMessage[];
  onComplete: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  const [showTyping, setShowTyping] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (thread.length === 0) {
      onComplete();
      return;
    }

    let cancelled = false;

    const animate = async () => {
      // Show first message after brief typing indicator
      await delay(1200);
      if (cancelled) return;
      setShowTyping(false);
      setVisibleCount(1);

      for (let i = 1; i < thread.length; i++) {
        // Show typing indicator
        await delay(800);
        if (cancelled) return;
        setShowTyping(true);

        // Typing duration based on message length
        const typingTime = Math.min(600 + thread[i].text.length * 12, 2200);
        await delay(typingTime);
        if (cancelled) return;

        setShowTyping(false);
        setVisibleCount(i + 1);
      }

      // All messages shown
      await delay(1500);
      if (cancelled) return;
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    };

    animate();
    return () => { cancelled = true; };
  }, [thread, onComplete]);

  // Auto-scroll as messages appear
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [visibleCount, showTyping]);

  const visibleMessages = thread.slice(0, visibleCount);

  // Determine who is "typing" next
  const nextMessage = visibleCount < thread.length ? thread[visibleCount] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5 border-b border-slate-800/50">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <span className="text-white font-bold text-[8px]">CC</span>
          </div>
          <div>
            <div className="text-[10px] font-bold text-white">CareCompanion AI</div>
            <div className="text-[8px] text-slate-400">Messages</div>
          </div>
        </div>
      </div>

      {/* Message area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-2 scrollbar-hide">
        {visibleMessages.map((msg, idx) => {
          const isAi = msg.sender === "ai";
          return (
            <div
              key={idx}
              className={`flex ${isAi ? "justify-start" : "justify-end"}`}
              style={{ animation: "bubbleFadeIn 0.3s ease-out both" }}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[10px] leading-[1.5] ${
                  isAi
                    ? "bg-slate-700/80 text-slate-100 rounded-tl-sm"
                    : "bg-blue-600 text-white rounded-tr-sm"
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}

        {/* Typing indicator */}
        {showTyping && nextMessage && (
          <div className={`flex ${nextMessage.sender === "ai" ? "justify-start" : "justify-end"}`}>
            <div
              className={`rounded-2xl px-3 py-2.5 ${
                nextMessage.sender === "ai"
                  ? "bg-slate-700/80 rounded-tl-sm"
                  : "bg-blue-600/80 rounded-tr-sm"
              }`}
              style={{ animation: "bubbleFadeIn 0.2s ease-out both" }}
            >
              <div className="flex items-center gap-1">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className={`inline-block w-1.5 h-1.5 rounded-full ${
                      nextMessage.sender === "ai" ? "bg-slate-400" : "bg-blue-200"
                    }`}
                    style={{
                      animation: `typingDot 1s ease-in-out ${d * 0.2}s infinite`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input bar (decorative) */}
      <div className="flex-shrink-0 px-3 pb-2 pt-1">
        <div className="flex items-center gap-2 bg-slate-800/60 rounded-full px-3 py-1.5 border border-slate-700/40">
          <span className="text-[9px] text-slate-500 flex-1">iMessage</span>
          <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center opacity-40">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </div>
        </div>
      </div>
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
  onViewMessages,
}: {
  dayData: DayData;
  showMissedAlert: boolean;
  showAnalyzingHint: boolean;
  onViewMessages?: () => void;
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

        {/* Connected devices indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-800/30">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <span className="text-[7px] text-slate-500 uppercase tracking-wider">Connected: Smart Scale, BP Cuff, Glucometer</span>
        </div>

        {/* 2x2 Vitals grid */}
        <div className="grid grid-cols-2 gap-2">
          {/* Weight */}
          <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-slate-400 uppercase tracking-wider font-medium">Weight</span>
              <span className="text-[6px] text-slate-600 uppercase tracking-wide">Smart Scale</span>
            </div>
            <div className="text-lg font-bold tabular-nums text-white leading-none">{dayData.weight}</div>
            <div className="text-[8px] text-slate-500 mt-0.5">lbs</div>
          </div>

          {/* Blood Pressure */}
          <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-slate-400 uppercase tracking-wider font-medium">Blood Pressure</span>
              <span className="text-[6px] text-slate-600 uppercase tracking-wide">BP Cuff</span>
            </div>
            <div className="text-lg font-bold tabular-nums text-white leading-none">
              {dayData.bpSys}/{dayData.bpDia}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">mmHg</div>
          </div>

          {/* Glucose */}
          <div className="rounded-lg p-2 bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-slate-400 uppercase tracking-wider font-medium">Glucose</span>
              <span className="text-[6px] text-slate-600 uppercase tracking-wide">Glucometer</span>
            </div>
            <div className="text-lg font-bold tabular-nums text-white leading-none">{dayData.glucose}</div>
            <div className="text-[8px] text-slate-500 mt-0.5">mg/dL</div>
          </div>

          {/* Nausea Grade */}
          <div className={`rounded-lg p-2 border ${
            dayData.nauseaGrade >= 2
              ? "bg-orange-500/10 border-orange-500/30"
              : "bg-slate-800/60 border-slate-700/50"
          }`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[8px] text-slate-400 uppercase tracking-wider font-medium">Nausea</span>
              <span className="text-[6px] text-slate-600 uppercase tracking-wide">Self-reported</span>
            </div>
            <div className={`text-lg font-bold leading-none ${nauseaColor(dayData.nauseaGrade)}`}>
              {nauseaLabel(dayData.nauseaGrade)}
            </div>
            <div className="text-[8px] text-slate-500 mt-0.5">Grade {dayData.nauseaGrade}</div>
          </div>
        </div>

        {/* Hydration bar */}
        <div className="px-2.5 py-1.5 rounded-lg bg-slate-800/40 border border-slate-700/40">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[8px] text-slate-400 uppercase tracking-wider font-bold">Hydration</span>
              <span className="text-[6px] text-slate-600 uppercase tracking-wide">Self-reported</span>
            </div>
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
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Medications</span>
            <span className="text-[6px] text-slate-600 uppercase tracking-wide">Self-reported</span>
          </div>
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

        {/* View messages button (if thread exists and not on Day 4) */}
        {dayData.textThread.length > 0 && onViewMessages && (
          <button
            onClick={onViewMessages}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-blue-600/10 border border-blue-500/20 hover:bg-blue-600/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[9px] text-blue-400 font-medium">View Messages</span>
            </div>
            <span className="text-[8px] text-blue-500/60">{dayData.textThread.length} messages</span>
          </button>
        )}
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
    selectedPatient,
    transcript,
    addTranscript,
    addLog,
    openAnalysis,
    setPhaseActive,
    completeCall,
    completeProactiveCall,
    updateBilling,
  } = useDemo();

  // Local state
  const [phonePhase, setPhonePhase] = useState<PhonePhase>("app");
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [showAlertBanner, setShowAlertBanner] = useState(false);
  const [showAnalyzingHint, setShowAnalyzingHint] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const [onSecondThread, setOnSecondThread] = useState(false);

  // Refs
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const notificationShownRef = useRef(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const preloadedAudioRef = useRef<Blob | null>(null);

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

  // ------ Text notification trigger (fires when phase becomes "idle") ------
  // Non-call days start in "analyzing" → thinking feed plays → idle → notification
  // Day 2 starts idle → notification immediately
  // Day 4 starts detecting → no notification (patient unresponsive)
  useEffect(() => {
    if (demoPhase !== "idle" || currentDay < 1 || notificationShownRef.current) return;

    const dd = DAY_DATA[currentDay - 1];
    if (!dd || dd.textThread.length === 0 || dd.isIncidentDay) return;

    notificationShownRef.current = true;
    const t = setTimeout(() => setShowNotification(true), 800);
    // Don't push to timeoutsRef — the "reset on idle" effect clears it simultaneously
    return () => clearTimeout(t);
  }, [demoPhase, currentDay]);

  // ------ Texting complete handler ------
  const handleTextingComplete = useCallback(() => {
    const dd = currentDay >= 1 && currentDay <= 7 ? DAY_DATA[currentDay - 1] : null;

    if (dd?.isIncidentDay) {
      // Day 4: return to vitals view — the detecting→analyzing flow handles the call
      const t = setTimeout(() => {
        setPhonePhase("app");
      }, 1500);
      timeoutsRef.current.push(t);
    } else if (dd?.isCallDay && !onSecondThread) {
      // Day 2: trigger AI analysis on middle panel → thinking feed → auto-triggers call
      const t = setTimeout(() => {
        openAnalysis();
      }, 2000);
      timeoutsRef.current.push(t);
    } else if (!onSecondThread && dd?.patientInitThread && dd.patientInitThread.length > 0) {
      // First thread done, patient-initiated thread exists — show it after a pause
      const t = setTimeout(() => {
        setPhonePhase("app");
      }, 1500);
      const t2 = setTimeout(() => {
        setOnSecondThread(true);
        setShowNotification(true);
      }, 4000);
      timeoutsRef.current.push(t, t2);
    } else {
      // Non-call days or second thread done: return to vitals view
      const t = setTimeout(() => {
        setPhonePhase("app");
      }, 2000);
      timeoutsRef.current.push(t);
    }
  }, [currentDay, openAnalysis, onSecondThread]);

  // ------ Audio playback for a single line ------
  const playLineAudio = useCallback(async (
    text: string,
    speaker: "ai" | "patient",
    fallbackDurationMs: number,
    signal: AbortSignal,
  ): Promise<void> => {
    // Check for preloaded audio first (AI line preloaded during ringing)
    if (speaker === "ai" && preloadedAudioRef.current) {
      const blob = preloadedAudioRef.current;
      preloadedAudioRef.current = null;
      try {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(); };
          const onAbort = () => { audio.pause(); URL.revokeObjectURL(url); resolve(); };
          signal.addEventListener("abort", onAbort, { once: true });
          audio.play().catch(reject);
        });
        return;
      } catch {
        // Fall through
      }
    }

    // Try ElevenLabs TTS for all lines (AI = Rachel voice, Patient = Dorothy voice)
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice: speaker }),
        signal,
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        await new Promise<void>((resolve, reject) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
          audio.onerror = () => { URL.revokeObjectURL(url); reject(); };
          const onAbort = () => { audio.pause(); URL.revokeObjectURL(url); resolve(); };
          signal.addEventListener("abort", onAbort, { once: true });
          audio.play().catch(reject);
        });
        return;
      }
    } catch {
      if (signal.aborted) return;
      // Fall through to SpeechSynthesis
    }

    // Fallback: browser SpeechSynthesis
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.95;
        if (speaker === "patient") {
          const voices = speechSynthesis.getVoices();
          const femaleVoice = voices.find((v) =>
            v.name.includes("Female") || v.name.includes("Samantha") ||
            v.name.includes("Victoria") || v.name.includes("Karen") ||
            v.name.includes("Zira")
          );
          if (femaleVoice) utterance.voice = femaleVoice;
        }
        await new Promise<void>((resolve) => {
          utterance.onend = () => resolve();
          utterance.onerror = () => resolve();
          const onAbort = () => { speechSynthesis.cancel(); resolve(); };
          signal.addEventListener("abort", onAbort, { once: true });
          speechSynthesis.speak(utterance);
        });
        return;
      } catch {
        if (signal.aborted) return;
        // Fall through to silent
      }
    }

    // Silent fallback: just wait the expected duration
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, fallbackDurationMs);
      const onAbort = () => { clearTimeout(t); resolve(); };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }, []);

  // ------ Simulated conversation with audio ------
  const runSimulatedConversation = useCallback(async (isProactive: boolean) => {
    const script = isProactive ? buildCheckInScript() : buildIncidentScript();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const { signal } = controller;

    for (let idx = 0; idx < script.length; idx++) {
      if (signal.aborted) break;

      const line = script[idx];

      // Pre-delay
      await delay(line.preDelay);
      if (signal.aborted) break;

      // Set speaker state
      if (line.speaker === "ai") {
        setAiSpeaking(true);
        setIsListening(false);
      } else {
        setAiSpeaking(false);
        setIsListening(true);
      }

      // Add to transcript
      addTranscript(line.speaker, line.text);

      // Play audio
      await playLineAudio(line.text, line.speaker, line.speakDuration, signal);
      if (signal.aborted) break;

      // Reset speaker state between lines
      setAiSpeaking(false);
      setIsListening(false);

      // Brief pause between lines
      await delay(300);
    }

    if (!signal.aborted) {
      // Update billing (only for Day 4 incident calls)
      if (!isProactive) {
        updateBilling(25);
      }

      setAiSpeaking(false);
      setIsListening(false);
      setPhonePhase("ended");

      if (isProactive) {
        completeProactiveCall();
      } else {
        completeCall();
      }
      addLog("voice", "Call ended — session complete");
    }
  }, [addTranscript, addLog, completeCall, completeProactiveCall, updateBilling, playLineAudio]);

  // ------ End call (hang up) ------
  const endCall = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    timeoutsRef.current.forEach(clearTimeout);
    timeoutsRef.current = [];
    setAiSpeaking(false);
    setIsListening(false);
    setPhonePhase("ended");
    if (currentDay === 2) {
      completeProactiveCall();
    } else {
      completeCall();
    }
    addLog("voice", "Call ended by user");
  }, [completeCall, completeProactiveCall, addLog, currentDay]);

  // ------ Demo phase: "detecting" — Day 4 engagement drop ------
  useEffect(() => {
    if (demoPhase !== "detecting") return;
    if (phonePhase !== "app") return;

    addLog("voice", "AI monitoring detected engagement decline...");

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

    setPhonePhase("ringing");
    const isProactive = currentDay === 2;
    addLog("voice", isProactive
      ? "Initiating proactive check-in call..."
      : "Initiating engagement outreach call to patient...");

    // Preload first AI line TTS during ringing
    const script = isProactive ? buildCheckInScript() : buildIncidentScript();
    const firstAILine = script.find((l) => l.speaker === "ai");
    if (firstAILine) {
      fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: firstAILine.text, voice: "ai" }),
      })
        .then((r) => r.ok ? r.blob() : null)
        .then((blob) => {
          if (blob) preloadedAudioRef.current = blob;
        })
        .catch(() => {});
    }

    // Auto-accept after 3s
    const tAutoAccept = setTimeout(() => {
      setPhonePhase("call");
      setPhaseActive();
      addLog("voice", "Call connected — simulated conversation starting");
      runSimulatedConversation(isProactive);
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
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      setPhonePhase("app");
      setShowAlertBanner(false);
      setAiSpeaking(false);
      setIsListening(false);
      setElapsed(0);
      setShowAnalyzingHint(false);
      preloadedAudioRef.current = null;
    }
  }, [demoPhase]);

  // ------ Cleanup on unmount ------
  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      if (timerRef.current) clearInterval(timerRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        speechSynthesis.cancel();
      }
    };
  }, []);

  // ------ Resolve current day data ------
  const dayData: DayData | null =
    currentDay >= 1 && currentDay <= 7 ? DAY_DATA[currentDay - 1] : null;

  // ------ Resolve active thread (first or patient-initiated) ------
  const activeThread: TextMessage[] = (() => {
    if (!dayData) return [];
    const raw = onSecondThread && dayData.patientInitThread
      ? dayData.patientInitThread
      : dayData.textThread;
    return raw.map((msg) => ({
      ...msg,
      text: personalizeText(msg.text, selectedPatient.firstName),
    }));
  })();

  // ======================================================================
  // RENDER
  // ======================================================================

  return (
    <div className="relative flex flex-col h-full w-full bg-slate-950 text-white overflow-hidden select-none">
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
        @keyframes notifSlideDown {
          0% { transform: translateY(-100%); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes notifSlideUp {
          0% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-100%); opacity: 0; }
        }
        @keyframes typingDot {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-2px); }
        }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* iOS-style text notification overlay */}
      {showNotification && activeThread.length > 0 && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 50 }}>
          <TextNotification
            message={activeThread[0].text}
            onDismiss={() => {
              setShowNotification(false);
              setPhonePhase("texting");
            }}
            onTap={() => {
              setShowNotification(false);
              setPhonePhase("texting");
            }}
          />
        </div>
      )}

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
      {/* TEXTING VIEW — animated text conversation                        */}
      {/* ================================================================ */}
      {phonePhase === "texting" && activeThread.length > 0 && (
        <TextingView
          thread={activeThread}
          onComplete={handleTextingComplete}
        />
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
          onViewMessages={activeThread.length > 0 ? () => setPhonePhase("texting") : undefined}
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
          <p className="text-[10px] text-slate-400 mb-1">
            {currentDay === 2 ? "Proactive wellness check-in" : "GLP-1 engagement check-in"}
          </p>
          <p className="text-[10px] text-emerald-400 animate-pulse mb-8">Incoming call...</p>

          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/60 border border-slate-700/40">
            <div className="w-3 h-3 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center">
              <svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09" />
              </svg>
            </div>
            <span className="text-[8px] text-slate-400">Auto-connecting in 3s...</span>
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
                      {phonePhase === "call" ? "Simulated call" : "Call ended"}
                    </span>
                    <span className="text-[8px] text-slate-600">&bull;</span>
                    <span className="text-[8px] text-slate-400 font-mono tabular-nums">{formatTime(elapsed)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Waveform */}
          <div className="flex-shrink-0 flex items-center justify-center py-1">
            <VoiceWaveform active={aiSpeaking || isListening} />
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
                <p className="text-[9px] text-slate-500">Starting conversation...</p>
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

          {/* Bottom: speaker indicator + end call */}
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

              {/* Speaker indicator */}
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    aiSpeaking
                      ? "bg-emerald-500/20 border-2 border-emerald-500/50"
                      : isListening
                        ? "bg-blue-500/20 border-2 border-blue-500/50"
                        : phonePhase === "call"
                          ? "bg-slate-700"
                          : "bg-slate-700/50"
                  }`}
                >
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                    className={aiSpeaking ? "text-emerald-400" : isListening ? "text-blue-400" : "text-slate-400"}
                  >
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                </div>
                <div className="text-[8px] text-slate-500">
                  {phonePhase === "ended" ? (
                    "Call complete"
                  ) : aiSpeaking ? (
                    <span className="text-emerald-400">AI speaking...</span>
                  ) : isListening ? (
                    <span className="text-blue-400">Patient speaking...</span>
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
