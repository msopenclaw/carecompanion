"use client";

import { useEffect, useState, useCallback } from "react";
import { useConsole } from "../console-context";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("console_token") || ""
    : "";
}

interface ScheduledAction {
  id: string;
  actionType: string;
  label: string | null;
  scheduledTime: string;
  recurrence: string;
  recurrenceDay: string | null;
  timezone: string;
  isActive: boolean;
  intervalDays: number;
  lastTriggeredAt: string | null;
  createdVia: string;
  createdAt: string;
}

interface Trigger {
  id: string;
  type: string;
  hookElement: string | null;
  title: string;
  body: string;
  priority: string;
  status: string;
  scheduledFor: string;
  expiresAt: string | null;
  createdAt: string;
}

interface PipelineRun {
  startedAt: string;
  runType: string;
  eventCount: number;
  lastStep: string | null;
  lastStatus: string | null;
  isComplete: boolean;
  isInterrupted: boolean;
}

interface HookVersion {
  prepared_at: string;
  run_type: string;
  judge_score: number;
  opening_script: string;
  hook_anchor: string;
  iterations: number;
}

interface HeartbeatData {
  scheduledActions: ScheduledAction[];
  pendingTriggers: Trigger[];
  recentTriggers: Trigger[];
  pipelineRuns: PipelineRun[];
  hookVersions: HookVersion[];
  currentScript: {
    score: number;
    preparedAt: string;
    iterations: number;
    openingPreview: string;
  } | null;
}

export default function HeartbeatPage() {
  const { selectedPatientId, selectedPatient } = useConsole();
  const [data, setData] = useState<HeartbeatData | null>(null);
  const [loading, setLoading] = useState(false);

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchData = useCallback(() => {
    if (!selectedPatientId) return;
    setLoading(true);
    fetch(`${RAILWAY_URL}/api/console/heartbeat/${selectedPatientId}`, { headers })
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId]);

  useEffect(() => {
    if (!selectedPatientId) { setData(null); return; }
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [fetchData, selectedPatientId]);

  if (!selectedPatientId) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Select a patient from the sidebar to view their heartbeat.</div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400">Loading heartbeat...</div>
      </div>
    );
  }

  if (!data) {
    return <div className="text-red-500">Failed to load heartbeat data</div>;
  }

  const activeActions = data.scheduledActions.filter((a) => a.isActive);
  const inactiveActions = data.scheduledActions.filter((a) => !a.isActive);
  const patientName = selectedPatient?.profile
    ? `${selectedPatient.profile.firstName} ${selectedPatient.profile.lastName}`
    : "Patient";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Heartbeat</h1>
        <span className="text-sm text-slate-500">{patientName}</span>
        <button
          onClick={fetchData}
          className="ml-auto text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
        >
          Refresh
        </button>
      </div>

      {/* Current Script */}
      {data.currentScript && (
        <div className="bg-gradient-to-r from-violet-50 to-indigo-50 rounded-xl border border-violet-200 p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-semibold text-violet-900">
              Current Call Script
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                  data.currentScript.score >= 32
                    ? "bg-green-100 text-green-700"
                    : data.currentScript.score >= 28
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                }`}
              >
                {data.currentScript.score}/40
              </span>
              <span className="text-xs text-slate-400">
                {data.currentScript.iterations} iteration
                {data.currentScript.iterations !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <p className="text-sm text-slate-700 italic">
            &ldquo;{data.currentScript.openingPreview}...&rdquo;
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Prepared:{" "}
            {new Date(data.currentScript.preparedAt).toLocaleString()}
          </p>
        </div>
      )}

      {/* Scheduled Actions */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">
          Scheduled Actions ({activeActions.length} active)
        </h2>
        {activeActions.length === 0 ? (
          <p className="text-sm text-slate-400">
            No active scheduled actions. Pipeline may not have completed
            onboarding.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-100">
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Recurrence</th>
                  <th className="pb-2 pr-4">Timezone</th>
                  <th className="pb-2 pr-4">Label</th>
                  <th className="pb-2 pr-4">Last Fired</th>
                  <th className="pb-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {activeActions.map((a) => (
                  <tr
                    key={a.id}
                    className="border-b border-slate-50 hover:bg-slate-50"
                  >
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${
                          a.actionType === "hook_regeneration"
                            ? "bg-violet-100 text-violet-700"
                            : a.actionType === "med_reminder"
                              ? "bg-blue-100 text-blue-700"
                              : a.actionType === "hydration_reminder"
                                ? "bg-cyan-100 text-cyan-700"
                                : a.actionType === "daily_call"
                                  ? "bg-green-100 text-green-700"
                                  : a.actionType === "checkin_reminder"
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {a.actionType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-2 pr-4 font-mono text-slate-700">
                      {a.scheduledTime}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {a.recurrence}
                      {a.recurrenceDay ? ` (${a.recurrenceDay})` : ""}
                      {a.intervalDays > 1
                        ? ` every ${a.intervalDays}d`
                        : ""}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500">
                      {a.timezone.replace("America/", "")}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-500 max-w-[200px] truncate">
                      {a.label || "\u2014"}
                    </td>
                    <td className="py-2 pr-4 text-xs text-slate-400">
                      {a.lastTriggeredAt
                        ? new Date(a.lastTriggeredAt).toLocaleString()
                        : "never"}
                    </td>
                    <td className="py-2 text-xs text-slate-400">
                      {a.createdVia}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {inactiveActions.length > 0 && (
          <details className="mt-3">
            <summary className="text-xs text-slate-400 cursor-pointer">
              {inactiveActions.length} inactive action
              {inactiveActions.length !== 1 ? "s" : ""}
            </summary>
            <div className="mt-2 space-y-1">
              {inactiveActions.map((a) => (
                <div
                  key={a.id}
                  className="text-xs text-slate-400 flex gap-3"
                >
                  <span className="line-through">
                    {a.actionType.replace(/_/g, " ")}
                  </span>
                  <span>{a.scheduledTime}</span>
                  <span>{a.label || ""}</span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Pending Triggers */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">
          Pending Triggers ({data.pendingTriggers.length})
        </h2>
        {data.pendingTriggers.length === 0 ? (
          <p className="text-sm text-slate-400">No pending triggers</p>
        ) : (
          <div className="space-y-2">
            {data.pendingTriggers.map((t) => (
              <div
                key={t.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-slate-800">
                      {t.title}
                    </span>
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      {t.type.replace(/_/g, " ")}
                    </span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        t.priority === "high"
                          ? "bg-red-100 text-red-700"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {t.priority}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                    {t.body}
                  </p>
                </div>
                <div className="text-xs text-slate-400 text-right whitespace-nowrap">
                  <div>
                    Fires:{" "}
                    {new Date(t.scheduledFor).toLocaleString()}
                  </div>
                  {t.expiresAt && (
                    <div>
                      Expires:{" "}
                      {new Date(t.expiresAt).toLocaleString()}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent Triggers (delivered) */}
      {data.recentTriggers.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">
            Recently Delivered (48h)
          </h2>
          <div className="space-y-1">
            {data.recentTriggers.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-50"
              >
                <span className="text-slate-400 w-32">
                  {new Date(t.createdAt).toLocaleString()}
                </span>
                <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                  {t.type.replace(/_/g, " ")}
                </span>
                <span className="text-slate-700 font-medium">
                  {t.title}
                </span>
                <span className="text-slate-400 truncate max-w-[300px]">
                  {t.body}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hook Version History */}
      {data.hookVersions.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">
            Hook Script History
          </h2>
          <div className="space-y-2">
            {[...data.hookVersions].reverse().map((h, i) => (
              <div
                key={i}
                className="flex items-start gap-3 p-3 rounded-lg bg-slate-50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        h.judge_score >= 32
                          ? "bg-green-100 text-green-700"
                          : h.judge_score >= 28
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {h.judge_score}/40
                    </span>
                    <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded">
                      {h.run_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {h.iterations} iter
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 italic line-clamp-2">
                    &ldquo;{h.opening_script}&rdquo;
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Anchor: {h.hook_anchor}
                  </p>
                </div>
                <span className="text-xs text-slate-400 whitespace-nowrap">
                  {new Date(h.prepared_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Run History */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-3">
          Pipeline Runs ({data.pipelineRuns.length})
        </h2>
        {data.pipelineRuns.length === 0 ? (
          <p className="text-sm text-slate-400">No pipeline runs recorded</p>
        ) : (
          <div className="space-y-1">
            {[...data.pipelineRuns].reverse().map((r, i) => (
              <div
                key={i}
                className="flex items-center gap-3 text-xs py-1.5 border-b border-slate-50"
              >
                <span className="text-slate-400 w-36">
                  {new Date(r.startedAt).toLocaleString()}
                </span>
                <span className="bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                  {r.runType}
                </span>
                <span className="text-slate-500">
                  {r.eventCount} events
                </span>
                <span className="text-slate-500">
                  Last: {r.lastStep}
                </span>
                {r.isComplete ? (
                  <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                    Complete
                  </span>
                ) : r.isInterrupted ? (
                  <span className="bg-red-100 text-red-700 px-1.5 py-0.5 rounded">
                    Interrupted
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                    {r.lastStatus}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
