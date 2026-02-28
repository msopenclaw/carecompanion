"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  PipelineStep,
  type PipelineData,
} from "@/components/console/pipeline-components";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("console_token") || ""
    : "";
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function PatientDetailPage() {
  const { id } = useParams();
  const [patient, setPatient] = useState<Record<string, unknown> | null>(null);
  const [monologue, setMonologue] = useState<Record<string, unknown>[]>([]);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningPipeline, setRunningPipeline] = useState(false);

  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchPipeline = useCallback(() => {
    fetch(`${RAILWAY_URL}/api/console/patients/${id}/pipeline`, { headers })
      .then((r) => r.json())
      .then(setPipeline)
      .catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    Promise.all([
      fetch(`${RAILWAY_URL}/api/console/patients/${id}`, { headers }).then((r) => r.json()),
      fetch(`${RAILWAY_URL}/api/console/patients/${id}/monologue?limit=20`, { headers }).then((r) => r.json()),
      fetch(`${RAILWAY_URL}/api/console/patients/${id}/pipeline`, { headers }).then((r) => r.json()),
    ])
      .then(([p, m, pl]) => {
        setPatient(p);
        setMonologue(m);
        setPipeline(pl);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const runPipeline = async () => {
    setRunningPipeline(true);
    try {
      await fetch(`${RAILWAY_URL}/api/console/patients/${id}/run-pipeline`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
      });
      // Poll for updates every 3 seconds
      const interval = setInterval(() => fetchPipeline(), 3000);
      setTimeout(() => clearInterval(interval), 120000); // Stop after 2 min
    } catch (e) {
      console.error("Run pipeline error:", e);
    }
    setRunningPipeline(false);
  };

  if (loading) return <div className="text-slate-500">Loading...</div>;
  if (!patient) return <div className="text-red-500">Patient not found</div>;

  const profile = patient.profile as Record<string, unknown> | null;
  const coordinator = patient.coordinator as Record<string, unknown> | null;
  const engConfig = patient.engagementConfig as Record<string, unknown> | null;
  const pipelineLog = pipeline?.pipelineLog || [];
  const firstCallPrep = pipeline?.firstCallPrep;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/console/patients" className="text-blue-600 hover:underline text-sm">
          &larr; Patients
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          {profile ? `${profile.firstName} ${profile.lastName}` : "Patient Detail"}
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Profile Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Profile</h2>
          {profile && (
            <div className="space-y-2 text-sm text-slate-600">
              <div><span className="font-medium text-slate-700">Name:</span> {profile.firstName as string} {profile.lastName as string}</div>
              <div><span className="font-medium text-slate-700">DOB:</span> {profile.dateOfBirth as string}</div>
              <div><span className="font-medium text-slate-700">Age Group:</span> {profile.ageBracket as string}</div>
              <div><span className="font-medium text-slate-700">Phone:</span> {(profile.phone as string) || "—"}</div>
              <div><span className="font-medium text-slate-700">GLP-1:</span> {(profile.glp1Medication as string) || "—"} {(profile.glp1Dosage as string) || ""}</div>
              <div><span className="font-medium text-slate-700">Start Date:</span> {(profile.glp1StartDate as string) || "—"}</div>
              <div><span className="font-medium text-slate-700">Injection Day:</span> {(profile.injectionDay as string) || "—"}</div>
              <div><span className="font-medium text-slate-700">Conditions:</span> {JSON.stringify(profile.conditions) || "—"}</div>
              <div><span className="font-medium text-slate-700">Side Effects:</span> {JSON.stringify(profile.currentSideEffects) || "—"}</div>
            </div>
          )}
        </div>

        {/* Coordinator Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Care Coordinator</h2>
          {coordinator ? (
            <div className="space-y-2 text-sm text-slate-600">
              <div><span className="font-medium text-slate-700">Name:</span> {coordinator.name as string}</div>
              <div><span className="font-medium text-slate-700">Gender:</span> {coordinator.gender as string}</div>
              <div><span className="font-medium text-slate-700">Bio:</span> {coordinator.bio as string}</div>
            </div>
          ) : (
            <div className="text-sm text-slate-400">No coordinator assigned</div>
          )}

          <h3 className="font-semibold text-slate-900 mt-4 mb-2">Engagement Rules</h3>
          {engConfig ? (
            <div className="space-y-1 text-xs text-slate-600">
              <div>Channel: {engConfig.primaryChannel as string}</div>
              <div>Max msgs/day: {engConfig.maxDailyMessages as number}</div>
              <div>Max calls/week: {engConfig.maxWeeklyCalls as number}</div>
              <div>Call threshold: Level {engConfig.callThresholdLevel as number}</div>
              <div>Tone: {engConfig.toneDescription as string}</div>
            </div>
          ) : (
            <div className="text-xs text-slate-400">No config</div>
          )}
        </div>

        {/* Recent Vitals Card */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Recent Vitals</h2>
          {(patient.recentVitals as Record<string, unknown>[])?.length > 0 ? (
            <div className="space-y-1 text-xs text-slate-600 max-h-64 overflow-y-auto">
              {(patient.recentVitals as Record<string, unknown>[]).slice(0, 15).map((v, i) => (
                <div key={i} className="flex justify-between">
                  <span>{v.vitalType as string}</span>
                  <span className="font-mono">{v.value as number} {v.unit as string}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">No vitals recorded</div>
          )}
        </div>
      </div>

      {/* Engagement Pipeline */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold text-slate-900">Engagement Pipeline</h2>
            {firstCallPrep && (
              <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                (firstCallPrep.judge_score as number) >= 90 ? "bg-green-100 text-green-700" :
                (firstCallPrep.judge_score as number) >= 70 ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-600"
              }`}>
                Score: {firstCallPrep.judge_score as number}/100
              </span>
            )}
            {firstCallPrep && (
              <span className="text-xs text-slate-400">
                {firstCallPrep.iterations as number} iteration{(firstCallPrep.iterations as number) !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/console/patients/${id}/pipeline`}
              className="text-xs text-violet-600 hover:text-violet-800 px-2 py-1 rounded border border-violet-200 hover:bg-violet-50 font-medium"
            >
              View Full Pipeline &rarr;
            </Link>
            {pipelineLog.length > 0 && (
              <button
                onClick={fetchPipeline}
                className="text-xs text-blue-600 hover:text-blue-800 px-2 py-1 rounded border border-blue-200 hover:bg-blue-50"
              >
                Refresh
              </button>
            )}
            <button
              onClick={runPipeline}
              disabled={runningPipeline}
              className="text-xs text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-3 py-1.5 rounded-lg"
            >
              {runningPipeline ? "Starting..." : "Run Pipeline"}
            </button>
          </div>
        </div>

        {pipelineLog.length === 0 ? (
          <div className="text-slate-400 text-sm py-8 text-center">
            No pipeline has been run for this patient yet. Click &ldquo;Run Pipeline&rdquo; to start.
          </div>
        ) : (
          <div className="space-y-0">
            {pipelineLog.map((event, i) => (
              <PipelineStep key={i} event={event} isLast={i === pipelineLog.length - 1} />
            ))}
          </div>
        )}

        {/* Final Script Preview */}
        {firstCallPrep && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Final Opening Script</h3>
            <div className="bg-gradient-to-br from-violet-50 to-blue-50 rounded-lg p-4 border border-violet-100">
              <p className="text-sm text-slate-800 italic leading-relaxed">
                &ldquo;{firstCallPrep.opening_script as string}&rdquo;
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="bg-white/60 text-violet-700 px-2 py-0.5 rounded border border-violet-200">
                  Anchor: {firstCallPrep.hook_anchor as string}
                </span>
              </div>
              {!!firstCallPrep.follow_up_question && (
                <div className="mt-2 text-xs text-slate-600">
                  <span className="font-medium">Follow-up:</span> {firstCallPrep.follow_up_question as string}
                </div>
              )}
              {Array.isArray(firstCallPrep.talking_points) && (
                <div className="mt-2 text-xs text-slate-600">
                  <span className="font-medium">Talking Points:</span>
                  <ul className="list-disc list-inside mt-1">
                    {(firstCallPrep.talking_points as string[]).map((tp, i) => <li key={i}>{tp}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Monologue History */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">AI Monologue History</h2>
        {monologue.length === 0 ? (
          <div className="text-slate-400 text-sm">No AI actions recorded</div>
        ) : (
          <div className="space-y-4">
            {monologue.map((action: Record<string, unknown>) => (
              <div key={action.id as string} className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      action.urgency === "critical" ? "bg-red-100 text-red-700" :
                      action.urgency === "high" ? "bg-orange-100 text-orange-700" :
                      action.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {action.urgency as string}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {action.action as string}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(action.createdAt as string).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm font-medium text-slate-900">{action.assessment as string}</div>
                <div className="mt-2 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">Observation:</p>
                  <p>{action.observation as string}</p>
                </div>
                <div className="mt-2 text-xs text-slate-600">
                  <p className="font-medium text-slate-700">Reasoning:</p>
                  <p className="whitespace-pre-wrap">{action.reasoning as string}</p>
                </div>
                {(action.messageContent as string) ? (
                  <div className="mt-2 text-xs">
                    <p className="font-medium text-slate-700">Message sent:</p>
                    <p className="bg-blue-50 p-2 rounded mt-1">{action.messageContent as string}</p>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
