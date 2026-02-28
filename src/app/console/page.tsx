"use client";

import { useEffect, useState, useCallback } from "react";
import { useConsole } from "./console-context";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

function getToken() {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("console_token") || "";
}

async function api(path: string) {
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

interface Stats {
  activePatients: number;
  todayAiActions: number;
  todayCalls: number;
  openEscalations: number;
}

interface RecentAction {
  id: string;
  userId: string;
  urgency: string;
  action: string;
  assessment: string;
  createdAt: string;
}

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ConsoleDashboard() {
  const { patients, selectedPatientId, setSelectedPatientId } = useConsole();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActions, setRecentActions] = useState<RecentAction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [statsData, actionsData] = await Promise.all([
        api("/api/console/stats"),
        api("/api/console/monologue?limit=10"),
      ]);
      setStats(statsData);
      setRecentActions(actionsData);
    } catch (err) {
      console.error("Dashboard load failed:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-slate-500">Loading console...</div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Patients" value={stats?.activePatients || 0} color="blue" />
        <StatCard label="AI Actions Today" value={stats?.todayAiActions || 0} color="purple" />
        <StatCard label="Calls Today" value={stats?.todayCalls || 0} color="green" />
        <StatCard label="Open Escalations" value={stats?.openEscalations || 0} color="red" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Patient List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Patients ({patients.length})</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {patients.map((p) => {
              const urgency = p.lastAiAction?.urgency;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatientId(p.id)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors hover:bg-slate-50 ${
                    selectedPatientId === p.id ? "border-blue-300 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-slate-900 text-sm">
                        {p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email}
                      </span>
                      {p.profile?.glp1Medication && (
                        <span className="ml-2 text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                          {p.profile.glp1Medication}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {urgency && (
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${URGENCY_COLORS[urgency] || ""}`}>
                          {urgency}
                        </span>
                      )}
                      {p.lastMessage && (
                        <span className="text-[10px] text-slate-400">{timeAgo(p.lastMessage.createdAt)}</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Recent AI Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-3">Recent AI Actions</h2>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {recentActions.length === 0 ? (
              <div className="text-slate-400 text-sm text-center py-8">No AI actions yet</div>
            ) : (
              recentActions.map((action) => (
                <div key={action.id} className="px-3 py-2.5 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${URGENCY_COLORS[action.urgency] || ""}`}>
                      {action.urgency}
                    </span>
                    <span className="text-[10px] text-slate-400">{timeAgo(action.createdAt)}</span>
                  </div>
                  <div className="text-sm text-slate-800 truncate">{action.assessment}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{action.action}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorClasses: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    green: "bg-green-50 text-green-700 border-green-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className={`rounded-xl border p-4 ${colorClasses[color] || colorClasses.blue}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs mt-1 opacity-80">{label}</div>
    </div>
  );
}
