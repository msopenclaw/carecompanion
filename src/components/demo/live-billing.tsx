"use client";

import { useState, useEffect, useRef } from "react";
import { useDemo } from "./demo-context";

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useCountUp(target: number, durationMs = 1400, trigger = true): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!trigger) {
      setValue(0);
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs, trigger]);

  return value;
}

// ---------------------------------------------------------------------------
// Format helpers
// ---------------------------------------------------------------------------

function fmtDollar(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

function fmtDuration(minutes: number): string {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// CMS code rate lookup
// ---------------------------------------------------------------------------

const CMS_RATES: Record<string, number> = {
  "99453": 19,
  "99454": 55,
  "99457": 52,
  "99458": 42,
  "99490": 64,
  "99491": 87,
};

// ---------------------------------------------------------------------------
// CMS code table data
// ---------------------------------------------------------------------------

interface CMSCodeRow {
  code: string;
  rate: number;
  description: string;
}

const CMS_TABLE: CMSCodeRow[] = [
  { code: "99453", rate: 19, description: "RPM Setup" },
  { code: "99454", rate: 55, description: "Device Supply (16+ days)" },
  { code: "99457", rate: 52, description: "First 20 min clinical" },
  { code: "99458", rate: 42, description: "Addl 20 min clinical" },
  { code: "99490", rate: 64, description: "CCM first 20 min" },
  { code: "99491", rate: 87, description: "CCM complex 30 min" },
];

// Default initial statuses for codes
const INITIAL_ELIGIBLE = new Set(["99453", "99454"]);

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ComparisonCards({ isActive }: { isActive: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2 px-3 py-2">
      {/* Legacy RPM */}
      <div
        className={`rounded-lg border p-2.5 space-y-1.5 transition-opacity duration-300 ${
          isActive
            ? "border-slate-200 bg-slate-50 opacity-70"
            : "border-slate-200 bg-slate-50 opacity-40"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-1.5 rounded-full bg-slate-400" />
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
            Legacy RPM
          </span>
        </div>
        <div className="space-y-0.5">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Patients</span>
            <span className="text-slate-600 font-semibold tabular-nums">100</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">Nurse time</span>
            <span className="text-slate-600 font-semibold">40 hrs/wk</span>
          </div>
          <div className="border-t border-slate-200 pt-0.5 mt-0.5">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-500 font-medium">Net/month</span>
              <span className="text-slate-700 font-bold tabular-nums">$4,000</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Co-Pilot */}
      <div
        className={`rounded-lg border p-2.5 space-y-1.5 relative overflow-hidden transition-all duration-300 ${
          isActive
            ? "border-blue-200 bg-gradient-to-br from-blue-50 via-white to-blue-50"
            : "border-slate-200 bg-slate-50 opacity-40"
        }`}
        style={
          isActive
            ? {
                boxShadow:
                  "0 0 16px -4px rgba(59, 130, 246, 0.15), 0 0 4px -1px rgba(59, 130, 246, 0.08)",
              }
            : undefined
        }
      >
        {isActive && (
          <div className="absolute -top-6 -right-6 w-20 h-20 rounded-full bg-blue-400/8 blur-xl pointer-events-none" />
        )}
        <div className="flex items-center gap-1.5 relative">
          <div
            className={`h-1.5 w-1.5 rounded-full ${
              isActive ? "bg-blue-500 animate-pulse" : "bg-slate-400"
            }`}
          />
          <span
            className={`text-[9px] font-bold uppercase tracking-wider ${
              isActive ? "text-blue-700" : "text-slate-500"
            }`}
          >
            AI Co-Pilot
          </span>
        </div>
        <div className="space-y-0.5 relative">
          <div className="flex justify-between text-[10px]">
            <span className={isActive ? "text-blue-600" : "text-slate-500"}>
              Patients
            </span>
            <span
              className={`font-semibold tabular-nums ${
                isActive ? "text-blue-800" : "text-slate-600"
              }`}
            >
              1,000
            </span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span className={isActive ? "text-blue-600" : "text-slate-500"}>
              Nurse time
            </span>
            <span
              className={`font-semibold ${
                isActive ? "text-blue-800" : "text-slate-600"
              }`}
            >
              10 hrs/wk
            </span>
          </div>
          <div
            className={`border-t pt-0.5 mt-0.5 ${
              isActive ? "border-blue-100" : "border-slate-200"
            }`}
          >
            <div className="flex justify-between text-[10px]">
              <span
                className={`font-medium ${
                  isActive ? "text-blue-700" : "text-slate-500"
                }`}
              >
                Net/month
              </span>
              <span
                className={`font-bold tabular-nums text-[11px] ${
                  isActive ? "text-blue-800" : "text-slate-700"
                }`}
              >
                $165,000
              </span>
            </div>
          </div>
        </div>
        {isActive && (
          <div className="flex justify-center relative">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-600 px-2 py-0.5 text-[8px] font-bold text-white">
              <svg
                width="8"
                height="8"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.06l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042.815a.75.75 0 01-.53-.919z"
                  clipRule="evenodd"
                />
              </svg>
              41x net revenue
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing event card
// ---------------------------------------------------------------------------

function BillingEventCard({
  event,
  isNew,
}: {
  event: {
    code: string;
    description: string;
    unlocked: boolean;
    timestamp: Date;
  };
  isNew: boolean;
}) {
  const rate = CMS_RATES[event.code] || 0;

  return (
    <div
      className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 transition-all duration-300 ${
        event.unlocked
          ? "border-emerald-200 bg-emerald-50/50"
          : "border-slate-200 bg-white"
      }`}
      style={
        isNew
          ? { animation: "billingSlideIn 0.4s ease-out both" }
          : undefined
      }
    >
      {/* CPT code badge */}
      <span
        className={`inline-flex items-center text-[9px] font-bold font-mono rounded px-1.5 py-0.5 border ${
          event.unlocked
            ? "bg-emerald-100 border-emerald-300 text-emerald-700"
            : "bg-blue-50 border-blue-200 text-blue-700"
        }`}
      >
        {event.code}
      </span>

      {/* Description */}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-700 font-medium truncate">
          {event.description}
        </p>
      </div>

      {/* Dollar amount */}
      <span
        className={`text-[10px] font-bold tabular-nums whitespace-nowrap ${
          event.unlocked ? "text-emerald-600" : "text-slate-400"
        }`}
      >
        {rate > 0 ? fmtDollar(rate) : "---"}
      </span>

      {/* Check or pending */}
      {event.unlocked ? (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#10b981"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="flex-shrink-0"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      ) : (
        <div className="w-3 h-3 rounded-full border-2 border-slate-300 border-t-blue-500 animate-spin flex-shrink-0" />
      )}

      {/* Timestamp */}
      <span className="text-[8px] text-slate-400 whitespace-nowrap flex-shrink-0">
        {event.timestamp.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CMS Code Table
// ---------------------------------------------------------------------------

function CMSCodeTable({
  billingEvents,
  isActive,
}: {
  billingEvents: {
    code: string;
    description: string;
    unlocked: boolean;
    timestamp: Date;
  }[];
  isActive: boolean;
}) {
  const getStatus = (code: string) => {
    const event = billingEvents.find((e) => e.code === code);
    if (event?.unlocked) return "eligible";
    if (event && !event.unlocked) return "in-progress";
    if (INITIAL_ELIGIBLE.has(code) && isActive) return "eligible";
    return "pending";
  };

  const statusConfig = {
    eligible: {
      bg: "bg-emerald-50",
      text: "text-emerald-700",
      border: "border-emerald-200",
      label: "Eligible",
    },
    "in-progress": {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      label: "In Progress",
    },
    pending: {
      bg: "bg-slate-50",
      text: "text-slate-400",
      border: "border-slate-200",
      label: "Pending",
    },
  };

  return (
    <div className="px-3 pb-2">
      <h3 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
        CMS Billing Codes
      </h3>
      <div className="rounded-md border border-slate-200 overflow-hidden">
        <table className="w-full text-[10px]">
          <thead>
            <tr className="bg-slate-50 text-slate-500">
              <th className="text-left py-1 px-2 font-semibold">Code</th>
              <th className="text-right py-1 px-2 font-semibold">Rate</th>
              <th className="text-center py-1 px-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {CMS_TABLE.map((row) => {
              const status = getStatus(row.code);
              const cfg = statusConfig[status];
              return (
                <tr key={row.code} className="hover:bg-slate-50/50">
                  <td className="py-1 px-2">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-slate-800">
                        {row.code}
                      </span>
                      <span className="text-[9px] text-slate-400 hidden sm:inline">
                        {row.description}
                      </span>
                    </div>
                  </td>
                  <td className="py-1 px-2 text-right text-slate-600 font-semibold tabular-nums">
                    {fmtDollar(row.rate)}
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span
                      className={`inline-flex items-center text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text} ${cfg.border}`}
                    >
                      {status === "in-progress" && (
                        <span className="inline-block w-1 h-1 rounded-full bg-amber-500 animate-pulse mr-1" />
                      )}
                      {status === "eligible" && (
                        <svg
                          width="7"
                          height="7"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="mr-0.5"
                        >
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      )}
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveBilling() {
  const { demoPhase, billingMinutes, billingEvents } = useDemo();

  const isActive = demoPhase !== "idle";
  const feedRef = useRef<HTMLDivElement>(null);

  // Track which events we've already "seen" for entrance animation
  const [seenEventCount, setSeenEventCount] = useState(0);

  useEffect(() => {
    if (billingEvents.length > seenEventCount) {
      const timer = setTimeout(
        () => setSeenEventCount(billingEvents.length),
        500
      );
      return () => clearTimeout(timer);
    }
  }, [billingEvents.length, seenEventCount]);

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [billingEvents.length]);

  // Compute session revenue from unlocked events
  const sessionRevenue = billingEvents
    .filter((e) => e.unlocked)
    .reduce((sum, e) => sum + (CMS_RATES[e.code] || 0), 0);

  const animatedRevenue = useCountUp(sessionRevenue, 800, isActive);

  // 99457 progress
  const goalMinutes = 20;
  const pct99457 = Math.min(
    Math.round((billingMinutes / goalMinutes) * 100),
    100
  );

  return (
    <div className="flex flex-col h-full w-full bg-white text-slate-800 font-sans select-none overflow-hidden">
      {/* Keyframes */}
      <style>{`
        @keyframes billingSlideIn {
          0% { opacity: 0; transform: translateY(10px); }
          100% { opacity: 1; transform: translateY(0); }
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
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600">
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
                d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <div className="leading-none">
            <h1 className="text-[11px] font-bold text-slate-800 tracking-tight">
              Revenue & Billing
            </h1>
            <p className="text-[9px] text-slate-400 mt-0.5">
              Live billing simulator
            </p>
          </div>
        </div>
        {isActive && (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wide">
              Live
            </span>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Side-by-side comparison                                            */}
      {/* ------------------------------------------------------------------ */}
      <ComparisonCards isActive={isActive} />

      {/* ------------------------------------------------------------------ */}
      {/* Idle overlay                                                       */}
      {/* ------------------------------------------------------------------ */}
      {demoPhase === "idle" && (
        <div className="flex-1 flex items-center justify-center px-6 relative">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Start demo to see live billing
            </p>
            <p className="text-[9px] text-slate-300 mt-1">
              CPT codes, revenue tracking, and CMS billing
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Active content                                                     */}
      {/* ------------------------------------------------------------------ */}
      {isActive && (
        <>
          {/* Live Billing Feed */}
          <div className="flex-1 min-h-0 flex flex-col border-t border-slate-200">
            {/* Feed header + stats row */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/50 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-1.5">
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  Live Billing Events
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[9px] text-slate-500">
                  Duration:{" "}
                  <span className="font-bold text-slate-700 tabular-nums">
                    {fmtDuration(billingMinutes)}
                  </span>
                </span>
                <span className="text-[9px] text-slate-500">
                  Revenue:{" "}
                  <span className="font-bold text-emerald-600 tabular-nums">
                    {fmtDollar(animatedRevenue)}
                  </span>
                </span>
              </div>
            </div>

            {/* 99457 progress bar */}
            <div className="px-3 py-1.5 flex-shrink-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[9px] text-slate-500 font-medium">
                  99457: {billingMinutes}/{goalMinutes} min
                </span>
                <span className="text-[9px] text-slate-400 font-semibold tabular-nums">
                  {pct99457}%
                </span>
              </div>
              <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-700 ease-out"
                  style={{ width: `${pct99457}%` }}
                />
              </div>
            </div>

            {/* Event feed */}
            <div
              ref={feedRef}
              className="flex-1 overflow-y-auto px-3 py-1.5 space-y-1.5 scrollbar-thin"
            >
              {billingEvents.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-[10px] text-slate-400 italic">
                      Waiting for billing events...
                    </span>
                  </div>
                </div>
              )}

              {billingEvents.map((event, idx) => (
                <BillingEventCard
                  key={`${event.code}-${idx}`}
                  event={event}
                  isNew={idx >= seenEventCount}
                />
              ))}
            </div>
          </div>

          {/* CMS Code Table */}
          <div className="border-t border-slate-200 pt-2 flex-shrink-0">
            <CMSCodeTable
              billingEvents={billingEvents}
              isActive={isActive}
            />
          </div>
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Key insight footer (always visible)                                */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-shrink-0 border-t border-slate-200 bg-blue-50/60 px-3 py-2">
        <div className="flex items-start gap-1.5">
          <svg
            width="12"
            height="12"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="text-blue-600 shrink-0 mt-px"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-[9px] leading-relaxed text-blue-800/80 font-medium">
            AI unlocks scale: 1 nurse + AI = 1,000 patients = $180K+/month
          </p>
        </div>
      </div>
    </div>
  );
}
