"use client";

import { useState, useEffect, useRef } from "react";
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
  }, [target, durationMs]);

  return value;
}

// ---------------------------------------------------------------------------
// Relative-time formatter
// ---------------------------------------------------------------------------

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

// ---------------------------------------------------------------------------
// Static "already resolved" alerts for history feel
// ---------------------------------------------------------------------------

const RESOLVED_ALERTS = [
  {
    id: "hist-1",
    severity: "elevated" as const,
    title: "Heart rate irregular, 98 bpm",
    patientName: "James Rodriguez",
    timestamp: new Date(Date.now() - 45 * 60_000),
    status: "resolved" as const,
    note: "Resolved by Dr. Patel",
  },
  {
    id: "hist-2",
    severity: "informational" as const,
    title: "Missed evening medication dose",
    patientName: "Dorothy Harris",
    timestamp: new Date(Date.now() - 2 * 3600_000),
    status: "resolved" as const,
    note: "Patient confirmed adherence",
  },
  {
    id: "hist-3",
    severity: "elevated" as const,
    title: "Weight gain +2 lbs in 3 days",
    patientName: "Robert Kim",
    timestamp: new Date(Date.now() - 4 * 3600_000),
    status: "resolved" as const,
    note: "Dietary counseling completed",
  },
  {
    id: "hist-4",
    severity: "informational" as const,
    title: "SpO2 reading 91% - single occurrence",
    patientName: "Helen Murray",
    timestamp: new Date(Date.now() - 6 * 3600_000),
    status: "resolved" as const,
    note: "Subsequent readings normal",
  },
];

// ---------------------------------------------------------------------------
// Stats bar
// ---------------------------------------------------------------------------

function StatsBar({
  isActive,
  flaggedCount,
  escalatedCount,
}: {
  isActive: boolean;
  flaggedCount: number;
  escalatedCount: number;
}) {
  const monitored = useCountUp(isActive ? 1247 : 0, 1400);
  const aiHandled = useCountUp(isActive ? 1180 : 0, 1600);

  return (
    <div className="flex gap-1.5 px-3 py-2">
      {/* Monitored */}
      <div
        className={`flex-1 flex flex-col items-center rounded-md px-2 py-1.5 ${
          isActive ? "bg-white border border-slate-200" : "bg-slate-50 border border-slate-100"
        }`}
      >
        <span className="text-[9px] uppercase tracking-wider text-slate-400 font-medium leading-none">
          Monitored
        </span>
        <span
          className={`text-sm font-bold tabular-nums leading-tight ${
            isActive ? "text-slate-800" : "text-slate-300"
          }`}
        >
          {isActive ? monitored.toLocaleString() : "0"}
        </span>
      </div>

      {/* AI-handled */}
      <div
        className={`flex-1 flex flex-col items-center rounded-md px-2 py-1.5 ${
          isActive
            ? "bg-emerald-50 border border-emerald-200"
            : "bg-slate-50 border border-slate-100"
        }`}
      >
        <span
          className={`text-[9px] uppercase tracking-wider font-medium leading-none ${
            isActive ? "text-emerald-600" : "text-slate-400"
          }`}
        >
          AI-Handled
        </span>
        <span
          className={`text-sm font-bold tabular-nums leading-tight ${
            isActive ? "text-emerald-700" : "text-slate-300"
          }`}
        >
          {isActive ? aiHandled.toLocaleString() : "0"}
        </span>
      </div>

      {/* Flagged */}
      <div
        className={`flex-1 flex flex-col items-center rounded-md px-2 py-1.5 ${
          isActive && flaggedCount > 0
            ? "bg-amber-50 border border-amber-200"
            : "bg-slate-50 border border-slate-100"
        }`}
      >
        <span
          className={`text-[9px] uppercase tracking-wider font-medium leading-none ${
            isActive && flaggedCount > 0 ? "text-amber-600" : "text-slate-400"
          }`}
        >
          Flagged
        </span>
        <span
          className={`text-sm font-bold tabular-nums leading-tight ${
            isActive && flaggedCount > 0 ? "text-amber-700" : "text-slate-300"
          }`}
        >
          {isActive ? flaggedCount : "0"}
        </span>
      </div>

      {/* Escalated */}
      <div
        className={`flex-1 flex flex-col items-center rounded-md px-2 py-1.5 ${
          isActive && escalatedCount > 0
            ? "bg-red-50 border border-red-200"
            : "bg-slate-50 border border-slate-100"
        }`}
      >
        <span
          className={`text-[9px] uppercase tracking-wider font-medium leading-none ${
            isActive && escalatedCount > 0 ? "text-red-600" : "text-slate-400"
          }`}
        >
          Escalated
        </span>
        <span
          className={`text-sm font-bold tabular-nums leading-tight ${
            isActive && escalatedCount > 0 ? "text-red-700" : "text-slate-300"
          }`}
        >
          {isActive ? escalatedCount : "0"}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Severity badge
// ---------------------------------------------------------------------------

function SeverityBadge({ severity }: { severity: "critical" | "elevated" | "informational" }) {
  const config = {
    critical: {
      bg: "bg-red-100 border-red-300 text-red-700",
      label: "Critical",
    },
    elevated: {
      bg: "bg-amber-100 border-amber-300 text-amber-700",
      label: "Elevated",
    },
    informational: {
      bg: "bg-slate-100 border-slate-300 text-slate-600",
      label: "Info",
    },
  };
  const c = config[severity];
  return (
    <span
      className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${c.bg}`}
    >
      {c.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Alert card
// ---------------------------------------------------------------------------

function AlertCard({
  alert,
  isNew,
  isResolved,
}: {
  alert: {
    id: string;
    severity: "critical" | "elevated" | "informational";
    title: string;
    patientName: string;
    timestamp: Date;
    status: string;
    note?: string;
  };
  isNew: boolean;
  isResolved?: boolean;
}) {
  const borderColor =
    alert.severity === "critical"
      ? "border-l-red-500"
      : alert.severity === "elevated"
        ? "border-l-amber-400"
        : "border-l-slate-300";

  return (
    <div
      className={`border-l-[3px] ${borderColor} rounded-r-md bg-white border border-slate-200 px-2.5 py-2 ${
        isResolved ? "opacity-45" : ""
      }`}
      style={
        isNew
          ? {
              animation: "alertSlideIn 0.4s ease-out both",
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <SeverityBadge severity={alert.severity} />
            {isResolved && (
              <span className="text-[9px] font-medium text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1 py-px">
                Resolved
              </span>
            )}
          </div>
          <p className="text-[11px] font-semibold text-slate-800 leading-tight">
            {alert.patientName}
          </p>
          <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
            {alert.title}
          </p>
          {isResolved && alert.note && (
            <p className="text-[9px] text-slate-400 italic mt-0.5">{alert.note}</p>
          )}
        </div>
        <span className="text-[9px] text-slate-400 whitespace-nowrap flex-shrink-0">
          {timeAgo(alert.timestamp)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat bubble for transcript
// ---------------------------------------------------------------------------

function ChatBubble({
  speaker,
  text,
  isNew,
}: {
  speaker: "ai" | "patient";
  text: string;
  isNew: boolean;
}) {
  const isAi = speaker === "ai";
  return (
    <div
      className={`flex ${isAi ? "justify-start" : "justify-end"}`}
      style={
        isNew
          ? { animation: "alertSlideIn 0.35s ease-out both" }
          : undefined
      }
    >
      <div
        className={`max-w-[88%] rounded-lg px-2.5 py-1.5 text-[10px] leading-[1.5] ${
          isAi
            ? "bg-blue-50 border border-blue-200 text-slate-700 rounded-tl-sm"
            : "bg-slate-100 border border-slate-200 text-slate-700 rounded-tr-sm"
        }`}
      >
        <span
          className={`block text-[8px] font-bold uppercase tracking-widest mb-0.5 ${
            isAi ? "text-blue-500" : "text-slate-400"
          }`}
        >
          {isAi ? "CareCompanion AI" : "Patient"}
        </span>
        {text}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing predictor widget
// ---------------------------------------------------------------------------

function BillingWidget({
  billingMinutes,
  billingEvents,
  isActive,
}: {
  billingMinutes: number;
  billingEvents: {
    code: string;
    description: string;
    unlocked: boolean;
    timestamp: Date;
  }[];
  isActive: boolean;
}) {
  const goalMinutes = 20;
  const pct = isActive ? Math.min(Math.round((billingMinutes / goalMinutes) * 100), 100) : 0;
  const remaining = Math.max(goalMinutes - billingMinutes, 0);

  const cpt99457 = billingEvents.find((e) => e.code === "99457");

  return (
    <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">
          Billing Predictor
        </span>
        <span className="text-[9px] font-medium text-slate-400">
          CPT 99457 ($52)
        </span>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 mb-1">
        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] font-bold text-slate-700 tabular-nums whitespace-nowrap">
          {isActive ? billingMinutes : 0}/{goalMinutes} min
        </span>
      </div>

      {/* CPT codes row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {billingEvents.map((evt) => (
          <span
            key={evt.code}
            className={`inline-flex items-center gap-0.5 text-[9px] font-medium rounded px-1.5 py-0.5 border transition-all duration-300 ${
              evt.unlocked
                ? "bg-emerald-50 border-emerald-300 text-emerald-700"
                : "bg-slate-50 border-slate-200 text-slate-400"
            }`}
          >
            {evt.unlocked && (
              <svg
                width="8"
                height="8"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
            {evt.code}
          </span>
        ))}
        {!isActive && (
          <span className="text-[9px] text-slate-400 italic">
            Start demo to track billing
          </span>
        )}
      </div>

      {isActive && remaining > 0 && (
        <p className="text-[9px] text-slate-500 mt-1">
          <span className="text-amber-600 font-semibold">{remaining} more min</span> to
          unlock CPT 99457{" "}
          <span className="text-emerald-600 font-semibold">($52)</span>
        </p>
      )}
      {isActive && cpt99457?.unlocked && (
        <p className="text-[9px] text-emerald-600 font-semibold mt-1">
          CPT 99457 unlocked - $52 billable
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function LiveTriage() {
  const { demoPhase, transcript, alerts, billingMinutes, billingEvents, logs } =
    useDemo();

  const isActive = demoPhase !== "idle";
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const alertFeedRef = useRef<HTMLDivElement>(null);

  // Track which transcript/alert IDs are "new" for entrance animation
  const [seenTranscriptCount, setSeenTranscriptCount] = useState(0);
  const [seenAlertIds, setSeenAlertIds] = useState<Set<string>>(new Set());

  // Detect new entries for animation tracking
  useEffect(() => {
    if (transcript.length > seenTranscriptCount) {
      const timer = setTimeout(
        () => setSeenTranscriptCount(transcript.length),
        500
      );
      return () => clearTimeout(timer);
    }
  }, [transcript.length, seenTranscriptCount]);

  useEffect(() => {
    if (alerts.length > seenAlertIds.size) {
      const timer = setTimeout(() => {
        setSeenAlertIds(new Set(alerts.map((a) => a.id)));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [alerts, seenAlertIds.size]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcript.length]);

  // Count alerts by type
  const flaggedCount = alerts.filter(
    (a) => a.severity === "elevated" || a.severity === "informational"
  ).length;
  const escalatedCount = alerts.filter(
    (a) => a.severity === "critical"
  ).length;

  // Check for EHR log entry for "drafting note" animation
  const hasEhrLog = logs.some(
    (l) =>
      typeof l === "object" &&
      l !== null &&
      ("type" in l ? (l as { type?: string }).type === "ehr" : false)
  );
  const showDraftingNote =
    isActive &&
    !hasEhrLog &&
    transcript.length >= 3 &&
    demoPhase !== "complete";
  const showDraftedNote = demoPhase === "complete" || hasEhrLog;

  return (
    <div className="flex flex-col h-full w-full bg-white text-slate-800 font-sans select-none overflow-hidden">
      {/* Keyframes */}
      <style>{`
        @keyframes alertSlideIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes notePulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
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
          <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-blue-500 to-indigo-600">
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
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <div className="leading-none">
            <h1 className="text-[11px] font-bold text-slate-800 tracking-tight">
              Clinician Triage Dashboard
            </h1>
            <p className="text-[9px] text-slate-400 mt-0.5">CareCompanion AI</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isActive && (
            <>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
              </span>
              <span className="text-[9px] text-emerald-600 font-semibold uppercase tracking-wide">
                Live
              </span>
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Stats bar                                                          */}
      {/* ------------------------------------------------------------------ */}
      <StatsBar
        isActive={isActive}
        flaggedCount={flaggedCount}
        escalatedCount={escalatedCount}
      />

      {/* ------------------------------------------------------------------ */}
      {/* Idle state                                                         */}
      {/* ------------------------------------------------------------------ */}
      {demoPhase === "idle" && (
        <div className="flex-1 flex items-center justify-center px-6">
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
                <path d="M22 16.92V19a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3 4.18 2 2 0 0 1 5 2h2.09a2 2 0 0 1 2 1.72c.13.81.37 1.61.68 2.36a2 2 0 0 1-.45 2.11L8.09 9.41a16 16 0 0 0 6.5 6.5l1.22-1.22a2 2 0 0 1 2.11-.45c.75.31 1.55.55 2.36.68A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">
              Start the demo to see real-time clinical triage
            </p>
            <p className="text-[9px] text-slate-300 mt-1">
              Alerts, transcripts, and billing will appear here
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Active content: Two-column layout                                  */}
      {/* ------------------------------------------------------------------ */}
      {isActive && (
        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* LEFT COLUMN (60%): Alert feed */}
          <div
            ref={alertFeedRef}
            className="w-[60%] border-r border-slate-200 overflow-y-auto px-2.5 py-2 space-y-1.5 scrollbar-thin"
          >
            <div className="flex items-center gap-1 mb-1">
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Patient Alerts
              </span>
              {alerts.length > 0 && (
                <span className="text-[9px] font-bold text-red-500 bg-red-50 rounded-full px-1.5 py-px border border-red-200">
                  {alerts.length}
                </span>
              )}
            </div>

            {/* Live alerts */}
            {alerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isNew={!seenAlertIds.has(alert.id)}
              />
            ))}

            {/* Connecting state placeholder */}
            {demoPhase === "connecting" && alerts.length === 0 && (
              <div className="flex items-center gap-2 py-4 justify-center">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                <span className="text-[10px] text-slate-400">
                  Connecting to patient monitoring...
                </span>
              </div>
            )}

            {/* Divider before history */}
            {alerts.length > 0 && (
              <div className="flex items-center gap-2 py-1.5">
                <div className="flex-1 border-t border-slate-200" />
                <span className="text-[8px] uppercase tracking-wider text-slate-400 font-medium">
                  Earlier
                </span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
            )}

            {/* Static resolved alerts */}
            {RESOLVED_ALERTS.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                isNew={false}
                isResolved
              />
            ))}
          </div>

          {/* RIGHT COLUMN (40%): Transcript monitor */}
          <div className="w-[40%] flex flex-col overflow-hidden">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-slate-200 flex-shrink-0">
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
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                Live AI Transcript
              </span>
              {transcript.length > 0 && (
                <span className="relative flex h-1.5 w-1.5 ml-auto">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1.5 scrollbar-thin">
              {transcript.length === 0 && (
                <div className="flex items-center justify-center h-full">
                  <span className="text-[9px] text-slate-300 italic">
                    Waiting for conversation...
                  </span>
                </div>
              )}

              {transcript.map((entry, idx) => (
                <ChatBubble
                  key={idx}
                  speaker={entry.speaker}
                  text={entry.text}
                  isNew={idx >= seenTranscriptCount}
                />
              ))}

              {/* Drafting clinical note animation */}
              {showDraftingNote && (
                <div
                  className="flex items-center gap-1.5 px-2 py-1.5 mt-1"
                  style={{ animation: "notePulse 1.5s ease-in-out infinite" }}
                >
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="inline-block w-1 h-1 rounded-full bg-blue-400"
                        style={{
                          animation: `notePulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                        }}
                      />
                    ))}
                  </div>
                  <span className="text-[9px] text-blue-500 font-medium italic">
                    Drafting clinical note...
                  </span>
                </div>
              )}

              {/* Drafted note card */}
              {showDraftedNote && (
                <div
                  className="mt-2 rounded-md border border-blue-200 bg-blue-50/50 px-2.5 py-2"
                  style={{ animation: "alertSlideIn 0.5s ease-out both" }}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <svg
                      width="9"
                      height="9"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600">
                      AI-Drafted Clinical Note
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-600 leading-relaxed">
                    Patient reports missed evening Lisinopril dose. BP elevated at
                    155/95 mmHg (baseline 130/85). AI confirmed non-adherence via
                    voice check-in. Reminder set for 6 PM evening dose. Flagged
                    for Dr. Patel review. Follow-up BP check in 2 hours.
                  </p>
                  <div className="flex items-center gap-1 mt-1.5">
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    <span className="text-[8px] text-emerald-600 font-medium">
                      Ready for EHR submission
                    </span>
                  </div>
                </div>
              )}

              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Billing predictor                                                  */}
      {/* ------------------------------------------------------------------ */}
      <BillingWidget
        billingMinutes={billingMinutes}
        billingEvents={billingEvents}
        isActive={isActive}
      />
    </div>
  );
}
