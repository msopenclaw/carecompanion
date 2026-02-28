"use client";

import { useEffect, useState } from "react";
import { useConsole } from "../console-context";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("console_token") || ""
    : "";
}

interface AiAction {
  id: string;
  userId: string;
  observation: string;
  reasoning: string;
  assessment: string;
  urgency: string;
  action: string;
  messageContent: string | null;
  coordinatorPersona: string | null;
  engagementProfile: string | null;
  glp1Context: string | null;
  source: string;
  createdAt: string;
}

export default function MonologuePage() {
  const { selectedPatientId, selectedPatient } = useConsole();
  const [actions, setActions] = useState<AiAction[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (filter !== "all") params.set("urgency", filter);

    // If a patient is selected, use the patient-specific endpoint
    const url = selectedPatientId
      ? `${RAILWAY_URL}/api/console/patients/${selectedPatientId}/monologue?limit=50${filter !== "all" ? `&urgency=${filter}` : ""}`
      : `${RAILWAY_URL}/api/console/monologue${params.toString() ? `?${params}` : ""}`;

    setLoading(true);
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then(setActions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [filter, selectedPatientId]);

  const patientName = selectedPatient?.profile
    ? `${selectedPatient.profile.firstName} ${selectedPatient.profile.lastName}`
    : null;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900">AI Monologue Feed</h1>
          {patientName && (
            <span className="text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
              {patientName}
            </span>
          )}
          {!selectedPatientId && (
            <span className="text-xs text-slate-400">All patients</span>
          )}
        </div>
        <div className="flex gap-2">
          {["all", "critical", "high", "medium", "low"].map((level) => (
            <button
              key={level}
              onClick={() => setFilter(level)}
              className={`px-3 py-1.5 text-xs rounded-full border ${
                filter === level
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {level.charAt(0).toUpperCase() + level.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : actions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
          No AI actions recorded yet. Actions will appear here once the hourly monologue runs.
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <div key={action.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    action.urgency === "critical" ? "bg-red-100 text-red-700" :
                    action.urgency === "high" ? "bg-orange-100 text-orange-700" :
                    action.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {action.urgency}
                  </span>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{action.action}</span>
                  <span className="text-xs text-slate-400">{action.source}</span>
                </div>
                <span className="text-xs text-slate-400">{new Date(action.createdAt).toLocaleString()}</span>
              </div>

              <div className="text-sm font-medium text-slate-900">{action.assessment}</div>

              <div className="flex gap-3 mt-1 text-xs text-slate-500">
                {action.coordinatorPersona && <span>Persona: {action.coordinatorPersona}</span>}
                {action.engagementProfile && <span>Age: {action.engagementProfile}</span>}
                {action.glp1Context && <span>{action.glp1Context}</span>}
              </div>

              <button
                onClick={() => setExpanded(expanded === action.id ? null : action.id)}
                className="text-xs text-blue-600 mt-2 hover:underline"
              >
                {expanded === action.id ? "Hide details" : "Show full reasoning"}
              </button>

              {expanded === action.id && (
                <div className="mt-3 space-y-2 text-xs border-t border-slate-100 pt-3">
                  <div>
                    <span className="font-medium text-slate-700">Observation:</span>
                    <p className="text-slate-600 mt-0.5">{action.observation}</p>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700">Reasoning:</span>
                    <p className="text-slate-600 mt-0.5 whitespace-pre-wrap">{action.reasoning}</p>
                  </div>
                  {action.messageContent && (
                    <div>
                      <span className="font-medium text-slate-700">Message:</span>
                      <p className="bg-blue-50 p-2 rounded mt-0.5">{action.messageContent}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
