"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

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

interface PatientInfo {
  id: string;
  email: string;
  profile: { firstName: string; lastName: string } | null;
}

export default function PatientMonologuePage() {
  const { id } = useParams();
  const [actions, setActions] = useState<AiAction[]>([]);
  const [patient, setPatient] = useState<PatientInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${RAILWAY_URL}/api/console/patients/${id}`, { headers }).then((r) => r.json()),
      fetch(`${RAILWAY_URL}/api/console/patients/${id}/monologue?limit=50`, { headers }).then((r) => r.json()),
    ])
      .then(([p, m]) => {
        setPatient(p);
        setActions(m);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="text-slate-500">Loading...</div>;

  const patientName = patient?.profile
    ? `${patient.profile.firstName} ${patient.profile.lastName}`
    : patient?.email || "Unknown";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/console/monologue" className="text-blue-600 hover:underline text-sm">
          &larr; Monologue Feed
        </Link>
        <h1 className="text-2xl font-bold text-slate-900">
          AI Monologue — {patientName}
        </h1>
      </div>

      {actions.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
          No AI actions recorded for this patient.
        </div>
      ) : (
        <div className="space-y-3">
          {actions.map((action) => (
            <div
              key={action.id}
              className="bg-white rounded-xl shadow-sm border border-slate-200 p-4"
            >
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
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                    {action.action}
                  </span>
                  <span className="text-xs text-slate-400">
                    {action.source}
                  </span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(action.createdAt).toLocaleString()}
                </span>
              </div>

              <div className="text-sm font-medium text-slate-900">
                {action.assessment}
              </div>

              <div className="flex gap-3 mt-1 text-xs text-slate-500">
                {action.coordinatorPersona && (
                  <span>Persona: {action.coordinatorPersona}</span>
                )}
                {action.engagementProfile && (
                  <span>Age: {action.engagementProfile}</span>
                )}
                {action.glp1Context && (
                  <span>{action.glp1Context}</span>
                )}
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
