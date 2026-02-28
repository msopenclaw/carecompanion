"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PipelineStep,
  ScoreBar,
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

export default function PipelinePage() {
  const { id } = useParams();
  const [patientName, setPatientName] = useState<string>("Patient");
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPipeline, setRunningPipeline] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchPipeline = useCallback(() => {
    fetch(`${RAILWAY_URL}/api/console/patients/${id}/pipeline`, { headers })
      .then((r) => r.json())
      .then((data: PipelineData) => {
        setPipeline(data);
        const log = data.pipelineLog || [];
        const hasStarted = log.some((e: PipelineEvent) => e.step === "pipeline_start" || e.step === "ehr_compaction");
        const hasCompleted = log.some((e: PipelineEvent) => e.step === "pipeline_complete");
        // Upgrade to fast polling if pipeline is running
        if (hasStarted && !hasCompleted && !autoRefresh) {
          setAutoRefresh(true);
        }
        // Stop fast polling when pipeline completes
        if (hasCompleted && autoRefresh) {
          setAutoRefresh(false);
        }
      })
      .catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, autoRefresh]);

  useEffect(() => {
    Promise.all([
      fetch(`${RAILWAY_URL}/api/console/patients/${id}`, { headers }).then((r) => r.json()),
      fetch(`${RAILWAY_URL}/api/console/patients/${id}/pipeline`, { headers }).then((r) => r.json()),
    ])
      .then(([p, pl]) => {
        const profile = p.profile as Record<string, unknown> | null;
        if (profile) setPatientName(`${profile.firstName} ${profile.lastName}`);
        setPipeline(pl);
        // Auto-enable polling if a pipeline is currently running (triggered externally)
        const log = (pl as PipelineData)?.pipelineLog || [];
        const hasStarted = log.some((e: PipelineEvent) => e.step === "pipeline_start" || e.step === "ehr_compaction");
        const hasCompleted = log.some((e: PipelineEvent) => e.step === "pipeline_complete");
        if (hasStarted && !hasCompleted) {
          setAutoRefresh(true);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Slow background poll (10s) — detects externally-triggered pipelines
  useEffect(() => {
    const bgInterval = setInterval(() => {
      if (!autoRefresh) fetchPipeline();
    }, 10000);
    return () => clearInterval(bgInterval);
  }, [autoRefresh, fetchPipeline]);

  // Fast poll (3s) when pipeline is actively running
  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchPipeline, 3000);
      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
      };
    }
  }, [autoRefresh, fetchPipeline]);

  const runPipeline = async () => {
    setRunningPipeline(true);
    setAutoRefresh(true);
    try {
      await fetch(`${RAILWAY_URL}/api/console/patients/${id}/run-pipeline`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
    } catch (e) {
      console.error("Run pipeline error:", e);
    }
    setRunningPipeline(false);
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-slate-500">Loading pipeline...</div>;

  const pipelineLog = pipeline?.pipelineLog || [];
  const firstCallPrep = pipeline?.firstCallPrep;

  // Group events by iteration for negotiation view
  const iterations: Map<number, PipelineEvent[]> = new Map();
  for (const event of pipelineLog) {
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
          <Link href={`/console/patients/${id}`} className="text-blue-600 hover:underline text-sm">
            &larr; {patientName}
          </Link>
          <span className="text-slate-300">|</span>
          <h1 className="text-xl font-bold text-slate-900">Engagement Agent&apos;s Workshop</h1>
        </div>

        <div className="flex items-center gap-3">
          {firstCallPrep && (
            <span className={`text-sm font-mono font-bold px-3 py-1 rounded-lg ${
              (firstCallPrep.judge_score as number) >= 90 ? "bg-green-100 text-green-700" :
              (firstCallPrep.judge_score as number) >= 70 ? "bg-amber-100 text-amber-700" :
              "bg-slate-100 text-slate-600"
            }`}>
              Score: {firstCallPrep.judge_score as number}/100
            </span>
          )}
          {firstCallPrep && (
            <span className="text-sm text-slate-500">
              {firstCallPrep.iterations as number} iteration{(firstCallPrep.iterations as number) !== 1 ? "s" : ""}
            </span>
          )}
          {autoRefresh && (
            <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded animate-pulse">
              Live
            </span>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="flex items-center gap-3 bg-white rounded-xl shadow-sm border border-slate-200 p-4">
        <button
          onClick={runPipeline}
          disabled={runningPipeline}
          className="text-sm text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-4 py-2 rounded-lg font-medium"
        >
          {runningPipeline ? "Starting..." : "Run Agents"}
        </button>
        <button
          onClick={fetchPipeline}
          className="text-sm text-blue-600 hover:text-blue-800 px-3 py-2 rounded-lg border border-blue-200 hover:bg-blue-50"
        >
          Refresh
        </button>
        {pipeline?.compactedAt && (
          <span className="text-xs text-slate-400 ml-auto">
            Last compacted: {new Date(pipeline.compactedAt).toLocaleString()}
          </span>
        )}
      </div>

      {/* Pipeline Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Agent Timeline</h2>

        {pipelineLog.length === 0 ? (
          <div className="text-slate-400 text-sm py-12 text-center">
            No agents have been run for this patient yet. Click &ldquo;Run Agents&rdquo; to start.
          </div>
        ) : (
          <div className="space-y-0">
            {pipelineLog.map((event, i) => (
              <PipelineStep
                key={i}
                event={event}
                isLast={i === pipelineLog.length - 1}
                defaultExpanded={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Agent Negotiation View — show iterations side by side */}
      {iterations.size > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Agent Negotiation</h2>
          <p className="text-xs text-slate-500 mb-4">
            Gemini 3.1 Pro (script generator) and Claude Sonnet 4.6 (judge) negotiate to produce the best call script.
          </p>

          <div className="space-y-6">
            {Array.from(iterations.entries()).map(([iter, events]) => {
              const genEvent = events.find(e => e.step === "script_generation");
              const judgeEvent = events.find(e => e.step === "judge_evaluation");
              const revisionEvent = events.find(e => e.step === "revision_requested");
              const acceptedEvent = events.find(e => e.step === "script_accepted");

              return (
                <div key={iter} className="border border-slate-200 rounded-xl overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">Iteration {iter}</span>
                    {acceptedEvent && (
                      <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded">ACCEPTED</span>
                    )}
                    {revisionEvent && !acceptedEvent && (
                      <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">REVISION REQUESTED</span>
                    )}
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
                          <p className="text-sm italic text-slate-800 leading-relaxed">
                            &ldquo;{genEvent.openingScript as string}&rdquo;
                          </p>
                        </div>
                      )}

                      {!!genEvent?.hookAnchor && (
                        <div className="text-xs"><span className="font-medium text-slate-700">Anchor:</span> {genEvent.hookAnchor as string}</div>
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
                          <div className="flex items-center gap-2">
                            <span className={`text-lg font-mono font-bold ${
                              (judgeEvent.totalScore as number) >= 90 ? "text-green-600" :
                              (judgeEvent.totalScore as number) >= 70 ? "text-amber-600" :
                              "text-red-600"
                            }`}>
                              {judgeEvent.totalScore as number}/100
                            </span>
                            <span className="text-xs text-slate-400">(threshold: {judgeEvent.threshold as number})</span>
                          </div>

                          {Array.isArray(judgeEvent.dimensions) && (
                            <div className="space-y-1">
                              {(judgeEvent.dimensions as Dimension[]).map((d, i) => (
                                <ScoreBar key={i} score={d.score} label={d.name} />
                              ))}
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
    </div>
  );
}
