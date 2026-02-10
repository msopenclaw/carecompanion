"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useDemo, AI_THINKING_STEPS } from "./demo-context";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StepStatus = "pending" | "active" | "complete";

interface PatientRow {
  name: string;
  age: number;
  risk: number;
  riskDetecting: number;
  conditions: string;
  vital: string;
}

// ---------------------------------------------------------------------------
// Patient data (sorted by risk descending)
// ---------------------------------------------------------------------------

const PATIENTS: PatientRow[] = [
  { name: "Margaret Chen", age: 74, risk: 72, riskDetecting: 84, conditions: "HTN + T2D + CHF", vital: "BP 155/95 \u2191\u2191" },
  { name: "James Rodriguez", age: 68, risk: 58, riskDetecting: 58, conditions: "CHF + HTN", vital: "Wt +2.1 lbs \u2191" },
  { name: "Walter Brooks", age: 83, risk: 51, riskDetecting: 51, conditions: "CHF + COPD", vital: "HR 88 \u2191" },
  { name: "Robert Kim", age: 81, risk: 45, riskDetecting: 45, conditions: "COPD + HTN", vital: "SpO2 93% \u2192" },
  { name: "Helen Murray", age: 77, risk: 38, riskDetecting: 38, conditions: "HTN", vital: "BP 138/88 \u2192" },
  { name: "Aisha Patel", age: 45, risk: 28, riskDetecting: 28, conditions: "HTN", vital: "BP 134/86 \u2192" },
  { name: "Dorothy Harris", age: 70, risk: 22, riskDetecting: 22, conditions: "T2D", vital: "Glucose 112 \u2713" },
  { name: "Sarah Williams", age: 52, risk: 15, riskDetecting: 15, conditions: "T2D", vital: "Glucose 98 \u2713" },
];

// ---------------------------------------------------------------------------
// Helpers
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

function vitalColor(vital: string): string {
  if (vital.includes("\u2191\u2191")) return "text-red-600";
  if (vital.includes("\u2191")) return "text-amber-600";
  if (vital.includes("\u2713")) return "text-emerald-600";
  return "text-slate-500";
}

// ---------------------------------------------------------------------------
// SVG icon components (inline, no deps)
// ---------------------------------------------------------------------------

function IconVitals({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function IconMeds({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 15h3m-5.25-4.5h7.5" />
    </svg>
  );
}

function IconHistory({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconData({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    </svg>
  );
}

function IconPattern({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
    </svg>
  );
}

function IconPlan({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  );
}

function IconPhone({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z" />
    </svg>
  );
}

function IconBrain({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a4 4 0 014 4c0 .74-.2 1.44-.56 2.04A5 5 0 0120 13a5 5 0 01-3 4.58V20a2 2 0 01-2 2h-6a2 2 0 01-2-2v-2.42A5 5 0 014 13a5 5 0 014.56-4.96A4 4 0 018 6a4 4 0 014-4z" />
      <path d="M12 2v20" />
    </svg>
  );
}

function IconSpinner({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M12 2a10 10 0 0110 10" strokeLinecap="round" />
    </svg>
  );
}

function IconCheck({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function stepIcon(icon: string, className: string) {
  switch (icon) {
    case "vitals": return <IconVitals className={className} />;
    case "meds": return <IconMeds className={className} />;
    case "history": return <IconHistory className={className} />;
    case "data": return <IconData className={className} />;
    case "pattern": return <IconPattern className={className} />;
    case "plan": return <IconPlan className={className} />;
    case "call": return <IconPhone className={className} />;
    default: return <IconBrain className={className} />;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Stats bar shown below the patient grid */
function StatsBar() {
  return (
    <div className="flex gap-1.5 px-3 py-2 flex-shrink-0">
      <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-white border border-slate-200">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium leading-none">Readings Today</span>
        <span className="text-[14px] font-bold tabular-nums leading-tight text-slate-800">847</span>
      </div>
      <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-emerald-50 border border-emerald-200">
        <span className="text-[11px] uppercase tracking-wider font-medium leading-none text-emerald-600">AI-Processed</span>
        <span className="text-[14px] font-bold tabular-nums leading-tight text-emerald-700">835</span>
        <span className="text-[10px] text-emerald-500 font-medium leading-none mt-0.5">98.6%</span>
      </div>
      <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-amber-50 border border-amber-200">
        <span className="text-[11px] uppercase tracking-wider font-medium leading-none text-amber-600">Needs Review</span>
        <span className="text-[14px] font-bold tabular-nums leading-tight text-amber-700">12</span>
      </div>
      <div className="flex-1 flex flex-col items-center rounded-md px-2 py-1.5 bg-red-50 border border-red-200">
        <span className="text-[11px] uppercase tracking-wider font-medium leading-none text-red-600">Urgent</span>
        <span className="text-[14px] font-bold tabular-nums leading-tight text-red-700">3</span>
      </div>
    </div>
  );
}

/** Billing capture footer */
function BillingFooter() {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-t border-slate-200 bg-slate-50 flex-shrink-0">
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
      <span className="text-[11px] font-semibold text-emerald-700">$14,200/mo</span>
      <span className="text-[10px] text-slate-400">RPM revenue &middot; 120 patients</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Patient List View (idle + detecting)
// ---------------------------------------------------------------------------

function PatientListView() {
  const { demoPhase, openAnalysis } = useDemo();
  const isDetecting = demoPhase === "detecting";

  const sorted = useMemo(() => {
    return [...PATIENTS].sort((a, b) => {
      const aScore = isDetecting && a.name === "Margaret Chen" ? a.riskDetecting : a.risk;
      const bScore = isDetecting && b.name === "Margaret Chen" ? b.riskDetecting : b.risk;
      return bScore - aScore;
    });
  }, [isDetecting]);

  return (
    <div className="flex flex-col h-full">
      {/* Patient grid */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pb-2">
        <div className="flex items-center gap-1.5 mb-1.5 mt-1">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Patient Risk Grid</span>
          <span className="text-[10px] text-slate-400 ml-auto">{PATIENTS.length} active patients</span>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[16px_1fr_32px_44px_1fr_1fr] gap-x-1.5 items-center px-1.5 py-1 border-b border-slate-200">
          <span />
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Patient</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Age</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Risk</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Conditions</span>
          <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Latest Vital</span>
        </div>

        {/* Patient rows */}
        {sorted.map((patient) => {
          const isMargaret = patient.name === "Margaret Chen";
          const risk = isDetecting && isMargaret ? patient.riskDetecting : patient.risk;
          const showFlag = isDetecting && isMargaret;

          return (
            <div
              key={patient.name}
              className={`grid grid-cols-[16px_1fr_32px_44px_1fr_1fr] gap-x-1.5 items-center px-1.5 py-[5px] border-b border-slate-100 transition-colors ${
                showFlag ? "bg-red-50/60 cursor-pointer hover:bg-red-100/60" : ""
              }`}
              onClick={showFlag ? openAnalysis : undefined}
              role={showFlag ? "button" : undefined}
              tabIndex={showFlag ? 0 : undefined}
            >
              {/* Status dot / flag */}
              <div className="flex items-center justify-center">
                {showFlag ? (
                  <span className="relative flex items-center justify-center" style={{ animation: "flagPulse 1.2s ease-in-out infinite" }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="#ef4444" stroke="#ef4444" strokeWidth="2">
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" y1="22" x2="4" y2="15" stroke="#ef4444" />
                    </svg>
                  </span>
                ) : (
                  <span className={`inline-block w-[7px] h-[7px] rounded-full ${riskDotColor(risk)}`} />
                )}
              </div>

              {/* Name */}
              <div className="flex items-center gap-1 min-w-0">
                <span className={`text-[12px] font-medium truncate ${showFlag ? "text-red-700 font-semibold" : "text-slate-700"}`}>
                  {patient.name}
                </span>
                {showFlag && (
                  <span className="text-[9px] text-red-500 font-medium whitespace-nowrap" style={{ animation: "fadeSlideIn 0.5s ease-out both" }}>
                    Click to investigate
                  </span>
                )}
              </div>

              {/* Age */}
              <span className="text-[12px] text-slate-500 tabular-nums">{patient.age}</span>

              {/* Risk badge */}
              <span
                className={`inline-flex items-center justify-center text-[11px] font-bold rounded px-1 py-px border tabular-nums ${riskBadgeClasses(risk)}`}
                key={`${patient.name}-${risk}`}
                style={showFlag ? { animation: "countIn 0.4s ease-out" } : undefined}
              >
                {risk}
              </span>

              {/* Conditions */}
              <span className="text-[11px] text-slate-500 truncate">{patient.conditions}</span>

              {/* Vital */}
              <span className={`text-[11px] font-medium truncate ${vitalColor(patient.vital)}`}>{patient.vital}</span>
            </div>
          );
        })}
      </div>

      {/* Stats bar */}
      <StatsBar />

      {/* Billing footer */}
      <BillingFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Thinking Feed (analyzing phase) — THE HERO
// ---------------------------------------------------------------------------

function AIThinkingFeed() {
  const { triggerCall, addLog } = useDemo();

  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(() =>
    AI_THINKING_STEPS.map(() => "pending")
  );
  const [decisionVisible, setDecisionVisible] = useState(false);
  const triggeredRef = useRef(false);

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let cumulativeDelay = 400; // initial pause before first step starts

    AI_THINKING_STEPS.forEach((step, idx) => {
      // Start step (pending -> active)
      const startDelay = cumulativeDelay;
      timeouts.push(
        setTimeout(() => {
          setStepStatuses((prev) => {
            const next = [...prev];
            next[idx] = "active";
            return next;
          });
          addLog("rules", `AI Step: ${step.label}`);
        }, startDelay)
      );

      // Complete step (active -> complete)
      cumulativeDelay += step.durationMs;
      const endDelay = cumulativeDelay;
      timeouts.push(
        setTimeout(() => {
          setStepStatuses((prev) => {
            const next = [...prev];
            next[idx] = "complete";
            return next;
          });
        }, endDelay)
      );
    });

    // Show decision card after all steps complete
    const decisionDelay = cumulativeDelay + 500;
    timeouts.push(
      setTimeout(() => {
        setDecisionVisible(true);
      }, decisionDelay)
    );

    // Auto trigger call after decision
    const callDelay = decisionDelay + 1000;
    timeouts.push(
      setTimeout(() => {
        if (!triggeredRef.current) {
          triggeredRef.current = true;
          triggerCall();
        }
      }, callDelay)
    );

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [triggerCall, addLog]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
          <IconBrain className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="leading-none">
          <h2 className="text-[13px] font-bold text-slate-800 tracking-tight">AI Analysis &mdash; Margaret Chen</h2>
          <p className="text-[10px] text-indigo-500 font-medium mt-0.5">Clinical reasoning in progress</p>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400" style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
          </span>
          <span className="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Analyzing</span>
        </div>
      </div>

      {/* Timeline */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-2">
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-[11px] top-2 bottom-2 w-px bg-slate-200" />

          {AI_THINKING_STEPS.map((step, idx) => {
            const status = stepStatuses[idx];

            const dotBg =
              status === "complete"
                ? "bg-emerald-500"
                : status === "active"
                  ? "bg-blue-500"
                  : "bg-slate-300";

            const dotBorder =
              status === "complete"
                ? "border-emerald-200"
                : status === "active"
                  ? "border-blue-200"
                  : "border-slate-200";

            return (
              <div
                key={step.id}
                className="relative pl-8 pb-3"
                style={{
                  animation: status !== "pending" ? `fadeSlideIn 0.35s ease-out ${idx * 0.05}s both` : undefined,
                  opacity: status === "pending" ? 0.45 : 1,
                  transition: "opacity 0.3s ease",
                }}
              >
                {/* Dot */}
                <div
                  className={`absolute left-0 top-[3px] w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center ${dotBg} ${dotBorder}`}
                  style={status === "active" ? { animation: "stepGlow 1.5s ease-in-out infinite" } : undefined}
                >
                  {status === "complete" ? (
                    <IconCheck className="w-3 h-3 text-white" />
                  ) : status === "active" ? (
                    <IconSpinner className="w-3 h-3 text-white" />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-white/60" />
                  )}
                </div>

                {/* Content */}
                <div
                  className={`rounded-lg border px-3 py-2 transition-all duration-300 ${
                    status === "complete"
                      ? "border-emerald-200 bg-emerald-50/50"
                      : status === "active"
                        ? "border-blue-200 bg-blue-50/50"
                        : "border-slate-200 bg-slate-50/50"
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className={`${
                      status === "complete" ? "text-emerald-600" : status === "active" ? "text-blue-600" : "text-slate-400"
                    }`}>
                      {stepIcon(step.icon, "w-3.5 h-3.5")}
                    </span>
                    <span className={`text-[12px] font-semibold ${
                      status === "complete" ? "text-emerald-800" : status === "active" ? "text-blue-800" : "text-slate-500"
                    }`}>
                      {step.label}
                    </span>
                    {status === "active" && (
                      <span className="text-[10px] text-blue-500 font-medium ml-auto">Processing...</span>
                    )}
                    {status === "complete" && (
                      <span className="text-[10px] text-emerald-500 font-medium ml-auto">Done</span>
                    )}
                  </div>

                  {/* Detail text — shown when active or complete */}
                  {(status === "active" || status === "complete") && (
                    <p
                      className={`text-[11px] leading-relaxed mt-1.5 ${
                        status === "complete" ? "text-emerald-700/80" : "text-blue-700/80"
                      }`}
                      style={{ animation: "detailFadeIn 0.4s ease-out both" }}
                    >
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Decision card */}
          {decisionVisible && (
            <div
              className="relative pl-8 pb-2"
              style={{ animation: "decisionSlideIn 0.5s ease-out both" }}
            >
              <div className="absolute left-0 top-[3px] w-[22px] h-[22px] rounded-full border-2 bg-emerald-500 border-emerald-300 flex items-center justify-center">
                <IconCheck className="w-3 h-3 text-white" />
              </div>
              <div className="rounded-lg border-2 border-emerald-400 bg-emerald-50 px-3 py-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-200 rounded px-1.5 py-0.5">Decision</span>
                </div>
                <p className="text-[12px] font-semibold text-emerald-800 leading-snug">
                  Initiating proactive patient outreach call to Margaret Chen
                </p>
                <p className="text-[10px] text-emerald-600 mt-1">
                  All clinical criteria met per Dr. Patel&apos;s standing order. Connecting now...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calling View (calling phase)
// ---------------------------------------------------------------------------

function CallingView() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
      <div className="relative">
        <div
          className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center"
          style={{ animation: "phoneRing 1s ease-in-out infinite" }}
        >
          <IconPhone className="w-7 h-7 text-blue-600" />
        </div>
        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-blue-300" style={{ animation: "phoneWave 1.5s ease-out infinite" }} />
        <div className="absolute inset-0 w-16 h-16 rounded-full border-2 border-blue-200" style={{ animation: "phoneWave 1.5s ease-out 0.3s infinite" }} />
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-slate-800">Initiating voice call</p>
        <p className="text-[12px] text-slate-500 mt-0.5">Margaret Chen &middot; (555) 234-5678</p>
        <p className="text-[11px] text-blue-500 mt-2" style={{ animation: "dotPulse 1.5s ease-in-out infinite" }}>Connecting...</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Transcript View (active phase)
// ---------------------------------------------------------------------------

function TranscriptView() {
  const { transcript } = useDemo();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 flex-shrink-0">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400" style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[13px] font-bold text-slate-800">Live Call</span>
        <span className="text-[11px] text-slate-400">Margaret Chen</span>
        <IconPhone className="w-3.5 h-3.5 text-emerald-500 ml-auto" />
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 py-2 space-y-2">
        {transcript.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[11px] text-slate-400">Waiting for conversation to begin...</p>
          </div>
        )}
        {transcript.map((entry, idx) => {
          const isAI = entry.speaker === "ai";
          return (
            <div
              key={idx}
              className={`flex ${isAI ? "justify-start" : "justify-end"}`}
              style={{ animation: "fadeSlideIn 0.3s ease-out both" }}
            >
              <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 ${
                isAI
                  ? "bg-blue-50 border border-blue-200"
                  : "bg-slate-100 border border-slate-200"
              }`}>
                <div className="flex items-center gap-1 mb-0.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${isAI ? "text-blue-600" : "text-slate-500"}`}>
                    {isAI ? "CareCompanion AI" : "Patient"}
                  </span>
                </div>
                <p className={`text-[12px] leading-snug ${isAI ? "text-blue-900" : "text-slate-700"}`}>
                  {entry.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documenting View (documenting phase)
// ---------------------------------------------------------------------------

function DocumentingView() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setStage(1), 1500));
    timers.push(setTimeout(() => setStage(2), 2500));
    timers.push(setTimeout(() => setStage(3), 3500));
    timers.push(setTimeout(() => setStage(4), 4500));
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="flex flex-col h-full px-3 py-3 space-y-3 overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        </div>
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">Post-Call Documentation</h2>
          <p className="text-[10px] text-slate-400">AI-generated clinical record</p>
        </div>
      </div>

      {/* Initial spinner */}
      {stage < 1 && (
        <div className="flex items-center gap-2 text-[12px] text-slate-500">
          <IconSpinner className="w-4 h-4 text-amber-500" />
          <span>Call completed. Generating clinical documentation...</span>
        </div>
      )}

      {/* Clinical summary */}
      {stage >= 1 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3" style={{ animation: "fadeSlideIn 0.4s ease-out both" }}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">AI-Generated Clinical Summary</h3>
          <div className="text-[11px] text-slate-700 leading-relaxed space-y-1.5">
            <p><strong>Patient:</strong> Margaret Chen, 74F</p>
            <p><strong>Chief Concern:</strong> Hypertension trend detected — BP 155/95 (3-day rising pattern)</p>
            <p><strong>Assessment:</strong> Patient confirmed missing evening Lisinopril 10mg for 2 of last 3 days due to schedule changes. No symptoms of headache, vision changes, or chest pain reported. Patient oriented, cooperative.</p>
            <p><strong>Plan:</strong> Medication reminder set for 6:00 PM daily. Patient verbally committed to adherence. Follow-up BP check in 24 hours. Flagged for Dr. Patel review.</p>
          </div>
        </div>
      )}

      {/* EHR sending */}
      {stage >= 2 && (
        <div className="flex items-center gap-2 text-[12px] text-slate-600" style={{ animation: "fadeSlideIn 0.4s ease-out both" }}>
          <IconSpinner className={`w-4 h-4 text-blue-500 ${stage >= 3 ? "hidden" : ""}`} />
          {stage >= 3 ? <IconCheck className="w-4 h-4 text-emerald-500" /> : null}
          <span>Sending to provider EHR...</span>
        </div>
      )}

      {/* Epic flag */}
      {stage >= 3 && (
        <div className="flex items-center gap-2 text-[12px] text-slate-600" style={{ animation: "fadeSlideIn 0.4s ease-out both" }}>
          <IconCheck className="w-4 h-4 text-emerald-500" />
          <span>Flag created in Epic for Dr. Patel</span>
        </div>
      )}

      {/* Complete */}
      {stage >= 4 && (
        <div
          className="flex items-center gap-2 rounded-lg border-2 border-emerald-300 bg-emerald-50 px-3 py-2.5"
          style={{ animation: "fadeSlideIn 0.4s ease-out both" }}
        >
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
            <IconCheck className="w-3 h-3 text-white" />
          </div>
          <span className="text-[12px] font-semibold text-emerald-800">Workflow complete</span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Complete View (complete phase)
// ---------------------------------------------------------------------------

function CompleteView() {
  return (
    <div className="flex flex-col h-full px-3 py-3 space-y-3 overflow-y-auto scrollbar-thin">
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
          <IconCheck className="w-3.5 h-3.5 text-white" />
        </div>
        <div>
          <h2 className="text-[13px] font-bold text-slate-800">Case Resolved</h2>
          <p className="text-[10px] text-slate-400">Margaret Chen &mdash; Proactive outreach complete</p>
        </div>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 mb-2">Outcome Summary</h3>
        <div className="space-y-1.5 text-[11px] text-slate-700 leading-relaxed">
          <div className="flex items-start gap-2">
            <IconCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>BP trend identified: 132 &rarr; 142 &rarr; 155 mmHg (3-day)</span>
          </div>
          <div className="flex items-start gap-2">
            <IconCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Root cause confirmed: Missed evening Lisinopril (2 of 3 doses)</span>
          </div>
          <div className="flex items-start gap-2">
            <IconCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Proactive AI voice call completed &mdash; patient confirmed, no symptoms</span>
          </div>
          <div className="flex items-start gap-2">
            <IconCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Medication reminder set for 6:00 PM daily</span>
          </div>
          <div className="flex items-start gap-2">
            <IconCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
            <span>Clinical note sent to Epic &mdash; flagged for Dr. Patel review</span>
          </div>
        </div>
      </div>

      {/* Timing */}
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">Automation Metrics</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-[14px] font-bold text-blue-600 tabular-nums">7</p>
            <p className="text-[10px] text-slate-400">AI Analysis Steps</p>
          </div>
          <div>
            <p className="text-[14px] font-bold text-emerald-600 tabular-nums">~14s</p>
            <p className="text-[10px] text-slate-400">Detection to Call</p>
          </div>
          <div>
            <p className="text-[14px] font-bold text-amber-600 tabular-nums">0</p>
            <p className="text-[10px] text-slate-400">Staff Time Required</p>
          </div>
        </div>
      </div>

      <BillingFooter />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function LiveTriage() {
  const { demoPhase } = useDemo();

  const showPatientList = demoPhase === "idle" || demoPhase === "detecting";

  return (
    <div className="flex flex-col h-full w-full bg-white text-slate-800 font-sans select-none overflow-hidden">
      {/* Keyframes */}
      <style>{`
        @keyframes fadeSlideIn {
          0% { opacity: 0; transform: translateY(8px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes livePing {
          0% { transform: scale(1); opacity: 1; }
          75% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        @keyframes countIn {
          0% { opacity: 0; transform: scale(0.8); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes flagPulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.25); opacity: 0.7; }
        }
        @keyframes stepGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(59,130,246,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(59,130,246,0); }
        }
        @keyframes detailFadeIn {
          0% { opacity: 0; max-height: 0; margin-top: 0; }
          100% { opacity: 1; max-height: 200px; margin-top: 6px; }
        }
        @keyframes decisionSlideIn {
          0% { opacity: 0; transform: translateY(12px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes phoneRing {
          0%, 100% { transform: rotate(0deg); }
          10% { transform: rotate(12deg); }
          20% { transform: rotate(-12deg); }
          30% { transform: rotate(8deg); }
          40% { transform: rotate(-8deg); }
          50% { transform: rotate(0deg); }
        }
        @keyframes phoneWave {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes dotPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
      `}</style>

      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <div className="leading-none">
            <h1 className="text-[13px] font-bold text-slate-800 tracking-tight">Clinical Intelligence</h1>
            <p className="text-[11px] text-slate-400 mt-0.5">CareCompanion AI</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {demoPhase === "active" ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400" style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">Live</span>
            </>
          ) : demoPhase === "analyzing" ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-indigo-400" style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500" />
              </span>
              <span className="text-[11px] text-indigo-600 font-semibold uppercase tracking-wide">Analyzing</span>
            </>
          ) : demoPhase === "calling" ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-blue-400" style={{ animation: "livePing 1.5s cubic-bezier(0,0,0.2,1) infinite" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
              <span className="text-[11px] text-blue-600 font-semibold uppercase tracking-wide">Calling</span>
            </>
          ) : demoPhase === "complete" ? (
            <>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">Complete</span>
            </>
          ) : (
            <>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              <span className="text-[11px] text-emerald-600 font-semibold uppercase tracking-wide">Monitoring</span>
            </>
          )}
        </div>
      </div>

      {/* Dynamic content area */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {showPatientList && <PatientListView />}
        {demoPhase === "analyzing" && <AIThinkingFeed />}
        {demoPhase === "calling" && <CallingView />}
        {demoPhase === "active" && <TranscriptView />}
        {demoPhase === "documenting" && <DocumentingView />}
        {demoPhase === "complete" && <CompleteView />}
      </div>
    </div>
  );
}
