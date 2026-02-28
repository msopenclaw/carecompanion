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

interface VoiceCall {
  id: string;
  userId: string;
  initiatedBy: string;
  startedAt: string;
  endedAt: string | null;
  durationSeconds: number | null;
  summary: string | null;
  coordinatorPersona: string | null;
  transcript: { speaker: string; text: string; timestamp: string }[] | null;
}

export default function CallsPage() {
  const { selectedPatientId, selectedPatient } = useConsole();
  const [calls, setCalls] = useState<VoiceCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  useEffect(() => {
    const url = selectedPatientId
      ? `${RAILWAY_URL}/api/console/calls?userId=${selectedPatientId}`
      : `${RAILWAY_URL}/api/console/calls`;

    setLoading(true);
    fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.json())
      .then(setCalls)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedPatientId]);

  const patientName = selectedPatient?.profile
    ? `${selectedPatient.profile.firstName} ${selectedPatient.profile.lastName}`
    : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Voice Call Log</h1>
        {patientName && (
          <span className="text-sm bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200">
            {patientName}
          </span>
        )}
        {!selectedPatientId && (
          <span className="text-xs text-slate-400">All patients</span>
        )}
      </div>

      {loading ? (
        <div className="text-slate-500">Loading...</div>
      ) : calls.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center text-slate-400">
          No voice calls recorded yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-600">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Initiated By</th>
                <th className="px-4 py-3 font-medium">Duration</th>
                <th className="px-4 py-3 font-medium">Persona</th>
                <th className="px-4 py-3 font-medium">Summary</th>
                <th className="px-4 py-3 font-medium">Transcript</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {calls.map((call) => (
                <tr key={call.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-600">{new Date(call.startedAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      call.initiatedBy === "ai" ? "bg-blue-100 text-blue-700" :
                      call.initiatedBy === "admin" ? "bg-purple-100 text-purple-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {call.initiatedBy}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}m ${call.durationSeconds % 60}s` : "\u2014"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{call.coordinatorPersona || "\u2014"}</td>
                  <td className="px-4 py-3 text-slate-600 max-w-xs truncate">{call.summary || "\u2014"}</td>
                  <td className="px-4 py-3">
                    {call.transcript && call.transcript.length > 0 ? (
                      <button
                        onClick={() => setExpandedCall(expandedCall === call.id ? null : call.id)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        {expandedCall === call.id ? "Hide" : "View"}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
