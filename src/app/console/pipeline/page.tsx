"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useConsole } from "../console-context";
import {
  PipelineStep,
  ScoreBar,
  STEP_LABELS,
  type PipelineData,
  type PipelineEvent,
  type Dimension,
} from "@/components/console/pipeline-components";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("console_token") || ""
    : "";
}

function formatRunDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + " at " + d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getRunDuration(events: PipelineEvent[]): string | null {
  if (events.length < 2) return null;
  const first = new Date(events[0].timestamp).getTime();
  const last = new Date(events[events.length - 1].timestamp).getTime();
  const secs = Math.round((last - first) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function isRunComplete(events: PipelineEvent[]): boolean {
  return events.some(e => e.step === "pipeline_complete");
}

export default function PipelineTabPage() {
  const { selectedPatientId, selectedPatient } = useConsole();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [expandedRuns, setExpandedRuns] = useState<Set<number>>(new Set());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const prevEventCount = useRef(0);

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchPipeline = useCallback(() => {
    if (!selectedPatientId) return;
    fetch(`${RAILWAY_URL}/api/console/patients/${selectedPatientId}/pipeline`, { headers })
      .then((r) => r.json())
      .then((data: PipelineData) => {
        setPipeline(data);
        const runs = data.pipelineRuns || [];
        // Always keep latest run expanded during auto-refresh
        if (runs.length > 0) {
          setExpandedRuns(prev => {
            const next = new Set(prev);
            next.add(runs.length - 1);
            return next;
          });
        }
        const latestRun = runs[runs.length - 1];
        if (latestRun && isRunComplete(latestRun.events) && autoRefresh) {
          setAutoRefresh(false);
          setRunningPipeline(false);
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId, autoRefresh]);

  // Initial load — also auto-start polling if a run is already in progress
  useEffect(() => {
    if (!selectedPatientId) { setPipeline(null); return; }
    setLoading(true);
    fetch(`${RAILWAY_URL}/api/console/patients/${selectedPatientId}/pipeline`, { headers })
      .then((r) => r.json())
      .then((data: PipelineData) => {
        setPipeline(data);
        const runs = data.pipelineRuns || [];
        if (runs.length > 0) {
          setExpandedRuns(new Set([runs.length - 1]));
          // Auto-start polling if latest run is still in progress (triggered externally e.g. from iOS app)
          const latestRun = runs[runs.length - 1];
          if (latestRun && !isRunComplete(latestRun.events)) {
            setAutoRefresh(true);
            setRunningPipeline(true);
          }
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  // Active polling (2s) when a run is in progress
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchPipeline, 2000);
      return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
    }
  }, [autoRefresh, fetchPipeline]);

  // Background polling (10s) to detect externally-triggered runs (e.g. from iOS "Call Me")
  useEffect(() => {
    if (autoRefresh || !selectedPatientId) return; // skip if already actively polling
    const bgInterval = setInterval(() => {
      fetch(`${RAILWAY_URL}/api/console/patients/${selectedPatientId}/pipeline`, { headers })
        .then((r) => r.json())
        .then((data: PipelineData) => {
          const runs = data.pipelineRuns || [];
          const latestRun = runs[runs.length - 1];
          if (latestRun && !isRunComplete(latestRun.events)) {
            // A run is in progress — switch to active polling
            setPipeline(data);
            setExpandedRuns(new Set([runs.length - 1]));
            setAutoRefresh(true);
            setRunningPipeline(true);
          } else if (runs.length > (pipeline?.pipelineRuns?.length || 0)) {
            // New completed run appeared — update display
            setPipeline(data);
            setExpandedRuns(new Set([runs.length - 1]));
          }
        })
        .catch(() => {});
    }, 10000);
    return () => clearInterval(bgInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, selectedPatientId, pipeline?.pipelineRuns?.length]);

  // Auto-scroll when new events arrive during active run
  useEffect(() => {
    const runs = pipeline?.pipelineRuns || [];
    const latestRun = runs[runs.length - 1];
    const currentCount = latestRun?.events?.length || 0;
    if (autoRefresh && currentCount > prevEventCount.current && timelineEndRef.current) {
      timelineEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    prevEventCount.current = currentCount;
  }, [pipeline, autoRefresh]);

  const runPipeline = async () => {
    if (!selectedPatientId) return;
    setRunningPipeline(true);
    setAutoRefresh(true);

    // Pre-expand the next run slot
    const currentRunCount = pipeline?.pipelineRuns?.length || 0;
    setExpandedRuns(new Set([currentRunCount]));
    prevEventCount.current = 0;

    try {
      await fetch(`${RAILWAY_URL}/api/console/patients/${selectedPatientId}/run-pipeline`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      // Don't set runningPipeline false here — it clears when pipeline_complete detected
    } catch (e) {
      console.error("Run pipeline error:", e);
      setRunningPipeline(false);
      setAutoRefresh(false);
    }
  };

  const toggleRun = (idx: number) => {
    setExpandedRuns(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  if (!selectedPatientId) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">&#x26A1;</div>
          <h2 className="text-lg font-semibold text-slate-700">Select a Patient</h2>
          <p className="text-sm text-slate-400 mt-1">Choose a patient from the sidebar to view their engagement pipeline</p>
        </div>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading pipeline...</div>;

  // Find the last "running" event to show live status
  const allCurrentEvents = (pipeline?.pipelineRuns || []).at(-1)?.events || pipeline?.pipelineLog || [];
  const lastRunningEvent = [...allCurrentEvents].reverse().find(e => e.status === "running");

  const runs = pipeline?.pipelineRuns || [];
  const firstCallPrep = pipeline?.firstCallPrep;
  const patientName = selectedPatient?.profile
    ? `${selectedPatient.profile.firstName} ${selectedPatient.profile.lastName}`
    : "Patient";

  // Fall back to flat pipelineLog if no runs exist (legacy data)
  const legacyLog = pipeline?.pipelineLog || [];
  const hasRuns = runs.length > 0;
  const latestRun = hasRuns ? runs[runs.length - 1] : null;
  const latestEvents = latestRun?.events || legacyLog;

  // Group events by iteration for negotiation view (from latest run)
  const iterations: Map<number, PipelineEvent[]> = new Map();
  for (const event of latestEvents) {
    if (event.iteration != null) {
      const iter = event.iteration as number;
      if (!iterations.has(iter)) iterations.set(iter, []);
      iterations.get(iter)!.push(event);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-900">Engagement Pipeline</h1>
          <span className="text-sm text-slate-400">{patientName}</span>
        </div>

        <div className="flex items-center gap-3">
          {firstCallPrep && (
            <span className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${
              (firstCallPrep.judge_score as number) >= 36 ? "bg-green-100 text-green-700" :
              (firstCallPrep.judge_score as number) >= 28 ? "bg-amber-100 text-amber-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              Score: {firstCallPrep.judge_score as number}/{firstCallPrep.judge_score_max as number || 40}
              {firstCallPrep.judge_score_percentage != null && (
                <span className="ml-1 opacity-70">({firstCallPrep.judge_score_percentage as number}%)</span>
              )}
            </span>
          )}
          {firstCallPrep && (
            <span className="text-sm text-slate-500">
              {firstCallPrep.iterations as number} iteration{(firstCallPrep.iterations as number) !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <button
          onClick={runPipeline}
          disabled={runningPipeline}
          className={`relative text-sm text-white px-5 py-2.5 rounded-lg font-medium transition-all ${
            runningPipeline
              ? "bg-violet-500 cursor-not-allowed"
              : "bg-violet-600 hover:bg-violet-700 hover:shadow-md active:scale-[0.98]"
          }`}
        >
          {runningPipeline && (
            <span className="absolute inset-0 rounded-lg overflow-hidden">
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </span>
          )}
          <span className="relative flex items-center gap-2">
            {runningPipeline && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
              </svg>
            )}
            {runningPipeline ? "Pipeline Running..." : "Run Pipeline"}
          </span>
        </button>

        {!runningPipeline && (
          <button onClick={fetchPipeline}
            className="text-sm text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-50 transition-colors">
            Refresh
          </button>
        )}

        {autoRefresh && (
          <span className="flex items-center gap-1.5 text-xs text-violet-600 bg-violet-50 px-3 py-1.5 rounded-full border border-violet-200">
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            Live
          </span>
        )}

        {runs.length > 0 && (
          <span className="text-xs text-slate-400 ml-auto">
            {runs.length} run{runs.length !== 1 ? "s" : ""} total
          </span>
        )}
      </div>

      {/* Live Status Line */}
      {autoRefresh && lastRunningEvent && (
        <LiveStatusLine event={lastRunningEvent} />
      )}

      {/* Pipeline Runs */}
      {!hasRuns && legacyLog.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <div className="text-3xl mb-3 opacity-20">&#x26A1;</div>
          <p className="text-slate-500 text-sm">No pipeline has been run for this patient yet.</p>
          <p className="text-slate-400 text-xs mt-1">Click &ldquo;Run Pipeline&rdquo; above to start the engagement pipeline.</p>
        </div>
      ) : hasRuns ? (
        <div className="space-y-3">
          {runs.map((run, idx) => {
            const isExpanded = expandedRuns.has(idx);
            const isLatest = idx === runs.length - 1;
            const complete = isRunComplete(run.events);
            const duration = getRunDuration(run.events);
            const eventCount = run.events.length;

            return (
              <div key={idx} className={`bg-white rounded-xl shadow-sm border overflow-hidden transition-colors ${
                isLatest && autoRefresh ? "border-violet-300 ring-1 ring-violet-100" : "border-slate-200"
              }`}>
                {/* Run header — always visible */}
                <button
                  onClick={() => toggleRun(idx)}
                  className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 transition-colors text-left"
                >
                  <svg className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
                    viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6" />
                  </svg>

                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                      !complete && isLatest && autoRefresh ? "bg-violet-500 animate-pulse" :
                      complete ? "bg-green-500" : "bg-slate-300"
                    }`} />
                    <span className="text-sm font-semibold text-slate-900">
                      Run #{idx + 1}
                    </span>
                    <span className="text-xs text-slate-500">
                      {formatRunDate(run.startedAt)}
                    </span>
                    {isLatest && (
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                        Latest
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {duration && (
                      <span className="text-xs text-slate-400 font-mono">{duration}</span>
                    )}
                    <span className="text-xs text-slate-400">{eventCount} events</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                      !complete && isLatest && autoRefresh
                        ? "bg-violet-100 text-violet-700"
                        : complete
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-100 text-slate-600"
                    }`}>
                      {!complete && isLatest && autoRefresh ? "Running" : complete ? "Complete" : "Incomplete"}
                    </span>
                  </div>
                </button>

                {/* Expanded run events */}
                {isExpanded && (
                  <div className="border-t border-slate-100 px-5 py-4">
                    <div className="space-y-0">
                      {run.events.map((event, i) => (
                        <PipelineStep key={i} event={event} isLast={i === run.events.length - 1} defaultExpanded={isLatest} />
                      ))}
                    </div>
                    {isLatest && autoRefresh && (
                      <div ref={timelineEndRef} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* Legacy flat log (no runs array) */
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Pipeline Timeline (Legacy)</h2>
          <div className="space-y-0">
            {legacyLog.map((event, i) => (
              <PipelineStep key={i} event={event} isLast={i === legacyLog.length - 1} defaultExpanded={true} />
            ))}
          </div>
        </div>
      )}

      {/* Agent Negotiation View */}
      {iterations.size > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Agent Negotiation</h2>
          <p className="text-xs text-slate-500 mb-4">
            Gemini 3.1 Pro (script generator) and Claude Sonnet 4.6 (judge) negotiate to produce the best call script.
          </p>

          <div className="space-y-6">
            {Array.from(iterations.entries()).map(([iter, events]) => {
              // Find completed events (not running) so we get the actual data
              const genEvent = events.find(e => e.step === "script_generation" && e.status === "completed");
              const judgeEvent = events.find(e => e.step === "judge_evaluation" && e.status === "completed");
              const revisionEvent = events.find(e => e.step === "revision_requested");
              const acceptedEvent = events.find(e => e.step === "script_accepted");

              return (
                <div key={iter} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Iteration {iter}</span>
                    {acceptedEvent && <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">ACCEPTED</span>}
                    {revisionEvent && !acceptedEvent && <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">REVISION REQUESTED</span>}
                  </div>

                  <div className="grid grid-cols-2 divide-x divide-slate-200">
                    {/* Left: Gemini */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                        </div>
                        <span className="text-xs font-semibold text-blue-700">Gemini 3.1 Pro (Generator)</span>
                        {genEvent?.durationMs != null && (
                          <span className="text-xs text-slate-400 ml-auto">{((genEvent.durationMs as number) / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                      {!!genEvent?.geminiThinking && (
                        <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                          <div className="text-xs font-medium text-blue-700 mb-1">Internal Reasoning:</div>
                          <pre className="text-xs whitespace-pre-wrap font-mono text-blue-800/70 leading-relaxed max-h-48 overflow-y-auto">{genEvent.geminiThinking as string}</pre>
                        </div>
                      )}
                      {!!genEvent?.openingScript && (
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-200">
                          <div className="text-xs font-medium text-blue-700 mb-1">Generated Script:</div>
                          <p className="text-sm italic text-slate-800 leading-relaxed">&ldquo;{genEvent.openingScript as string}&rdquo;</p>
                        </div>
                      )}
                      {!!genEvent?.hookAnchor && (
                        <div className="text-xs"><span className="font-medium text-slate-700">Anchor:</span> <span className="bg-violet-50 text-violet-700 px-1 py-0.5 rounded">{genEvent.hookAnchor as string}</span></div>
                      )}
                      {!!genEvent?.followUpQuestion && (
                        <div className="text-xs"><span className="font-medium text-slate-700">Follow-up:</span> {genEvent.followUpQuestion as string}</div>
                      )}
                      {Array.isArray(genEvent?.talkingPoints) && (
                        <div className="text-xs">
                          <span className="font-medium text-slate-700">Talking Points:</span>
                          <ul className="list-disc list-inside mt-1 text-slate-600 space-y-0.5">
                            {(genEvent!.talkingPoints as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Right: Claude */}
                    <div className="p-4 space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                          <svg className="w-3.5 h-3.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3" /></svg>
                        </div>
                        <span className="text-xs font-semibold text-amber-700">Claude Sonnet 4.6 (Judge)</span>
                        {judgeEvent?.durationMs != null && (
                          <span className="text-xs text-slate-400 ml-auto">{((judgeEvent.durationMs as number) / 1000).toFixed(1)}s</span>
                        )}
                      </div>
                      {!!judgeEvent?.claudeThinking && (
                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-100">
                          <div className="text-xs font-medium text-amber-700 mb-1">Internal Reasoning:</div>
                          <pre className="text-xs whitespace-pre-wrap font-mono text-amber-800/70 leading-relaxed max-h-48 overflow-y-auto">{judgeEvent.claudeThinking as string}</pre>
                        </div>
                      )}
                      {judgeEvent && (
                        <div className="space-y-2">
                          {(() => {
                            const score = judgeEvent.totalScore as number;
                            const max = (judgeEvent.maxScore as number) || 40;
                            const pct = score != null ? Math.round((score / max) * 100) : null;
                            const passed = score != null && score >= 36;
                            const colorClass = passed ? "text-green-600" : score != null && score >= 28 ? "text-amber-600" : "text-red-600";
                            const bgClass = passed ? "bg-green-50 border-green-200" : score != null && score >= 28 ? "bg-amber-50 border-amber-200" : "bg-red-50 border-red-200";
                            return score != null ? (
                              <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${bgClass}`}>
                                <span className={`text-2xl font-mono font-bold ${colorClass}`}>{score}</span>
                                <div>
                                  <div className="text-xs text-slate-500">out of {max}{pct != null && <span className="ml-1 font-semibold">({pct}%)</span>}</div>
                                  <div className="text-[10px] text-slate-400">threshold: 36/40 (90%)</div>
                                </div>
                                {passed && <span className="ml-auto text-xs font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded">PASS</span>}
                                {!passed && <span className="ml-auto text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">FAIL</span>}
                              </div>
                            ) : null;
                          })()}
                          {Array.isArray(judgeEvent.dimensions) && (
                            <div className="space-y-1">
                              {(judgeEvent.dimensions as Dimension[]).map((d, i) => (
                                <ScoreBar key={i} score={d.score} label={d.name} maxScore={d.score <= 5 ? 5 : 100} />
                              ))}
                            </div>
                          )}
                          {/* Quality Checks in negotiation view */}
                          {Array.isArray(judgeEvent.qualityChecks) && (
                            <div className="mt-2 space-y-0.5">
                              <div className="text-xs font-medium text-slate-700 mb-1">Quality Checks:</div>
                              {(judgeEvent.qualityChecks as Array<Record<string, unknown>>).map((check, i) => (
                                <div key={i} className={`text-xs flex items-center gap-1.5 ${
                                  check.passed ? "text-green-600" : "text-red-600"
                                }`}>
                                  <span>{check.passed ? "\u2713" : "\u2717"}</span>
                                  <span>{check.check as string}</span>
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Failure modes */}
                          {Array.isArray(judgeEvent.failureModes) && (judgeEvent.failureModes as string[]).length > 0 && (
                            <div className="text-xs text-red-600 mt-1">
                              <span className="font-medium">Failure modes:</span> {(judgeEvent.failureModes as string[]).join(", ")}
                            </div>
                          )}
                          {!!judgeEvent.judgeReasoning && (
                            <div className="text-xs text-slate-600 mt-2 bg-slate-50 p-2 rounded">
                              <span className="font-medium">Reasoning:</span> {judgeEvent.judgeReasoning as string}
                            </div>
                          )}
                          {!!judgeEvent.overallFeedback && (
                            <div className="text-xs text-slate-600 mt-2">
                              <span className="font-medium">Feedback:</span> {judgeEvent.overallFeedback as string}
                            </div>
                          )}
                        </div>
                      )}
                      {!!revisionEvent?.specificImprovements && (
                        <div className="bg-amber-50 rounded-lg p-2 border border-amber-100 text-xs">
                          <span className="font-medium text-amber-800">Improvements needed:</span>
                          <p className="text-amber-700 mt-1">{revisionEvent.specificImprovements as string}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Final Script */}
      {firstCallPrep && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-3">Final Opening Script</h2>
          <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-xl p-5 border border-violet-100">
            <p className="text-base text-slate-800 italic leading-relaxed">
              &ldquo;{firstCallPrep.opening_script as string}&rdquo;
            </p>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="bg-white/60 text-violet-700 px-2 py-1 rounded border border-violet-200">
                Anchor: {firstCallPrep.hook_anchor as string}
              </span>
              {!!firstCallPrep.follow_up_question && (
                <span className="bg-white/60 text-blue-700 px-2 py-1 rounded border border-blue-200">
                  Follow-up: {firstCallPrep.follow_up_question as string}
                </span>
              )}
            </div>
            {Array.isArray(firstCallPrep.talking_points) && (
              <div className="mt-3 text-xs text-slate-600">
                <span className="font-medium">Talking Points:</span>
                <ul className="list-disc list-inside mt-1 space-y-0.5">
                  {(firstCallPrep.talking_points as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Shimmer animation style */}
      <style jsx>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s ease-in-out infinite;
        }
        @keyframes spin-slow {
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live Status Line — Claude Code-style animated indicator
// ---------------------------------------------------------------------------

function LiveStatusLine({ event }: { event: PipelineEvent }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startTime = new Date(event.timestamp).getTime();
    const tick = () => setElapsed(Math.round((Date.now() - startTime) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [event.timestamp]);

  const stepLabel = STEP_LABELS[event.step] || event.step;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  // Verbs for each step
  const STEP_VERBS: Record<string, string> = {
    ehr_compaction: "Compacting health records",
    ehr_gemini_analysis: "Analyzing with Gemini",
    first_call_prep: "Preparing call script",
    script_generation: "Generating script",
    judge_evaluation: "Judging script quality",
    judge_thinking: "Judge reasoning deeply",
    trigger_generation: "Generating triggers",
    outbound_call: "Initiating call",
    pipeline_start: "Starting pipeline",
    load_context: "Loading patient context",
    agents_init: "Initializing agents",
    ehr_data_scan: "Scanning data sources",
  };

  const verb = STEP_VERBS[event.step] || stepLabel;
  const detail = event.detail ? String(event.detail) : null;
  const elapsedInfo = event.elapsedSeconds ? ` (server: ${event.elapsedSeconds}s)` : "";

  return (
    <div className="bg-gradient-to-r from-violet-50 via-indigo-50 to-violet-50 rounded-xl border border-violet-200 px-5 py-3 flex items-center gap-3 shadow-sm">
      {/* Animated spinner */}
      <div className="relative flex-shrink-0">
        <svg className="w-5 h-5 text-violet-500 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
      </div>

      {/* Status text */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-violet-900">{verb}...</span>
          <span className="text-xs font-mono text-violet-500 tabular-nums">({timeStr}{elapsedInfo})</span>
        </div>
        {detail && (
          <div className="text-xs text-violet-600/70 truncate mt-0.5">{detail}</div>
        )}
      </div>

      {/* Pulsing dot */}
      <div className="flex-shrink-0 flex items-center gap-1.5">
        <span className="relative flex h-2.5 w-2.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500" />
        </span>
      </div>
    </div>
  );
}
