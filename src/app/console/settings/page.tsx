"use client";

import { useEffect, useState } from "react";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  return typeof window !== "undefined"
    ? localStorage.getItem("console_token") || ""
    : "";
}

interface Coordinator {
  id: string;
  name: string;
  gender: string;
  personalityTraits: string;
  bio: string;
  voiceId: string;
  isActive: boolean;
}

interface EngagementRule {
  id: string;
  ageBracket: string;
  primaryChannel: string;
  maxDailyMessages: number;
  maxWeeklyCalls: number;
  callThresholdLevel: number;
  toneDescription: string;
}

export default function SettingsPage() {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [engagementRules, setEngagementRules] = useState<EngagementRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${getToken()}` };
    Promise.all([
      fetch(`${RAILWAY_URL}/api/coordinators`, { headers }).then((r) => r.json()),
      fetch(`${RAILWAY_URL}/api/console/engagement-rules`, { headers })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ])
      .then(([coords, rules]) => {
        setCoordinators(coords || []);
        setEngagementRules(rules || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500">Loading settings...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Settings</h1>

      {/* Coordinator Personas */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Care Coordinator Personas</h2>
        <div className="grid grid-cols-2 gap-4">
          {coordinators.map((coord) => (
            <div
              key={coord.id}
              className="border border-slate-200 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium text-slate-900">{coord.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  coord.isActive !== false
                    ? "bg-green-100 text-green-700"
                    : "bg-slate-100 text-slate-500"
                }`}>
                  {coord.isActive !== false ? "Active" : "Inactive"}
                </span>
              </div>
              <div className="space-y-1 text-xs text-slate-600">
                <div>Gender: {coord.gender}</div>
                <div>Voice ID: <code className="bg-slate-100 px-1 rounded">{coord.voiceId}</code></div>
                <div>Traits: {coord.personalityTraits}</div>
                <div className="mt-2 text-slate-500">{coord.bio}</div>
              </div>
            </div>
          ))}
        </div>
        {coordinators.length === 0 && (
          <div className="text-sm text-slate-400">No coordinator personas configured</div>
        )}
      </div>

      {/* Engagement Rules */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Age-Variant Engagement Rules</h2>
        {engagementRules.length > 0 ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-600 border-b border-slate-200">
                <th className="pb-2 font-medium">Age Bracket</th>
                <th className="pb-2 font-medium">Primary Channel</th>
                <th className="pb-2 font-medium">Max Msgs/Day</th>
                <th className="pb-2 font-medium">Max Calls/Week</th>
                <th className="pb-2 font-medium">Call Threshold</th>
                <th className="pb-2 font-medium">Tone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {engagementRules.map((rule) => (
                <tr key={rule.id}>
                  <td className="py-2 font-medium text-slate-900">{rule.ageBracket}</td>
                  <td className="py-2 text-slate-600">{rule.primaryChannel}</td>
                  <td className="py-2 text-slate-600">{rule.maxDailyMessages}</td>
                  <td className="py-2 text-slate-600">{rule.maxWeeklyCalls}</td>
                  <td className="py-2 text-slate-600">Level {rule.callThresholdLevel}</td>
                  <td className="py-2 text-slate-600 max-w-xs truncate">{rule.toneDescription}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-sm text-slate-400">No engagement rules configured</div>
        )}
      </div>

      {/* System Info */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">System</h2>
        <div className="space-y-2 text-sm text-slate-600">
          <div>
            <span className="font-medium text-slate-700">Backend:</span>{" "}
            <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{RAILWAY_URL}</code>
          </div>
          <div>
            <span className="font-medium text-slate-700">AI Model:</span> Gemini 2.0 Flash
          </div>
          <div>
            <span className="font-medium text-slate-700">TTS Provider:</span> ElevenLabs
          </div>
          <div>
            <span className="font-medium text-slate-700">STT Provider:</span> Deepgram
          </div>
          <div>
            <span className="font-medium text-slate-700">Cron Schedule:</span> Every hour (hourly monologue)
          </div>
        </div>
      </div>
    </div>
  );
}
