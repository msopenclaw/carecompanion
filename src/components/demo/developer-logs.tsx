"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useDemo } from "./demo-context";
import type { LogType } from "./demo-context";

// ---------------------------------------------------------------------------
// Badge color mapping
// ---------------------------------------------------------------------------

const BADGE_CONFIG: Record<LogType, { label: string; color: string; bg: string }> = {
  voice: { label: "[VOICE]", color: "text-green-400", bg: "bg-green-400/15" },
  nlp: { label: "[NLP]", color: "text-blue-400", bg: "bg-blue-400/15" },
  rules: { label: "[RULES]", color: "text-yellow-400", bg: "bg-yellow-400/15" },
  alert: { label: "[ALERT]", color: "text-red-400", bg: "bg-red-400/15" },
  billing: { label: "[BILLING]", color: "text-purple-400", bg: "bg-purple-400/15" },
  ehr: { label: "[EHR]", color: "text-cyan-400", bg: "bg-cyan-400/15" },
};

// ---------------------------------------------------------------------------
// Pipeline step mapping (type -> step index)
// ---------------------------------------------------------------------------

const PIPELINE_STEPS = [
  { label: "Voice", type: "voice" as LogType },
  { label: "STT", type: "voice" as LogType },
  { label: "NLP", type: "nlp" as LogType },
  { label: "Rules Engine", type: "rules" as LogType },
  { label: "Alert Gen", type: "alert" as LogType },
  { label: "EHR Draft", type: "ehr" as LogType },
  { label: "Billing", type: "billing" as LogType },
];

// ---------------------------------------------------------------------------
// Format timestamp as HH:MM:SS
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

// ---------------------------------------------------------------------------
// Pipeline Architecture Diagram
// ---------------------------------------------------------------------------

function PipelineDiagram({ activeTypes }: { activeTypes: Set<LogType> }) {
  return (
    <div className="px-4 py-3 border-b border-slate-800">
      <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 font-semibold">
        Pipeline Architecture
      </p>
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {PIPELINE_STEPS.map((step, i) => (
          <div key={step.label} className="flex items-center shrink-0">
            <span
              className={`
                text-[10px] px-2 py-1 rounded font-mono transition-all duration-500
                ${
                  activeTypes.has(step.type)
                    ? "bg-slate-700 text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                    : "bg-slate-900 text-slate-600"
                }
              `}
              style={{
                animation: activeTypes.has(step.type)
                  ? "pipelinePulse 1.5s ease-in-out infinite"
                  : "none",
              }}
            >
              {step.label}
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <svg
                width="16"
                height="10"
                viewBox="0 0 16 10"
                className="shrink-0 mx-0.5"
              >
                <path
                  d="M0 5h12M10 2l4 3-4 3"
                  fill="none"
                  stroke={activeTypes.has(step.type) ? "#6366f1" : "#334155"}
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-colors duration-500"
                />
              </svg>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single log entry row
// ---------------------------------------------------------------------------

function LogRow({
  type,
  message,
  timestamp,
  detail,
  isNew,
}: {
  type: LogType;
  message: string;
  timestamp: Date;
  detail?: string;
  isNew: boolean;
}) {
  const badge = BADGE_CONFIG[type];

  return (
    <div
      className="px-4 py-2 border-b border-slate-800/60 hover:bg-slate-900/50 transition-colors"
      style={{
        animation: isNew ? "logFadeIn 0.4s ease-out" : "none",
      }}
    >
      <div className="flex items-start gap-2">
        <span
          className={`${badge.color} ${badge.bg} text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 mt-px`}
        >
          {badge.label}
        </span>
        <span className="text-slate-500 text-[11px] shrink-0 mt-px font-mono">
          {formatTime(timestamp)}
        </span>
        <span className="text-slate-300 text-[12px] leading-relaxed break-words min-w-0">
          {message}
        </span>
      </div>
      {detail && (
        <p className="text-slate-500 text-[11px] mt-1 ml-[calc(4rem+1.5rem)] leading-snug">
          {detail}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DeveloperLogs component
// ---------------------------------------------------------------------------

export function DeveloperLogs() {
  const { showLogs, toggleLogs, logs } = useDemo();

  // Track which log types have been active recently (for pipeline highlighting)
  const [activeTypes, setActiveTypes] = useState<Set<LogType>>(new Set());
  const timeoutsRef = useRef<Map<LogType, ReturnType<typeof setTimeout>>>(new Map());

  // Track how many logs we've previously seen to animate new ones
  const prevLenRef = useRef(0);
  const [newThreshold, setNewThreshold] = useState(0);

  // Auto-scroll ref
  const scrollRef = useRef<HTMLDivElement>(null);

  // When logs change, update active types with a decay
  useEffect(() => {
    if (logs.length === 0) {
      setActiveTypes(new Set());
      return;
    }
    const latest = logs[logs.length - 1];
    if (!latest) return;

    setActiveTypes((prev) => {
      const next = new Set(prev);
      next.add(latest.type);
      return next;
    });

    // Clear existing timeout for this type
    const existing = timeoutsRef.current.get(latest.type);
    if (existing) clearTimeout(existing);

    // Remove type after 2 seconds
    const t = setTimeout(() => {
      setActiveTypes((prev) => {
        const next = new Set(prev);
        next.delete(latest.type);
        return next;
      });
      timeoutsRef.current.delete(latest.type);
    }, 2000);
    timeoutsRef.current.set(latest.type, t);
  }, [logs.length, logs]);

  // Track new entries for fade-in animation
  useEffect(() => {
    if (logs.length > prevLenRef.current) {
      setNewThreshold(prevLenRef.current);
    }
    prevLenRef.current = logs.length;
  }, [logs.length]);

  // Auto-scroll to bottom
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs.length]);

  // Cleanup timeouts
  useEffect(() => {
    const refs = timeoutsRef.current;
    return () => {
      refs.forEach((t) => clearTimeout(t));
    };
  }, []);

  // Clear handler — we cannot clear the shared context logs, so we track a local offset
  const [clearOffset, setClearOffset] = useState(0);
  const visibleLogs = useMemo(() => logs.slice(clearOffset), [logs, clearOffset]);

  const handleClear = () => {
    setClearOffset(logs.length);
  };

  // Reset offset when logs reset externally (e.g. demo reset)
  useEffect(() => {
    if (logs.length === 0) {
      setClearOffset(0);
    }
  }, [logs.length]);

  return (
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes logFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes pipelinePulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeInBackdrop {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {showLogs && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={toggleLogs}
            style={{ animation: "fadeInBackdrop 0.2s ease-out" }}
          />

          {/* Panel */}
          <div
            className="fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[400px] bg-slate-950 border-l border-slate-800 flex flex-col font-mono shadow-2xl"
            style={{ animation: "slideInRight 0.3s ease-out" }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-indigo-400"
                >
                  <polyline points="4 17 10 11 4 5" />
                  <line x1="12" y1="19" x2="20" y2="19" />
                </svg>
                <div>
                  <h2 className="text-sm font-semibold text-slate-100">
                    Developer Console
                  </h2>
                  <p className="text-[10px] text-slate-500">
                    See what the AI is doing
                  </p>
                </div>
              </div>
              <button
                onClick={toggleLogs}
                className="text-slate-400 hover:text-slate-200 transition-colors p-1 rounded hover:bg-slate-800"
                aria-label="Close developer console"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* Pipeline Diagram */}
            <PipelineDiagram activeTypes={activeTypes} />

            {/* Scrollable log area */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overflow-x-hidden"
            >
              {visibleLogs.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-slate-600 text-xs text-center px-8 leading-relaxed">
                    No events yet. Start the demo to see the AI pipeline in
                    action.
                  </p>
                </div>
              ) : (
                visibleLogs.map((log, i) => (
                  <LogRow
                    key={clearOffset + i}
                    type={log.type}
                    message={log.message}
                    timestamp={log.timestamp}
                    detail={log.detail}
                    isNew={clearOffset + i >= newThreshold}
                  />
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500">
                {visibleLogs.length} event{visibleLogs.length !== 1 ? "s" : ""}{" "}
                processed
              </span>
              <button
                onClick={handleClear}
                disabled={visibleLogs.length === 0}
                className="text-[11px] text-slate-400 hover:text-slate-200 disabled:text-slate-700 disabled:cursor-not-allowed transition-colors px-2 py-1 rounded hover:bg-slate-800 disabled:hover:bg-transparent"
              >
                Clear Logs
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
