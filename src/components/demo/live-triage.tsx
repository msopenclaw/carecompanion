"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useDemo } from "./demo-context";

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useCountUp(target: number, durationMs = 1400): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // cubic ease-out
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return value;
}

// ---------------------------------------------------------------------------
// Risk color helpers
// ---------------------------------------------------------------------------

function riskBadgeClasses(score: number): string {
  if (score <= 30) return "bg-emerald-100 text-emerald-700 border-emerald-300";
  if (score <= 60) return "bg-amber-100 text-amber-700 border-amber-300";
  return "bg-red-100 text-red-700 border-red-300";
}

function riskDotColor(score: number): string {
  if (score <= 30) return "bg-emerald-500";
  if (score <= 60) return "bg-amber-500";
  return "bg-red-500";
}

// ---------------------------------------------------------------------------
// Patient data
// ---------------------------------------------------------------------------

interface PatientRow {
  name: string;
  age: number;
  riskIdle: number;
  riskActive: number;
  conditions: string;
  vital: string;
  lastCheckIn: string;
}

const PATIENTS: PatientRow[] = [
  {
    name: "Margaret Chen",
    age: 74,
    riskIdle: 72,
    riskActive: 84,
    conditions: "HTN + T2D + CHF",
    vital: "BP 155/95 \u2191\u2191",
    lastCheckIn: "2 min ago",
  },
  {
    name: "James Rodriguez",
    age: 68,
    riskIdle: 58,
    riskActive: 58,
    conditions: "CHF + HTN",
    vital: "Wt +2.1 lbs \u2191",
    lastCheckIn: "18 min ago",
  },
  {
    name: "Walter Brooks",
    age: 83,
    riskIdle: 51,
    riskActive: 51,
    conditions: "CHF + COPD",
    vital: "HR 88 \u2191",
    lastCheckIn: "35 min ago",
  },
  {
    name: "Robert Kim",
    age: 81,
    riskIdle: 45,
    riskActive: 45,
    conditions: "COPD + HTN",
    vital: "SpO2 93% \u2192",
    lastCheckIn: "1h ago",
  },
  {
    name: "Helen Murray",
    age: 77,
    riskIdle: 38,
    riskActive: 38,
    conditions: "HTN",
    vital: "BP 138/88 \u2192",
    lastCheckIn: "1h ago",
  },
  {
    name: "Aisha Patel",
    age: 45,
    riskIdle: 28,
    riskActive: 28,
    conditions: "HTN",
    vital: "BP 134/86 \u2192",
    lastCheckIn: "2h ago",
  },
  {
    name: "Dorothy Harris",
    age: 70,
    riskIdle: 22,
    riskActive: 22,
    conditions: "T2D",
    vital: "Glucose 112 \u2713",
    lastCheckIn: "3h ago",
  },
  {
    name: "Sarah Williams",
    age: 52,
    riskIdle: 15,
    riskActive: 15,
    conditions: "T2D",
    vital: "Glucose 98 \u2713",
    lastCheckIn: "4h ago",
  },
];

// ---------------------------------------------------------------------------
// AI insight data
// ---------------------------------------------------------------------------

interface InsightCard {
  id: string;
  severity: "info" | "elevated" | "positive";
  text: string;
  timestamp: string;
  showOnlyWhenActive?: boolean;
}

const AI_INSIGHTS: InsightCard[] = [
  {
    id: "insight-1",
    severity: "info",
    text: "4 patients showing weight gain + BP elevation pattern (possible fluid retention cluster)",
    timestamp: "12 min ago",
  },
  {
    id: "insight-2",
    severity: "elevated",
    text: "Margaret Chen: BP trending up 3 days, correlates with 2 missed lisinopril doses",
    timestamp: "Just now",
    showOnlyWhenActive: true,
  },
  {
    id: "insight-3",
    severity: "elevated",
    text: "James Rodriguez: CHF composite alert \u2014 weight gain + HR elevation detected",
    timestamp: "18 min ago",
  },
  {
    id: "insight-4",
    severity: "positive",
    text: "Population adherence: 94.2% this week, up from 91.8% last week",
    timestamp: "1h ago",
  },
];

// ---------------------------------------------------------------------------
// Insight severity styling
// ---------------------------------------------------------------------------

function insightBorderColor(severity: InsightCard["severity"]): string {
  switch (severity) {
    case "info":
      return "border-l-blue-400";
    case "elevated":
      return "border-l-amber-500";
    case "positive":
      return "border-l-emerald-500";
  }
}

function insightLabelColor(severity: InsightCard["severity"]): string {
  switch (severity) {
    case "info":
      return "text-blue-600";
    case "elevated":
      return "text-amber-600";
    case "positive":
      return "text-emerald-600";
  }
}

function insightLabel(severity: InsightCard["severity"]): string {
  switch (severity) {
    case "info":
      return "Pattern";
    case "elevated":
      return "Alert";
    case "positive":
      return "Trend";
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveTriage() {
  const { demoPhase, alerts } = useDemo();

  const isActive = demoPhase === "active" || demoPhase === "complete";
  const isLive = demoPhase === "active";

  // Animated counters
  const readingsToday = useCountUp(847, 1200);
  const aiProcessed = useCountUp(835, 1400);

  // Track urgent count — starts at 3, can increment with live alerts
  const baseUrgent = 3;
  const criticalAlertCount = alerts.filter(
    (a) => a.severity === "critical"
  ).length;
  const urgentCount = baseUrgent + criticalAlertCount;

  // Sort patients by risk score descending
  const sortedPatients = useMemo(() => {
    return [...PATIENTS].sort((a, b) => {
      const aScore = isActive ? a.riskActive : a.riskIdle;
      const bScore = isActive ? b.riskActive : b.riskIdle;
      return bScore - aScore;
    });
  }, [isActive]);

  // Margaret highlight state — pulse when active and alerts exist
  const [margaretPulse, setMargaretPulse] = useState(false);
  useEffect(() => {
    if (isActive && alerts.length > 0) {
      setMargaretPulse(true);
      const timer = setTimeout(() => setMargaretPulse(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isActive, alerts.length]);

  // Insight card entrance tracking
  const [insightMounted, setInsightMounted] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setInsightMounted(true), 400);
    return () => clearTimeout(timer);
  }, []);

  // Visible insights
  const visibleInsights = AI_INSIGHTS.filter(
    (i) => !i.showOnlyWhenActive || isActive
  );

  return (
    <div className="flex flex-col h-full w-full bg-white text-slate-800 font-sans select-none overflow-hidden">
      {/* Keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes rowPulse {
          0%, 100% { background-color: transparent; }
          50% { background-color: rgb(254 226 226 / 0.6); }
        }
        @keyframes livePing {
          0% { transform: scale(1); opacity: 1; }
          75% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes insightHighlight {
          0% { background-color: rgb(254 243 199 / 0.8); }
          100% { background-color: transparent; }
        }
        @keyframes countIn {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
      `}</style>

      {/* ------------------------------------------------------------------ */}
      {/* 1. Header                                                          */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
            <svg
              className="w-3.5 h-3.5 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
              />
            </svg>
          </div>
          <div className="leading-none">
            <h1 className="text-[13px] font-bold text-slate-800 tracking-tight">
              Population Health Dashboard
            </h1>
            <p className="text-[11px] text-slate-400 mt-0.5">
              CareCompanion AI
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isLive ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-emerald-400"
                  style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }}
                />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">
                Live
              </span>
            </>
          ) : (
            <>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">
                Monitoring
              </span>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. Summary Stats Bar                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex gap-1.5 px-3 py-2 flex-shrink-0">
        {/* Readings Today */}
        <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-white border border-slate-200">
          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium leading-none">
            Readings Today
          </span>
          <span className="text-[15px] font-bold tabular-nums leading-tight text-slate-800">
            {readingsToday.toLocaleString()}
          </span>
        </div>

        {/* AI-Processed */}
        <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-emerald-50 border border-emerald-200">
          <span className="text-[11px] uppercase tracking-wider font-medium leading-none text-emerald-600">
            AI-Processed
          </span>
          <span className="text-[15px] font-bold tabular-nums leading-tight text-emerald-700">
            {aiProcessed.toLocaleString()}
          </span>
          <span className="text-[10px] text-emerald-500 font-medium leading-none mt-0.5">
            98.6%
          </span>
        </div>

        {/* Needs Review */}
        <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-amber-50 border border-amber-200">
          <span className="text-[11px] uppercase tracking-wider font-medium leading-none text-amber-600">
            Needs Review
          </span>
          <span className="text-[15px] font-bold tabular-nums leading-tight text-amber-700">
            12
          </span>
        </div>

        {/* Urgent */}
        <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-red-50 border border-red-200">
          <span className="text-[11px] uppercase tracking-wider font-medium leading-none text-red-600">
            Urgent
          </span>
          <span
            className="text-[15px] font-bold tabular-nums leading-tight text-red-700"
            style={
              urgentCount > baseUrgent
                ? { animation: "countIn 0.3s ease-out" }
                : undefined
            }
            key={urgentCount}
          >
            {urgentCount}
          </span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Scrollable content area                                            */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {/* ---------------------------------------------------------------- */}
        {/* 3. Patient Risk Grid                                             */}
        {/* ---------------------------------------------------------------- */}
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5 mb-1.5">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#64748b"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Patient Risk Grid
            </span>
            <span className="text-[10px] text-slate-400 ml-auto">
              {PATIENTS.length} active patients
            </span>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[14px_1fr_32px_48px_1fr_1fr_64px] gap-x-1.5 items-center px-1.5 py-1 border-b border-slate-200">
            <span className="text-[10px] font-medium text-slate-400"></span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Patient
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Age
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Risk
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Conditions
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Latest Vital
            </span>
            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider text-right">
              AI Check-in
            </span>
          </div>

          {/* Patient rows */}
          {sortedPatients.map((patient) => {
            const risk = isActive ? patient.riskActive : patient.riskIdle;
            const isMargaret = patient.name === "Margaret Chen";
            const shouldPulse = isMargaret && margaretPulse;

            return (
              <div
                key={patient.name}
                className={`grid grid-cols-[14px_1fr_32px_48px_1fr_1fr_64px] gap-x-1.5 items-center px-1.5 py-[5px] border-b border-slate-100 ${
                  isMargaret && isActive ? "bg-red-50/40" : ""
                }`}
                style={
                  shouldPulse
                    ? { animation: "rowPulse 1.5s ease-in-out 3" }
                    : undefined
                }
              >
                {/* Status dot */}
                <div className="flex items-center justify-center">
                  <span
                    className={`inline-block w-[7px] h-[7px] rounded-full ${riskDotColor(risk)}`}
                  />
                </div>

                {/* Name */}
                <span
                  className={`text-[12px] font-medium truncate ${
                    isMargaret && isActive
                      ? "text-red-700 font-semibold"
                      : "text-slate-700"
                  }`}
                >
                  {patient.name}
                </span>

                {/* Age */}
                <span className="text-[12px] text-slate-500 tabular-nums">
                  {patient.age}
                </span>

                {/* Risk badge */}
                <span
                  className={`inline-flex items-center justify-center text-[11px] font-bold rounded px-1 py-px border tabular-nums ${riskBadgeClasses(risk)}`}
                  key={risk}
                  style={
                    isMargaret && isActive && risk !== patient.riskIdle
                      ? { animation: "countIn 0.4s ease-out" }
                      : undefined
                  }
                >
                  {risk}
                </span>

                {/* Conditions */}
                <span className="text-[11px] text-slate-500 truncate">
                  {patient.conditions}
                </span>

                {/* Latest vital */}
                <span
                  className={`text-[11px] font-medium truncate ${
                    patient.vital.includes("\u2191\u2191")
                      ? "text-red-600"
                      : patient.vital.includes("\u2191")
                        ? "text-amber-600"
                        : patient.vital.includes("\u2713")
                          ? "text-emerald-600"
                          : "text-slate-500"
                  }`}
                >
                  {patient.vital}
                </span>

                {/* Last AI check-in */}
                <span className="text-[10px] text-slate-400 text-right whitespace-nowrap">
                  {isMargaret && isActive ? "Just now" : patient.lastCheckIn}
                </span>
              </div>
            );
          })}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 4. AI Pattern Detection Feed                                     */}
        {/* ---------------------------------------------------------------- */}
        <div className="px-3 pb-2 pt-1">
          <div className="flex items-center gap-1.5 mb-1.5">
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              AI Pattern Detection
            </span>
            {isActive && (
              <span className="relative flex h-1.5 w-1.5 ml-1">
                <span
                  className="absolute inline-flex h-full w-full rounded-full bg-indigo-400"
                  style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }}
                />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {visibleInsights.map((insight, idx) => {
              const isNewActive =
                insight.showOnlyWhenActive && isActive;
              return (
                <div
                  key={insight.id}
                  className={`border-l-[3px] ${insightBorderColor(insight.severity)} rounded-r-md bg-white border border-slate-200 px-2.5 py-2`}
                  style={{
                    animation: insightMounted
                      ? isNewActive
                        ? "fadeSlideIn 0.5s ease-out both, insightHighlight 2s ease-out 0.5s both"
                        : undefined
                      : `fadeSlideIn 0.4s ease-out ${idx * 0.1}s both`,
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider ${insightLabelColor(insight.severity)}`}
                      >
                        {insightLabel(insight.severity)}
                      </span>
                      <p className="text-[12px] text-slate-700 leading-snug mt-0.5">
                        {insight.text}
                      </p>
                    </div>
                    <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0 mt-0.5">
                      {isNewActive ? "Just now" : insight.timestamp}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 5. Billing Capture Summary (footer)                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-3 px-3 py-2 border-t border-slate-200 bg-slate-50 flex-shrink-0">
        <div className="flex items-center gap-1">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          <span className="text-[11px] font-semibold text-emerald-700">
            $14,200/mo
          </span>
          <span className="text-[10px] text-slate-400">
            RPM revenue &middot; 120 patients
          </span>
        </div>
        <div className="w-px h-3 bg-slate-300" />
        <span className="text-[10px] text-amber-600 font-medium">
          8 near 20-min threshold
        </span>
        <div className="w-px h-3 bg-slate-300" />
        <span className="text-[10px] text-slate-500">
          <span className="font-medium">99457:</span> 67 eligible
          <span className="mx-1 text-slate-300">|</span>
          <span className="font-medium">99458:</span> 12 eligible
        </span>
      </div>
    </div>
  );
}
