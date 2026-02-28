"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineEvent {
  step: string;
  status: string;
  timestamp: string;
  [key: string]: unknown;
}

export interface Dimension {
  name: string;
  score: number;
  feedback: string;
}

export interface PipelineRun {
  startedAt: string;
  events: PipelineEvent[];
}

export interface PipelineData {
  pipelineLog: PipelineEvent[];
  pipelineRuns: PipelineRun[];
  firstCallPrep: Record<string, unknown> | null;
  compactedAt: string | null;
  hasTier1: boolean;
  hasTier2: boolean;
  hasTier3: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STEP_LABELS: Record<string, string> = {
  pipeline_start: "Pipeline Started",
  load_context: "Load Patient Context",
  agents_init: "Initialize Agents",
  ehr_compaction: "EHR Analysis & Compaction",
  ehr_data_scan: "EHR Data Sources Scan",
  ehr_adherence: "Medication Adherence",
  ehr_gemini_analysis: "Gemini EHR Analysis",
  first_call_prep: "First Call Preparation",
  script_generation: "Script Generation (Gemini)",
  judge_evaluation: "Script Judge (Claude Sonnet 4.6)",
  script_accepted: "Script Accepted",
  revision_requested: "Revision Requested",
  fallback_used: "Fallback Script Used",
  trigger_generation: "Trigger Sequence Generation",
  outbound_call: "Outbound Call",
  patient_nudge: "Patient Nudge (In-App)",
  pipeline_complete: "Pipeline Complete",
};

const STEP_ICON_KEYS: Record<string, string> = {
  pipeline_start: "rocket",
  load_context: "database",
  agents_init: "cpu",
  ehr_compaction: "file-text",
  ehr_data_scan: "search",
  ehr_adherence: "check-circle",
  ehr_gemini_analysis: "brain",
  first_call_prep: "phone",
  script_generation: "edit",
  judge_evaluation: "check-circle",
  script_accepted: "award",
  revision_requested: "rotate-ccw",
  fallback_used: "alert-triangle",
  trigger_generation: "bell",
  outbound_call: "phone-outgoing",
  patient_nudge: "bell",
  pipeline_complete: "check",
};

const ICON_PATHS: Record<string, string> = {
  rocket: "M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.841m2.699-2.077a6 6 0 0 1 .88-4.764",
  database: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  cpu: "M9 3v2m6-2v2M9 19v2m6-2v2M3 9h2m-2 6h2m14-6h2m-2 6h2M7 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2zM9 9h6v6H9V9z",
  "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  search: "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
  brain: "M12 2a7 7 0 0 0-7 7c0 3.5 2.5 6.5 6 7v6h2v-6c3.5-.5 6-3.5 6-7a7 7 0 0 0-7-7z",
  phone: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  edit: "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
  "check-circle": "M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3",
  award: "M12 15l-3.09 1.636.59-3.434L7 10.786l3.45-.502L12 7l1.55 3.284 3.45.502-2.49 2.416.59 3.434z M8.21 13.89L7 23l5-3 5 3-1.21-9.12",
  "rotate-ccw": "M1 4v6h6 M3.51 15a9 9 0 1 0 2.13-9.36L1 10",
  "alert-triangle": "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01",
  bell: "M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0",
  "phone-outgoing": "M23 1l-6 6 M17 1h6v6 M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z",
  check: "M20 6L9 17l-5-5",
};

// ---------------------------------------------------------------------------
// StepIcon
// ---------------------------------------------------------------------------

export function StepIcon({ step, status }: { step: string; status: string }) {
  const color =
    status === "completed" ? "text-green-600 bg-green-50 border-green-200" :
    status === "running" ? "text-blue-600 bg-blue-50 border-blue-200" :
    status === "error" ? "text-red-600 bg-red-50 border-red-200" :
    status === "started" ? "text-violet-600 bg-violet-50 border-violet-200" :
    "text-slate-400 bg-slate-50 border-slate-200";

  const iconKey = STEP_ICON_KEYS[step] || "check";
  const path = ICON_PATHS[iconKey] || ICON_PATHS["check"];

  return (
    <div className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${color}`}>
      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d={path} />
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreBar
// ---------------------------------------------------------------------------

export function ScoreBar({ score, label, maxScore }: { score: number; label: string; maxScore?: number }) {
  const max = maxScore || (score <= 5 ? 5 : 100);
  const pct = Math.round((score / max) * 100);
  const color =
    pct >= 90 ? "bg-green-500" :
    pct >= 70 ? "bg-amber-500" :
    "bg-red-500";

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-36 truncate">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2">
        <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono font-medium w-8 text-right">{score}/{max}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThinkingBlock — renders model internal reasoning
// ---------------------------------------------------------------------------

function ThinkingBlock({ label, thinking, color }: { label: string; thinking: string; color: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = thinking.length > 200 ? thinking.substring(0, 200) + "..." : thinking;

  return (
    <div className={`border rounded-lg overflow-hidden ${color}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left px-3 py-2 flex items-center justify-between text-xs font-medium"
      >
        <span>{label}</span>
        <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="px-3 pb-3">
        <pre className="text-xs whitespace-pre-wrap font-mono leading-relaxed opacity-80">
          {expanded ? thinking : preview}
        </pre>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PipelineStep
// ---------------------------------------------------------------------------

/** Type-safe truthy check — returns boolean, not unknown */
function has(val: unknown): val is string | number | boolean | object {
  return val != null && val !== "" && val !== false;
}

export function PipelineStep({ event, isLast, defaultExpanded = false }: { event: PipelineEvent; isLast: boolean; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const label = STEP_LABELS[event.step] || event.step;
  const ts = new Date(event.timestamp);
  const timeStr = ts.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const hasDimensions: boolean = !!(event.dimensions && Array.isArray(event.dimensions) && (event.dimensions as Dimension[]).length > 0);
  const hasDetail = !!(
    event.detail || event.error || event.openingScript || event.scriptPreview ||
    event.hookAnchor || event.reason || hasDimensions || event.geminiThinking ||
    event.claudeThinking || event.insights || event.careGaps || event.tier1Summary ||
    event.healthRecordsCount !== undefined || event.adherenceRate !== undefined ||
    event.fullDimensionFeedback || event.finalScript || event.compactedContextPreview
  );

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <StepIcon step={event.step} status={event.status} />
        {!isLast && <div className="w-px flex-1 bg-slate-200 my-1" />}
      </div>

      <div className={`flex-1 pb-4`}>
        <div
          className={`flex items-center gap-2 ${hasDetail ? "cursor-pointer" : ""}`}
          onClick={() => hasDetail && setExpanded(!expanded)}
        >
          <span className="text-sm font-medium text-slate-900">{label}</span>
          {event.iteration != null && (
            <span className="text-xs bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
              Iter {String(event.iteration)}
            </span>
          )}
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            event.status === "completed" ? "bg-green-100 text-green-700" :
            event.status === "running" ? "bg-blue-100 text-blue-700" :
            event.status === "error" ? "bg-red-100 text-red-700" :
            "bg-violet-100 text-violet-700"
          }`}>
            {event.status}
          </span>
          {event.totalScore !== undefined && (
            <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
              (event.totalScore as number) >= 90 ? "bg-green-100 text-green-700" :
              (event.totalScore as number) >= 70 ? "bg-amber-100 text-amber-700" :
              "bg-red-100 text-red-700"
            }`}>
              {event.totalScore as number}/100
            </span>
          )}
          {event.score !== undefined && event.step === "script_accepted" && (
            <span className="text-xs font-mono font-bold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              {event.score as number}/100
            </span>
          )}
          {event.durationMs !== undefined && (
            <span className="text-xs text-slate-400">
              {((event.durationMs as number) / 1000).toFixed(1)}s
            </span>
          )}
          <span className="text-xs text-slate-400 ml-auto">{timeStr}</span>
          {hasDetail && (
            <svg className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          )}
        </div>

        {expanded && hasDetail && (
          <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs space-y-3 border border-slate-100">
            {/* Basic fields */}
            {has(event.detail) && <div className="text-slate-600">{event.detail as string}</div>}
            {has(event.error) && <div className="text-red-600 font-medium">{event.error as string}</div>}
            {has(event.patientName) && <div><span className="font-medium text-slate-700">Patient:</span> {event.patientName as string}</div>}
            {has(event.currentFocus) && <div><span className="font-medium text-slate-700">Focus:</span> {event.currentFocus as string}</div>}
            {has(event.hookAnchor) && <div><span className="font-medium text-slate-700">Hook Anchor:</span> <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{event.hookAnchor as string}</span></div>}

            {/* Data scan counts */}
            {event.healthRecordsCount !== undefined && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="bg-white p-2 rounded border border-slate-200 text-center">
                  <div className="font-mono font-bold text-lg text-slate-900">{String(event.healthRecordsCount)}</div>
                  <div className="text-slate-500">Health Records</div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200 text-center">
                  <div className="font-mono font-bold text-lg text-slate-900">{String(event.vitalsCount)}</div>
                  <div className="text-slate-500">Vitals</div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200 text-center">
                  <div className="font-mono font-bold text-lg text-slate-900">{String(event.medicationsCount)}</div>
                  <div className="text-slate-500">Medications</div>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200 text-center">
                  <div className="font-mono font-bold text-lg text-slate-900">{String(event.medicationLogsCount)}</div>
                  <div className="text-slate-500">Med Logs</div>
                </div>
              </div>
            )}

            {/* Profile summary */}
            {has(event.profileSummary) && (
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="font-medium text-slate-700">Profile:</span> {(event.profileSummary as Record<string, unknown>).name as string} | GLP-1: {(event.profileSummary as Record<string, unknown>).glp1 as string}
              </div>
            )}

            {/* Adherence */}
            {event.adherenceRate !== undefined && event.step === "ehr_adherence" && (
              <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-slate-500">Rate:</span> <span className="font-mono font-bold text-green-700">{String(event.adherenceRate)}%</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-slate-500">Taken:</span> <span className="font-mono">{String(event.takenCount)}/{String(event.totalLogs)}</span>
                </div>
                <div className="bg-white p-2 rounded border border-slate-200">
                  <span className="text-slate-500">Missed:</span> <span className="font-mono text-red-600">{String(event.missedCount)}</span>
                </div>
              </div>
            )}

            {/* Insights */}
            {Array.isArray(event.insights) && (event.insights as string[]).length > 0 && (
              <div>
                <span className="font-medium text-slate-700">Insights:</span>
                <ul className="list-disc list-inside mt-1 space-y-1 text-slate-600">
                  {(event.insights as string[]).map((ins, i) => <li key={i}>{ins}</li>)}
                </ul>
              </div>
            )}

            {/* Care gaps */}
            {Array.isArray(event.careGaps) && (event.careGaps as Array<Record<string, unknown>>).length > 0 && (
              <div>
                <span className="font-medium text-slate-700">Care Gaps:</span>
                <div className="space-y-1 mt-1">
                  {(event.careGaps as Array<Record<string, unknown>>).map((gap, i) => (
                    <div key={i} className={`flex items-center gap-2 px-2 py-1 rounded ${
                      gap.urgency === "high" ? "bg-red-50 text-red-700" :
                      gap.urgency === "medium" ? "bg-amber-50 text-amber-700" :
                      "bg-green-50 text-green-700"
                    }`}>
                      <span className="font-medium uppercase">[{gap.urgency as string}]</span>
                      <span>{gap.description as string}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tier summaries */}
            {has(event.tier1Summary) && (
              <div>
                <span className="font-medium text-slate-700">Tier 1 (Constitutional):</span>
                <div className="mt-1 bg-white p-2 rounded border border-slate-200 space-y-1">
                  {Array.isArray((event.tier1Summary as Record<string, unknown>).conditions) && (
                    <div>Conditions: {((event.tier1Summary as Record<string, unknown>).conditions as Array<Record<string, string>>).map(c => `${c.name} [${c.trust}]`).join(", ")}</div>
                  )}
                  <div>Allergies: {String((event.tier1Summary as Record<string, unknown>).allergies)} | Family History: {String((event.tier1Summary as Record<string, unknown>).familyHistory)}</div>
                </div>
              </div>
            )}
            {has(event.tier2Summary) && (
              <div>
                <span className="font-medium text-slate-700">Tier 2 (Strategic):</span>
                <div className="mt-1 bg-white p-2 rounded border border-slate-200 space-y-1">
                  {Array.isArray((event.tier2Summary as Record<string, unknown>).activeMedications) && (
                    <div>Medications: {((event.tier2Summary as Record<string, unknown>).activeMedications as string[]).join(", ")}</div>
                  )}
                  {Array.isArray((event.tier2Summary as Record<string, unknown>).riskFactors) && (
                    <div>Risks: {((event.tier2Summary as Record<string, unknown>).riskFactors as string[]).join(", ")}</div>
                  )}
                  {Array.isArray((event.tier2Summary as Record<string, unknown>).treatmentGoals) && (
                    <div>Goals: {((event.tier2Summary as Record<string, unknown>).treatmentGoals as string[]).join(", ")}</div>
                  )}
                </div>
              </div>
            )}

            {/* Compacted context preview */}
            {has(event.compactedContextPreview) && (
              <div>
                <span className="font-medium text-slate-700">Compacted Memory Preview:</span>
                <pre className="mt-1 bg-white p-2 rounded border border-slate-200 text-xs whitespace-pre-wrap font-mono">{event.compactedContextPreview as string}</pre>
              </div>
            )}

            {/* Full opening script */}
            {has(event.openingScript) && (
              <div>
                <span className="font-medium text-slate-700">Opening Script:</span>
                <p className="mt-1 bg-white p-3 rounded border border-violet-200 italic text-slate-800 leading-relaxed bg-gradient-to-br from-violet-50 to-blue-50">
                  &ldquo;{event.openingScript as string}&rdquo;
                </p>
              </div>
            )}

            {/* Final accepted script */}
            {has(event.finalScript) && (
              <div>
                <span className="font-medium text-green-700">Final Accepted Script:</span>
                <p className="mt-1 bg-gradient-to-br from-green-50 to-emerald-50 p-3 rounded border border-green-200 italic text-slate-800 leading-relaxed">
                  &ldquo;{event.finalScript as string}&rdquo;
                </p>
              </div>
            )}

            {/* Talking points & follow-up */}
            {has(event.followUpQuestion) &&<div><span className="font-medium text-slate-700">Follow-up:</span> {event.followUpQuestion as string}</div>}
            {Array.isArray(event.talkingPoints) && (
              <div>
                <span className="font-medium text-slate-700">Talking Points:</span>
                <ul className="list-disc list-inside mt-1 text-slate-600">
                  {(event.talkingPoints as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(event.finalTalkingPoints) && (
              <div>
                <span className="font-medium text-slate-700">Talking Points:</span>
                <ul className="list-disc list-inside mt-1 text-slate-600">
                  {(event.finalTalkingPoints as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
                </ul>
              </div>
            )}

            {/* Gemini thinking */}
            {has(event.geminiThinking) && (
              <ThinkingBlock
                label="Gemini Internal Reasoning"
                thinking={event.geminiThinking as string}
                color="border-blue-200 bg-blue-50/50"
              />
            )}

            {/* Claude thinking */}
            {has(event.claudeThinking) && (
              <ThinkingBlock
                label="Claude Internal Reasoning"
                thinking={event.claudeThinking as string}
                color="border-amber-200 bg-amber-50/50"
              />
            )}

            {/* Agent info */}
            {has(event.generator) && (
              <div className="flex gap-4">
                <div><span className="font-medium text-slate-700">Generator:</span> <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">{event.generator as string}</span></div>
                <div><span className="font-medium text-slate-700">Judge:</span> <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">{(event.judge as string) || "none"}</span></div>
              </div>
            )}

            {/* Revision details */}
            {has(event.reason) &&<div><span className="font-medium text-slate-700">Reason:</span> {event.reason as string}</div>}
            {has(event.mode) &&<div><span className="font-medium text-slate-700">Mode:</span> {event.mode as string}</div>}

            {/* Weak dimensions */}
            {Array.isArray(event.weakDimensions) && (event.weakDimensions as string[]).length > 0 && (
              <div>
                <span className="font-medium text-slate-700">Weak Dimensions:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(event.weakDimensions as string[]).map((d, i) => (
                    <span key={i} className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded text-xs">{d}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Full dimension feedback (revision) */}
            {has(event.fullDimensionFeedback) && (
              <div className="bg-amber-50 p-3 rounded border border-amber-100">
                <span className="font-medium text-amber-800">Revision Instructions to Gemini:</span>
                <pre className="mt-1 text-amber-700 whitespace-pre-wrap font-mono leading-relaxed">{event.fullDimensionFeedback as string}</pre>
              </div>
            )}

            {/* Rubric Dimensions */}
            {hasDimensions && (
              <div className="space-y-1.5 mt-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-700">Hook Opener Rubric:</span>
                  {event.totalScore !== undefined && (
                    <span className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${
                      (event.totalScore as number) >= 36 ? "bg-green-100 text-green-700" :
                      (event.totalScore as number) >= 28 ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {event.totalScore as number}/{event.maxScore as number || 40}
                    </span>
                  )}
                </div>
                {(event.dimensions as Dimension[]).map((d, i) => (
                  <ScoreBar key={i} score={d.score} label={d.name} maxScore={d.score <= 5 ? 5 : 100} />
                ))}
                {(event.dimensions as Dimension[]).some(d => d.feedback) && (
                  <div className="mt-2 space-y-1.5">
                    {(event.dimensions as Dimension[]).map((d, i) => (
                      <div key={i} className="text-slate-500">
                        <span className={`font-medium ${d.score < (d.score <= 5 ? 4 : 80) ? "text-red-600" : "text-slate-700"}`}>{d.name} ({d.score}/{d.score <= 5 ? 5 : 100}):</span> {d.feedback}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Quality Checks */}
            {Array.isArray(event.qualityChecks) && (event.qualityChecks as Array<Record<string, unknown>>).length > 0 && (
              <div>
                <span className="font-medium text-slate-700">Quality Checks:</span>
                <div className="mt-1 space-y-1">
                  {(event.qualityChecks as Array<Record<string, unknown>>).map((check, i) => (
                    <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded ${
                      check.passed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
                    }`}>
                      <span className="flex-shrink-0 mt-0.5">{check.passed ? "\u2713" : "\u2717"}</span>
                      <span>
                        <span className="font-medium">{check.check as string}</span>
                        {has(check.detail) && <span className="ml-1 opacity-80">— {check.detail as string}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failure Modes Detected */}
            {Array.isArray(event.failureModes) && (event.failureModes as string[]).length > 0 && (
              <div className="bg-red-50 p-2 rounded border border-red-100">
                <span className="font-medium text-red-800">Failure Modes Detected:</span>
                <ul className="mt-1 space-y-0.5 text-red-700 list-disc list-inside">
                  {(event.failureModes as string[]).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}
            {Array.isArray(event.failureModesDetected) && (event.failureModesDetected as string[]).length > 0 && (
              <div className="bg-red-50 p-2 rounded border border-red-100">
                <span className="font-medium text-red-800">Failure Modes Detected:</span>
                <ul className="mt-1 space-y-0.5 text-red-700 list-disc list-inside">
                  {(event.failureModesDetected as string[]).map((f, i) => <li key={i}>{f}</li>)}
                </ul>
              </div>
            )}

            {/* Judge Reasoning Summary */}
            {has(event.judgeReasoning) && (
              <div className="bg-slate-100 p-2 rounded border border-slate-200">
                <span className="font-medium text-slate-700">Judge Reasoning:</span>
                <p className="mt-1 text-slate-600">{event.judgeReasoning as string}</p>
              </div>
            )}

            {/* Overall feedback */}
            {has(event.overallFeedback) && (
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="font-medium text-slate-700">Judge Feedback:</span>
                <p className="mt-1 text-slate-600">{event.overallFeedback as string}</p>
              </div>
            )}
            {has(event.specificImprovements) && event.specificImprovements !== "N/A" && (
              <div className="bg-amber-50 p-2 rounded border border-amber-100">
                <span className="font-medium text-amber-800">Improvements Needed:</span>
                <p className="mt-1 text-amber-700">{event.specificImprovements as string}</p>
              </div>
            )}

            {/* Data summary */}
            {has(event.dataSummary) && (
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="font-medium text-slate-700">Data sent to Gemini:</span>
                <pre className="mt-1 text-slate-600 whitespace-pre-wrap font-mono">{JSON.stringify(event.dataSummary, null, 2)}</pre>
              </div>
            )}

            {/* Pipeline summary */}
            {has(event.summary) && (
              <div className="bg-white p-2 rounded border border-slate-200">
                <span className="font-medium text-slate-700">Summary:</span>
                <pre className="mt-1 text-slate-600 whitespace-pre-wrap font-mono">{JSON.stringify(event.summary, null, 2)}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
