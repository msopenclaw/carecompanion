"use client";

import { useDemo } from "./demo-context";

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

interface DayData {
  day: number;
  label: string;
  systolic: number;
  morningMed: boolean;
  eveningMed: boolean | null; // null = today (no evening yet)
}

const TIMELINE_DATA: DayData[] = [
  { day: 1, label: "Mon", systolic: 128, morningMed: true, eveningMed: true },
  { day: 2, label: "Tue", systolic: 131, morningMed: true, eveningMed: true },
  { day: 3, label: "Wed", systolic: 130, morningMed: true, eveningMed: true },
  { day: 4, label: "Thu", systolic: 132, morningMed: true, eveningMed: true },
  { day: 5, label: "Fri", systolic: 142, morningMed: true, eveningMed: false },
  { day: 6, label: "Sat", systolic: 148, morningMed: true, eveningMed: false },
  { day: 7, label: "Sun", systolic: 155, morningMed: false, eveningMed: null },
];

// Chart range constants
const BP_MIN = 110;
const BP_MAX = 170;
const NORMAL_LOW = 120;
const NORMAL_HIGH = 140;

function bpBarPercent(systolic: number): number {
  return ((systolic - BP_MIN) / (BP_MAX - BP_MIN)) * 100;
}

function normalBandBottom(): number {
  return ((NORMAL_LOW - BP_MIN) / (BP_MAX - BP_MIN)) * 100;
}

function normalBandHeight(): number {
  return ((NORMAL_HIGH - NORMAL_LOW) / (BP_MAX - BP_MIN)) * 100;
}

function bpColor(systolic: number): string {
  if (systolic <= 135) return "#22c55e"; // green
  if (systolic <= 143) return "#eab308"; // yellow
  if (systolic <= 150) return "#f59e0b"; // amber
  return "#ef4444"; // red
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConditionBadge({ label, color }: { label: string; color: string }) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    rose: "bg-rose-100 text-rose-700 border-rose-200",
    purple: "bg-purple-100 text-purple-700 border-purple-200",
  };
  return (
    <span
      className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${colorMap[color] ?? colorMap.blue}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// BP Timeline Chart (pure CSS)
// ---------------------------------------------------------------------------

function BPTimeline({ isActive }: { isActive: boolean }) {
  const chartHeight = 120;

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          7-Day Vital Timeline
        </h3>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="inline-block w-2 h-2 rounded-sm bg-green-200 border border-green-300" />
            Normal
          </span>
          <span className="flex items-center gap-1 text-[10px] text-slate-400">
            <span className="inline-block w-2 h-2 rounded-sm bg-red-400" />
            Elevated
          </span>
        </div>
      </div>

      {/* Chart container */}
      <div className="rounded-lg border border-slate-200 bg-white p-2 pb-0">
        {/* Y-axis labels + chart area */}
        <div className="flex gap-1">
          {/* Y-axis */}
          <div
            className="flex flex-col justify-between text-[9px] text-slate-400 font-mono pr-0.5 flex-shrink-0"
            style={{ height: chartHeight }}
          >
            <span>170</span>
            <span>150</span>
            <span>130</span>
            <span>110</span>
          </div>

          {/* Bars area */}
          <div className="flex-1 relative" style={{ height: chartHeight }}>
            {/* Normal range band */}
            <div
              className="absolute left-0 right-0 bg-green-50 border-y border-green-200/50 rounded-sm"
              style={{
                bottom: `${normalBandBottom()}%`,
                height: `${normalBandHeight()}%`,
              }}
            />

            {/* Threshold line at 140 */}
            <div
              className="absolute left-0 right-0 border-t border-dashed border-red-300/60"
              style={{
                bottom: `${((NORMAL_HIGH - BP_MIN) / (BP_MAX - BP_MIN)) * 100}%`,
              }}
            >
              <span className="absolute right-0 -top-3 text-[8px] text-red-400 font-medium">
                140
              </span>
            </div>

            {/* Bar columns */}
            <div className="relative flex items-end justify-between h-full px-1 gap-1">
              {TIMELINE_DATA.map((d) => {
                const pct = bpBarPercent(d.systolic);
                const color = bpColor(d.systolic);
                const isToday = d.day === 7;
                return (
                  <div
                    key={d.day}
                    className="flex-1 flex flex-col items-center justify-end h-full relative"
                  >
                    {/* BP value label */}
                    <span
                      className="text-[9px] font-bold mb-0.5 tabular-nums"
                      style={{ color }}
                    >
                      {d.systolic}
                    </span>
                    {/* Bar */}
                    <div
                      className={`w-full max-w-[20px] rounded-t-sm transition-all duration-500 relative ${isToday && isActive ? "dd-pulse-bar" : ""}`}
                      style={{
                        height: `${pct}%`,
                        backgroundColor: color,
                        opacity: isToday && isActive ? 1 : 0.85,
                      }}
                    >
                      {isToday && (
                        <div
                          className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full border-2 border-white"
                          style={{ backgroundColor: color }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* X-axis day labels */}
        <div className="flex pl-7 pr-1 mt-1 mb-1">
          <div className="flex-1 flex justify-between gap-1 px-1">
            {TIMELINE_DATA.map((d) => (
              <div
                key={d.day}
                className={`flex-1 text-center text-[9px] font-medium ${d.day === 7 ? "text-red-500 font-bold" : "text-slate-400"}`}
              >
                {d.day === 7 ? "Today" : d.label}
              </div>
            ))}
          </div>
        </div>

        {/* Medication adherence row */}
        <div className="border-t border-slate-100 pt-1 pb-1.5 mt-0.5">
          <div className="flex items-center gap-1 pl-1 mb-1">
            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">
              Medication
            </span>
          </div>
          <div className="flex pl-7 pr-1">
            <div className="flex-1 flex justify-between gap-1 px-1">
              {TIMELINE_DATA.map((d) => (
                <div
                  key={d.day}
                  className="flex-1 flex flex-col items-center gap-0.5"
                >
                  {/* Morning dose */}
                  <span
                    className={`text-[10px] leading-none ${d.morningMed ? "text-green-500" : "text-red-500 font-bold"}`}
                    title={
                      d.morningMed ? "AM dose taken" : "AM dose missed"
                    }
                  >
                    {d.morningMed ? "\u2713" : "\u2717"}
                  </span>
                  {/* Evening dose */}
                  {d.eveningMed !== null ? (
                    <span
                      className={`text-[10px] leading-none ${d.eveningMed ? "text-green-500" : "text-red-500 font-bold"}`}
                      title={
                        d.eveningMed ? "PM dose taken" : "PM dose missed"
                      }
                    >
                      {d.eveningMed ? "\u2713" : "\u2717"}
                    </span>
                  ) : (
                    <span
                      className="text-[10px] leading-none text-slate-300"
                      title="PM dose pending"
                    >
                      --
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3 pl-7 mt-1">
            <span className="flex items-center gap-0.5 text-[9px] text-slate-400">
              <span className="text-green-500">{"\u2713"}</span> Taken
            </span>
            <span className="flex items-center gap-0.5 text-[9px] text-slate-400">
              <span className="text-red-500">{"\u2717"}</span> Missed
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AI Clinical Summary Card
// ---------------------------------------------------------------------------

function AIClinicalSummary({ isActive }: { isActive: boolean }) {
  return (
    <div className="px-3 py-1">
      <div
        className={`rounded-lg border-2 p-2.5 transition-all duration-500 ${
          isActive
            ? "border-amber-400 bg-amber-50/40 dd-highlight-pulse"
            : "border-amber-300 bg-amber-50/30"
        }`}
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5">
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              className="text-amber-600"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <h3 className="text-[12px] font-bold text-slate-800">
              AI Clinical Summary
            </h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
              Severity: Elevated
            </span>
            <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
              87% confidence
            </span>
          </div>
        </div>
        <p className="text-[12px] leading-relaxed text-slate-700">
          3-day BP escalation (142{"\u2192"}148{"\u2192"}155 systolic) temporally
          correlated with 2 missed evening lisinopril doses. Weight +1.2 lbs
          over same period suggests early fluid retention. Given CHF history,
          recommend provider review within 48 hours.
        </p>
        <div className="flex items-center gap-1 mt-2 pt-1.5 border-t border-amber-200/60">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748b"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z"
            />
          </svg>
          <span className="text-[10px] text-slate-500 italic">
            Generated by CareCompanion AI
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Historical Pattern Match Card
// ---------------------------------------------------------------------------

function HistoricalPatternMatch() {
  return (
    <div className="px-3 py-1">
      <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6366f1"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h3 className="text-[11px] font-bold text-slate-700">
              Historical Pattern Match
            </h3>
          </div>
          <span className="inline-flex items-center text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            91% similarity
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-600">
          This pattern previously occurred Oct 12{"\u2013"}18, 2024. Resolved
          after medication adherence restored. BP normalized within 5 days.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommended Actions
// ---------------------------------------------------------------------------

interface ActionItem {
  id: number;
  label: string;
  statusIdle: "complete" | "pending";
  statusActive: "complete" | "pending";
  detail: string;
}

const ACTIONS: ActionItem[] = [
  {
    id: 1,
    label: "Medication reminder set for 6 PM",
    statusIdle: "complete",
    statusActive: "complete",
    detail: "Lisinopril 10mg",
  },
  {
    id: 2,
    label: "Flag for Dr. Patel review",
    statusIdle: "pending",
    statusActive: "complete",
    detail: "Priority: elevated",
  },
  {
    id: 3,
    label: "Schedule follow-up BP check in 48 hrs",
    statusIdle: "pending",
    statusActive: "pending",
    detail: "Auto-schedule",
  },
];

function RecommendedActions({ isActive }: { isActive: boolean }) {
  return (
    <div className="px-3 py-1">
      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        Recommended Actions
      </h3>
      <div className="space-y-1">
        {ACTIONS.map((action) => {
          const status = isActive ? action.statusActive : action.statusIdle;
          const isComplete = status === "complete";
          return (
            <div
              key={action.id}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-all duration-300 ${
                isComplete
                  ? "border-green-200 bg-green-50/50"
                  : "border-blue-200 bg-blue-50/30"
              }`}
            >
              {/* Status indicator / button */}
              {isComplete ? (
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-green-500 flex-shrink-0">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </div>
              ) : (
                <div className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-blue-400 bg-white flex-shrink-0 cursor-pointer hover:bg-blue-50 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                </div>
              )}

              {/* Label + detail */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-[12px] font-medium truncate ${isComplete ? "text-slate-600" : "text-slate-800"}`}
                >
                  {action.label}
                </p>
                <p className="text-[10px] text-slate-400">{action.detail}</p>
              </div>

              {/* Status badge */}
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                  isComplete
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-100 text-blue-700"
                }`}
              >
                {isComplete ? "Complete" : "Pending"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing Documentation Footer
// ---------------------------------------------------------------------------

function BillingFooter({
  billingMinutes,
  isActive,
}: {
  billingMinutes: number;
  isActive: boolean;
}) {
  const displayMinutes = isActive ? billingMinutes : 14;
  const minuteStr =
    displayMinutes === 0
      ? "0 min"
      : `${Math.floor(displayMinutes)} min`;

  return (
    <div className="flex-shrink-0 border-t border-slate-200 bg-slate-50/80 px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          Billing Documentation
        </h3>
        <span className="text-[10px] text-slate-400">Auto-generated</span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {/* Time tracked */}
        <div className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748b"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-[11px] text-slate-600">
            Time tracked:{" "}
            <span className="font-bold text-slate-800 tabular-nums">
              {minuteStr}
            </span>
          </span>
        </div>

        {/* Codes suggested */}
        <div className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748b"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
            />
          </svg>
          <span className="text-[11px] text-slate-600">
            <span className="font-mono font-bold text-amber-600">99457</span>
            <span className="text-slate-400 mx-0.5">(In Progress)</span>
            <span className="font-mono font-bold text-green-600">99454</span>
            <span className="text-slate-400 mx-0.5">(Eligible)</span>
          </span>
        </div>

        {/* Clinical note */}
        <div className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="text-[11px] text-slate-600">
            AI-drafted clinical note ready
          </span>
        </div>

        {/* Compliant */}
        <div className="flex items-center gap-1.5">
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#22c55e"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
            />
          </svg>
          <span className="text-[11px] text-slate-600">
            Compliant documentation auto-generated
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveBilling() {
  const { demoPhase, billingMinutes } = useDemo();
  const isActive = demoPhase !== "idle";

  return (
    <div className="flex flex-col h-full w-full bg-white text-slate-800 font-sans select-none overflow-hidden">
      {/* Keyframes */}
      <style>{`
        @keyframes ddHighlightPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(245, 158, 11, 0); }
          50% { box-shadow: 0 0 12px 2px rgba(245, 158, 11, 0.25); }
        }
        @keyframes ddBarPulse {
          0%, 100% { opacity: 0.85; }
          50% { opacity: 1; }
        }
        .dd-highlight-pulse {
          animation: ddHighlightPulse 2s ease-in-out infinite;
        }
        .dd-pulse-bar {
          animation: ddBarPulse 1.5s ease-in-out infinite;
        }
        .scrollbar-thin::-webkit-scrollbar { width: 3px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .scrollbar-thin { scrollbar-width: thin; scrollbar-color: #cbd5e1 transparent; }
      `}</style>

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-600">
            <svg
              className="w-3 h-3 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              />
            </svg>
          </div>
          <div className="leading-none">
            <div className="flex items-center gap-1.5">
              <h1 className="text-[13px] font-bold text-slate-800 tracking-tight">
                Patient Deep Dive
              </h1>
              <span className="text-[11px] text-slate-400 font-medium">
                {"\u2014"} Margaret Chen, 74F
              </span>
            </div>
            <div className="flex items-center gap-1 mt-1">
              <ConditionBadge label="HTN" color="blue" />
              <ConditionBadge label="T2D" color="purple" />
              <ConditionBadge label="CHF" color="rose" />
              <span className="text-[10px] text-slate-400 ml-1">
                Provider: <span className="font-semibold text-slate-600">Dr. Patel</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {isActive ? (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-amber-500" />
              </span>
              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                Attention
              </span>
            </>
          ) : (
            <>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                Stable
              </span>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Scrollable content                                                 */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {/* Multi-Vital Timeline */}
        <BPTimeline isActive={isActive} />

        {/* AI Clinical Summary */}
        <AIClinicalSummary isActive={isActive} />

        {/* Historical Pattern Match */}
        <HistoricalPatternMatch />

        {/* Recommended Actions */}
        <RecommendedActions isActive={isActive} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Billing Documentation Footer                                       */}
      {/* ------------------------------------------------------------------ */}
      <BillingFooter billingMinutes={billingMinutes} isActive={isActive} />
    </div>
  );
}
