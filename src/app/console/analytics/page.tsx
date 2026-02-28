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

interface AnalyticsData {
  totalPatients: number;
  activeToday: number;
  totalMessages: number;
  totalCalls: number;
  totalEscalations: number;
  avgResponseTime: number | null;
  urgencyBreakdown: { urgency: string; count: number }[];
  actionBreakdown: { action: string; count: number }[];
  dailyActivity: { date: string; messages: number; actions: number }[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${RAILWAY_URL}/api/console/stats`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((stats) => {
        // Build analytics from available stats
        setData({
          totalPatients: stats.activePatients || 0,
          activeToday: stats.activePatients || 0,
          totalMessages: stats.totalMessages || 0,
          totalCalls: stats.todayCalls || 0,
          totalEscalations: stats.openEscalations || 0,
          avgResponseTime: null,
          urgencyBreakdown: stats.urgencyBreakdown || [],
          actionBreakdown: stats.actionBreakdown || [],
          dailyActivity: stats.dailyActivity || [],
        });
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-slate-500">Loading analytics...</div>;
  if (!data) return <div className="text-red-500">Failed to load analytics</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Analytics</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <MetricCard label="Total Patients" value={data.totalPatients} />
        <MetricCard label="Active Today" value={data.activeToday} />
        <MetricCard label="Total Messages" value={data.totalMessages} />
        <MetricCard label="Voice Calls" value={data.totalCalls} />
        <MetricCard label="Escalations" value={data.totalEscalations} />
      </div>

      {/* Urgency & Action Breakdown */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">AI Actions by Urgency</h2>
          {data.urgencyBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.urgencyBreakdown.map((item) => (
                <div key={item.urgency} className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    item.urgency === "critical" ? "bg-red-100 text-red-700" :
                    item.urgency === "high" ? "bg-orange-100 text-orange-700" :
                    item.urgency === "medium" ? "bg-amber-100 text-amber-700" :
                    "bg-green-100 text-green-700"
                  }`}>
                    {item.urgency}
                  </span>
                  <span className="text-sm font-medium text-slate-900">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">No AI actions recorded yet</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">AI Actions by Type</h2>
          {data.actionBreakdown.length > 0 ? (
            <div className="space-y-2">
              {data.actionBreakdown.map((item) => (
                <div key={item.action} className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">{item.action}</span>
                  <span className="text-sm font-medium text-slate-900">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">No AI actions recorded yet</div>
          )}
        </div>
      </div>

      {/* Daily Activity */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-900 mb-4">Daily Activity (Last 7 Days)</h2>
        {data.dailyActivity.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-200">
                  <th className="pb-2 font-medium">Date</th>
                  <th className="pb-2 font-medium">Messages</th>
                  <th className="pb-2 font-medium">AI Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.dailyActivity.map((day) => (
                  <tr key={day.date}>
                    <td className="py-2 text-slate-600">{day.date}</td>
                    <td className="py-2 text-slate-900 font-medium">{day.messages}</td>
                    <td className="py-2 text-slate-900 font-medium">{day.actions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-sm text-slate-400">No activity recorded yet</div>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}
