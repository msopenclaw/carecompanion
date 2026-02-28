"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const RAILWAY_URL =
  process.env.NEXT_PUBLIC_RAILWAY_URL ||
  "https://carecompanion-backend-production.up.railway.app";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Stats {
  activePatients: number;
  todayAiActions: number;
  todayCalls: number;
  openEscalations: number;
}

interface Preferences {
  checkinFrequency: string;
  checkinTimePreference: string;
  medReminderEnabled: boolean;
  medReminderPrepNightBefore: boolean;
  hydrationNudgesEnabled: boolean;
  hydrationNudgesPerDay: number;
  weighinPrompt: string;
  exerciseNudgesEnabled: boolean;
  preferredChannel: string;
  voiceCallFrequency: string;
  glucoseAlertMode: string | null;
  quietStart: string;
  quietEnd: string;
  setVia: string;
  updatedAt: string;
}

interface PatientSummary {
  id: string;
  email: string;
  createdAt: string;
  profile: {
    firstName: string;
    lastName: string;
    ageBracket: string;
    glp1Medication: string;
    glp1Dosage: string;
    glp1StartDate: string;
    injectionDay: string;
    phone: string;
    conditions: string[];
    currentSideEffects: string[];
    goals: string[];
  } | null;
  coordinator: { name: string } | null;
  preferences: Preferences | null;
  lastMessage: { content: string; sender: string; createdAt: string } | null;
  lastAiAction: {
    urgency: string;
    action: string;
    assessment: string;
    createdAt: string;
  } | null;
  unreadCount: number;
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
  source: string;
  createdAt: string;
}

interface ChartPoint { date: string; value: number; unit?: string }
interface AdherenceDay { date: string; taken: number; missed: number; total: number }
interface AdherenceData {
  totalScheduled: number;
  totalTaken: number;
  totalMissed: number;
  rate: number;
  daily: AdherenceDay[];
}

interface TimelineEntry {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

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

async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

const URGENCY_COLORS: Record<string, string> = {
  low: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

const PUSH_CATEGORIES = [
  { value: "check_in", label: "Check-in" },
  { value: "medication_reminder", label: "Medication Reminder" },
  { value: "hydration", label: "Hydration Nudge" },
  { value: "custom", label: "Custom Message" },
];

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

function getInitials(profile: PatientSummary["profile"]): string {
  if (!profile) return "?";
  return `${(profile.firstName || "?")[0]}${(profile.lastName || "?")[0]}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ConsoleDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [patients, setPatients] = useState<PatientSummary[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // EHR data for selected patient
  const [chartData, setChartData] = useState<Record<string, ChartPoint[]>>({});
  const [adherence, setAdherence] = useState<AdherenceData | null>(null);
  const [encounters, setEncounters] = useState<AiAction[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);

  // Actions
  const [overrideMessage, setOverrideMessage] = useState("");
  const [pushCategory, setPushCategory] = useState("check_in");
  const [pushBody, setPushBody] = useState("");
  const [callReason, setCallReason] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  // Monologue
  const [monologue, setMonologue] = useState<AiAction[]>([]);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  // Tab within center panel
  const [activeTab, setActiveTab] = useState<"ehr" | "timeline" | "monologue" | "preferences">("ehr");

  const loadData = useCallback(async () => {
    try {
      const [statsData, patientsData] = await Promise.all([
        api("/api/console/stats"),
        api("/api/console/patients"),
      ]);
      setStats(statsData);
      setPatients(patientsData);
    } catch (err) {
      console.error("Failed to load dashboard:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Load patient-specific data when selection changes
  useEffect(() => {
    if (!selectedPatient) return;
    setActiveTab("ehr");
    Promise.all([
      api(`/api/console/patients/${selectedPatient}/chart-data`),
      api(`/api/console/patients/${selectedPatient}/adherence`),
      api(`/api/console/patients/${selectedPatient}/encounters?limit=20`),
      api(`/api/console/patients/${selectedPatient}/timeline?limit=30`),
      api(`/api/console/patients/${selectedPatient}/monologue?limit=20`),
    ]).then(([cd, ad, enc, tl, mono]) => {
      setChartData(cd);
      setAdherence(ad);
      setEncounters(enc);
      setTimeline(tl);
      setMonologue(mono);
    }).catch(console.error);
  }, [selectedPatient]);

  async function sendOverrideMessage() {
    if (!selectedPatient || !overrideMessage.trim()) return;
    try {
      await apiPost("/api/console/override/message", {
        userId: selectedPatient,
        content: overrideMessage,
      });
      setOverrideMessage("");
      setActionStatus("Message sent");
      setTimeout(() => setActionStatus(null), 3000);
      const tl = await api(`/api/console/patients/${selectedPatient}/timeline?limit=30`);
      setTimeline(tl);
    } catch { setActionStatus("Failed to send"); }
  }

  async function sendPushNotification() {
    if (!selectedPatient || !pushBody.trim()) return;
    try {
      const titleMap: Record<string, string> = {
        check_in: "Time to check in",
        medication_reminder: "Medication Reminder",
        hydration: "Hydration Reminder",
        custom: "Care Coordinator",
      };
      await apiPost("/api/console/push", {
        userId: selectedPatient,
        title: titleMap[pushCategory] || "Care Coordinator",
        body: pushBody,
        category: pushCategory,
      });
      setPushBody("");
      setActionStatus("Push sent");
      setTimeout(() => setActionStatus(null), 3000);
    } catch { setActionStatus("Push failed"); }
  }

  async function requestCall() {
    if (!selectedPatient) return;
    try {
      await apiPost("/api/console/call-request", {
        userId: selectedPatient,
        reason: callReason || undefined,
      });
      setCallReason("");
      setActionStatus("Call request sent");
      setTimeout(() => setActionStatus(null), 3000);
    } catch { setActionStatus("Call request failed"); }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-500">Loading console...</div>
      </div>
    );
  }

  const sp = patients.find((p) => p.id === selectedPatient);
  const glp1Start = sp?.profile?.glp1StartDate ? new Date(sp.profile.glp1StartDate) : null;
  const daysSinceStart = glp1Start ? Math.floor((Date.now() - glp1Start.getTime()) / 86400000) : null;
  const weekNumber = daysSinceStart !== null ? Math.ceil(daysSinceStart / 7) : null;

  return (
    <div className="space-y-4">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Active Patients" value={stats?.activePatients || 0} color="blue" />
        <StatCard label="AI Actions Today" value={stats?.todayAiActions || 0} color="purple" />
        <StatCard label="Calls Today" value={stats?.todayCalls || 0} color="green" />
        <StatCard label="Open Escalations" value={stats?.openEscalations || 0} color="red" />
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-12 gap-4" style={{ height: "calc(100vh - 220px)" }}>
        {/* Left: Patient Sidebar */}
        <div className="col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-y-auto">
          <div className="p-4 border-b border-slate-200">
            <h2 className="font-semibold text-slate-900">Patients</h2>
            <p className="text-xs text-slate-500 mt-0.5">{patients.length} enrolled</p>
          </div>
          {patients.length === 0 ? (
            <div className="p-4 text-center text-slate-400 text-sm">No patients enrolled yet</div>
          ) : (
            patients.map((p) => {
              const isSelected = selectedPatient === p.id;
              const lastActivity = p.lastMessage?.createdAt || p.createdAt;
              const urgency = p.lastAiAction?.urgency;
              const avatarColor = urgency === "critical" || urgency === "high"
                ? "bg-red-100 text-red-700"
                : isSelected ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600";
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedPatient(p.id)}
                  className={`w-full text-left px-3 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                    isSelected ? "bg-blue-50 border-l-2 border-l-blue-500" : "border-l-2 border-l-transparent"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor}`}>
                      {getInitials(p.profile)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-slate-900 text-sm truncate">
                          {p.profile ? `${p.profile.firstName} ${p.profile.lastName}` : p.email}
                        </span>
                        {p.unreadCount > 0 && (
                          <span className="ml-1 bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                            {p.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {p.profile?.glp1Medication && (
                          <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                            {p.profile.glp1Medication}
                          </span>
                        )}
                        {urgency && (
                          <span className={`text-[11px] px-1.5 py-0.5 rounded ${URGENCY_COLORS[urgency] || ""}`}>
                            {urgency}
                          </span>
                        )}
                      </div>
                      {p.lastMessage && (
                        <div className="text-[11px] text-slate-400 mt-1 truncate">
                          {p.lastMessage.sender === "ai" ? "AI: " : p.lastMessage.sender === "admin" ? "You: " : ""}
                          {p.lastMessage.content?.slice(0, 50)}
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {lastActivity ? timeAgo(lastActivity) : ""}
                        {p.coordinator && <span> &middot; {p.coordinator.name}</span>}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Center: EHR Dashboard */}
        <div className="col-span-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-y-auto">
          {!selectedPatient ? (
            <div className="flex items-center justify-center h-full text-slate-400">Select a patient</div>
          ) : (
            <div>
              {/* Demographics Bar */}
              {sp?.profile && (
                <div className="p-4 border-b border-slate-200 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-bold text-slate-900">
                        {sp.profile.firstName} {sp.profile.lastName}
                      </h2>
                      <div className="flex gap-4 mt-1 text-xs text-slate-600">
                        <span>{sp.profile.ageBracket}</span>
                        <span>{sp.profile.glp1Medication} {sp.profile.glp1Dosage || ""}</span>
                        {weekNumber && <span>Week {weekNumber} (Day {daysSinceStart})</span>}
                        {sp.profile.injectionDay && <span>Inj: {sp.profile.injectionDay}</span>}
                      </div>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      {sp.coordinator && <div>Coordinator: {sp.coordinator.name}</div>}
                      {sp.profile.phone && <div>{sp.profile.phone}</div>}
                    </div>
                  </div>
                  {/* Conditions & Side Effects */}
                  <div className="flex gap-4 mt-2">
                    {sp.profile.conditions?.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-slate-700">Conditions: </span>
                        {sp.profile.conditions.join(", ")}
                      </div>
                    )}
                    {sp.profile.currentSideEffects?.length > 0 && (
                      <div className="text-xs">
                        <span className="font-medium text-slate-700">Side effects: </span>
                        {sp.profile.currentSideEffects.join(", ")}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Tab Navigation */}
              <div className="flex border-b border-slate-200">
                {(["ehr", "timeline", "monologue", "preferences"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab
                        ? "border-blue-500 text-blue-700"
                        : "border-transparent text-slate-500 hover:text-slate-700"
                    }`}
                  >
                    {tab === "ehr" ? "Charts & Notes" : tab === "timeline" ? "Timeline" : tab === "monologue" ? "AI Monologue" : "Preferences"}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="p-4">
                {activeTab === "ehr" && (
                  <EHRTab
                    chartData={chartData}
                    adherence={adherence}
                    encounters={encounters}
                  />
                )}
                {activeTab === "timeline" && (
                  <div className="space-y-3">
                    {timeline.length === 0 ? (
                      <div className="text-slate-400 text-sm">No interactions yet</div>
                    ) : (
                      timeline.map((entry, i) => <TimelineItem key={i} entry={entry} />)
                    )}
                  </div>
                )}
                {activeTab === "monologue" && (
                  <MonologueList
                    monologue={monologue}
                    expandedAction={expandedAction}
                    setExpandedAction={setExpandedAction}
                  />
                )}
                {activeTab === "preferences" && (
                  <PreferencesTab preferences={sp?.preferences || null} />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right: Actions Panel */}
        <div className="col-span-3 space-y-4 overflow-y-auto">
          {selectedPatient && (
            <>
              {/* Status toast */}
              {actionStatus && (
                <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-3 py-2 rounded-lg">
                  {actionStatus}
                </div>
              )}

              {/* Send Message */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">Send Message</h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={overrideMessage}
                    onChange={(e) => setOverrideMessage(e.target.value)}
                    placeholder="As coordinator..."
                    className="flex-1 text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                    onKeyDown={(e) => e.key === "Enter" && sendOverrideMessage()}
                  />
                  <button
                    onClick={sendOverrideMessage}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                  >
                    Send
                  </button>
                </div>
              </div>

              {/* Push Notification */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">Push Notification</h3>
                <select
                  value={pushCategory}
                  onChange={(e) => setPushCategory(e.target.value)}
                  className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 mb-2"
                >
                  {PUSH_CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
                <textarea
                  value={pushBody}
                  onChange={(e) => setPushBody(e.target.value)}
                  placeholder="Notification message..."
                  rows={2}
                  className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 mb-2 resize-none"
                />
                <button
                  onClick={sendPushNotification}
                  className="w-full px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700"
                >
                  Send Push
                </button>
              </div>

              {/* Request Call */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <h3 className="font-semibold text-slate-900 text-sm mb-2">Request Call</h3>
                <p className="text-xs text-slate-500 mb-2">
                  Sends push to open the voice call screen in the patient&apos;s app
                </p>
                <input
                  type="text"
                  value={callReason}
                  onChange={(e) => setCallReason(e.target.value)}
                  placeholder="Reason (optional)..."
                  className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 mb-2"
                />
                <button
                  onClick={requestCall}
                  className="w-full px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700"
                >
                  Request Call
                </button>
              </div>

              {/* Adherence Summary */}
              {adherence && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                  <h3 className="font-semibold text-slate-900 text-sm mb-2">Adherence (30d)</h3>
                  <div className="text-3xl font-bold text-slate-900">{adherence.rate}%</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {adherence.totalTaken}/{adherence.totalScheduled} taken | {adherence.totalMissed} missed
                  </div>
                </div>
              )}
            </>
          )}
          {!selectedPatient && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center justify-center h-32 text-slate-400 text-sm">
              Select a patient
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EHR Tab — Charts + Encounter Notes
// ---------------------------------------------------------------------------

function EHRTab({
  chartData,
  adherence,
  encounters,
}: {
  chartData: Record<string, ChartPoint[]>;
  adherence: AdherenceData | null;
  encounters: AiAction[];
}) {
  const weightData = chartData.weight || [];
  const waterData = chartData.water || [];
  const hasCharts = weightData.length > 0 || waterData.length > 0 || (adherence?.daily.length || 0) > 0;

  return (
    <div className="space-y-6">
      {!hasCharts && encounters.length === 0 && (
        <div className="text-slate-400 text-sm text-center py-8">
          No chart data or encounter notes yet
        </div>
      )}

      {/* Weight Trend */}
      {weightData.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Weight Trend (30d)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10 }} />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(d) => d}
                formatter={(v) => [`${v} lbs`, "Weight"]}
              />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Medication Adherence Chart */}
      {(adherence?.daily.length || 0) > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Medication Adherence (30d)</h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={adherence!.daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="taken" fill="#22c55e" stackId="a" name="Taken" />
              <Bar dataKey="missed" fill="#ef4444" stackId="a" name="Missed" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Water Intake */}
      {waterData.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Water Intake (30d)</h4>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={waterData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v) => [`${v} oz`, "Water"]} />
              <Bar dataKey="value" fill="#06b6d4" name="Oz" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Encounter Notes */}
      {encounters.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Encounter Notes</h4>
          <div className="space-y-2">
            {encounters.map((enc) => (
              <div key={enc.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_COLORS[enc.urgency] || ""}`}>
                      {enc.urgency}
                    </span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                      {enc.source === "chat_summary" ? "Chat" : "Cron"}
                    </span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {new Date(enc.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-slate-800">{enc.assessment}</div>
                {enc.observation && enc.source === "chat_summary" && (
                  <div className="text-xs text-slate-500 mt-1">{enc.observation}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monologue List
// ---------------------------------------------------------------------------

function MonologueList({
  monologue,
  expandedAction,
  setExpandedAction,
}: {
  monologue: AiAction[];
  expandedAction: string | null;
  setExpandedAction: (id: string | null) => void;
}) {
  if (monologue.length === 0) {
    return <div className="text-slate-400 text-sm">No AI actions yet</div>;
  }

  return (
    <div className="space-y-3">
      {monologue.map((action) => (
        <div key={action.id} className="border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_COLORS[action.urgency] || ""}`}>
              {action.urgency}
            </span>
            <span className="text-xs text-slate-400">
              {new Date(action.createdAt).toLocaleString()}
            </span>
          </div>
          <div className="text-sm font-medium text-slate-900 mt-1">{action.assessment}</div>
          <div className="text-xs text-slate-500 mt-1">
            {action.action} | {action.source}
            {action.coordinatorPersona && ` | ${action.coordinatorPersona}`}
          </div>
          <button
            onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
            className="text-xs text-blue-600 mt-2 hover:underline"
          >
            {expandedAction === action.id ? "Hide" : "Details"}
          </button>
          {expandedAction === action.id && (
            <div className="mt-2 space-y-2 text-xs">
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
                  <p className="text-slate-600 mt-0.5 bg-blue-50 p-2 rounded">{action.messageContent}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preferences Tab
// ---------------------------------------------------------------------------

function PreferencesTab({ preferences }: { preferences: Preferences | null }) {
  if (!preferences) {
    return <div className="text-slate-400 text-sm text-center py-8">No preferences set yet</div>;
  }

  const labelMap: Record<string, string> = {
    once_daily: "Once daily",
    twice_daily: "Twice daily",
    morning: "Morning",
    evening: "Evening",
    both: "Morning & Evening",
    daily: "Daily",
    every_2_days: "Every 2 days",
    every_3_days: "Every 3 days",
    weekly: "Weekly",
    text: "Text only",
    voice: "Voice only",
    daily_morning: "Daily (morning)",
    daily_evening: "Daily (evening)",
    weekly_only: "Weekly only",
    day1_chat: "Day 1 chat",
    api: "API",
  };

  const label = (v: string) => labelMap[v] || v;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Patient Preferences</h4>
        <span className="text-[11px] text-slate-400">
          Set via {label(preferences.setVia)} &middot; Updated {new Date(preferences.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Check-ins */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Check-ins</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Frequency" value={label(preferences.checkinFrequency)} />
          <PrefRow label="Time preference" value={label(preferences.checkinTimePreference)} />
        </div>
      </div>

      {/* Medications */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Medications</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Med reminders" value={preferences.medReminderEnabled ? "On" : "Off"} on={preferences.medReminderEnabled} />
          <PrefRow label="Night-before prep" value={preferences.medReminderPrepNightBefore ? "On" : "Off"} on={preferences.medReminderPrepNightBefore} />
        </div>
      </div>

      {/* Hydration & Activity */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Hydration & Activity</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Hydration nudges" value={preferences.hydrationNudgesEnabled ? `On (${preferences.hydrationNudgesPerDay}/day)` : "Off"} on={preferences.hydrationNudgesEnabled} />
          <PrefRow label="Exercise nudges" value={preferences.exerciseNudgesEnabled ? "On" : "Off"} on={preferences.exerciseNudgesEnabled} />
          <PrefRow label="Weigh-in prompt" value={label(preferences.weighinPrompt)} />
          {preferences.glucoseAlertMode && <PrefRow label="Glucose alerts" value={preferences.glucoseAlertMode} />}
        </div>
      </div>

      {/* Communication */}
      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Communication</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Preferred channel" value={label(preferences.preferredChannel)} />
          <PrefRow label="Voice call frequency" value={label(preferences.voiceCallFrequency)} />
          <PrefRow label="Quiet hours" value={`${preferences.quietStart} – ${preferences.quietEnd}`} />
        </div>
      </div>
    </div>
  );
}

function PrefRow({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${on === false ? "text-slate-400" : on === true ? "text-green-700" : "text-slate-900"}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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

function TimelineItem({ entry }: { entry: TimelineEntry }) {
  const data = entry.data as Record<string, string>;

  if (entry.type === "message") {
    return (
      <div className="flex gap-2">
        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
          data.sender === "ai" ? "bg-blue-500" : data.sender === "admin" ? "bg-purple-500" : "bg-green-500"
        }`} />
        <div className="flex-1">
          <div className="text-xs text-slate-500">
            {data.sender === "ai" ? "AI" : data.sender === "admin" ? "Admin" : "Patient"}{" "}
            | {new Date(entry.timestamp).toLocaleString()}
          </div>
          <div className="text-sm text-slate-700 mt-0.5">
            {data.content?.slice(0, 200)}{(data.content?.length || 0) > 200 ? "..." : ""}
          </div>
        </div>
      </div>
    );
  }

  if (entry.type === "voice_call") {
    return (
      <div className="flex gap-2">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-teal-500" />
        <div>
          <div className="text-xs text-slate-500">Voice call | {new Date(entry.timestamp).toLocaleString()}</div>
          <div className="text-sm text-slate-700 mt-0.5">Duration: {data.durationSeconds || "—"}s | {data.initiatedBy}</div>
        </div>
      </div>
    );
  }

  if (entry.type === "escalation") {
    return (
      <div className="flex gap-2">
        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-red-500" />
        <div>
          <div className="text-xs text-slate-500">Escalation | {new Date(entry.timestamp).toLocaleString()}</div>
          <div className="text-sm text-red-700 mt-0.5">{data.reason?.slice(0, 150)}</div>
        </div>
      </div>
    );
  }

  return null;
}
