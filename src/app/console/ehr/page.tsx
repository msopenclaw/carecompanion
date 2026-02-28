"use client";

import { useEffect, useState, useCallback } from "react";
import { useConsole } from "../console-context";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from "recharts";

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

async function apiPost(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function apiUpload(path: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${RAILWAY_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: formData,
  });
  if (!res.ok) throw new Error(`Upload ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChartPoint { date: string; value: number; unit?: string }
interface AdherenceDay { date: string; taken: number; missed: number; total: number }
interface AdherenceData {
  totalScheduled: number;
  totalTaken: number;
  totalMissed: number;
  rate: number;
  daily: AdherenceDay[];
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

interface TimelineEntry {
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface HealthRecord {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  status: string;
  createdAt: string;
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

// ---------------------------------------------------------------------------
// Main EHR Page
// ---------------------------------------------------------------------------

export default function EHRPage() {
  const { selectedPatientId, selectedPatient } = useConsole();

  const [chartData, setChartData] = useState<Record<string, ChartPoint[]>>({});
  const [adherence, setAdherence] = useState<AdherenceData | null>(null);
  const [encounters, setEncounters] = useState<AiAction[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [monologue, setMonologue] = useState<AiAction[]>([]);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [healthRecords, setHealthRecords] = useState<HealthRecord[]>([]);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState<"ehr" | "timeline" | "monologue" | "preferences">("ehr");

  // Actions
  const [overrideMessage, setOverrideMessage] = useState("");
  const [pushCategory, setPushCategory] = useState("check_in");
  const [pushBody, setPushBody] = useState("");
  const [callReason, setCallReason] = useState("");
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<string | null>(null);

  const loadPatientData = useCallback(async () => {
    if (!selectedPatientId) return;
    setLoading(true);
    try {
      const [cd, ad, enc, tl, mono, records] = await Promise.all([
        api(`/api/console/patients/${selectedPatientId}/chart-data`),
        api(`/api/console/patients/${selectedPatientId}/adherence`),
        api(`/api/console/patients/${selectedPatientId}/encounters?limit=20`),
        api(`/api/console/patients/${selectedPatientId}/timeline?limit=30`),
        api(`/api/console/patients/${selectedPatientId}/monologue?limit=20`),
        api(`/api/console/patients/${selectedPatientId}/health-records`).catch(() => []),
      ]);
      setChartData(cd);
      setAdherence(ad);
      setEncounters(enc);
      setTimeline(tl);
      setMonologue(mono);
      setHealthRecords(records);
      // Preferences are on the patient summary
    } catch (e) {
      console.error("EHR data load failed:", e);
    } finally {
      setLoading(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    if (selectedPatientId) {
      setActiveTab("ehr");
      loadPatientData();
    }
  }, [selectedPatientId, loadPatientData]);

  useEffect(() => {
    if (selectedPatient?.preferences) {
      setPreferences(selectedPatient.preferences as unknown as Preferences);
    }
  }, [selectedPatient]);

  async function sendOverrideMessage() {
    if (!selectedPatientId || !overrideMessage.trim()) return;
    try {
      await apiPost("/api/console/override/message", { userId: selectedPatientId, content: overrideMessage });
      setOverrideMessage("");
      setActionStatus("Message sent");
      setTimeout(() => setActionStatus(null), 3000);
      const tl = await api(`/api/console/patients/${selectedPatientId}/timeline?limit=30`);
      setTimeline(tl);
    } catch { setActionStatus("Failed to send"); }
  }

  async function sendPushNotification() {
    if (!selectedPatientId || !pushBody.trim()) return;
    try {
      const titleMap: Record<string, string> = {
        check_in: "Time to check in", medication_reminder: "Medication Reminder",
        hydration: "Hydration Reminder", custom: "Care Coordinator",
      };
      await apiPost("/api/console/push", {
        userId: selectedPatientId, title: titleMap[pushCategory] || "Care Coordinator",
        body: pushBody, category: pushCategory,
      });
      setPushBody("");
      setActionStatus("Push sent");
      setTimeout(() => setActionStatus(null), 3000);
    } catch { setActionStatus("Push failed"); }
  }

  async function uploadHealthRecord(file: File) {
    if (!selectedPatientId) return;
    setUploading(true);
    try {
      await apiUpload(`/api/console/patients/${selectedPatientId}/health-records/upload`, file);
      setActionStatus("File uploaded — processing with AI");
      setTimeout(() => setActionStatus(null), 4000);
      // Poll for status updates
      const pollRecords = async () => {
        const records = await api(`/api/console/patients/${selectedPatientId}/health-records`).catch(() => []);
        setHealthRecords(records);
        if (records.some((r: HealthRecord) => r.status === "pending" || r.status === "processing")) {
          setTimeout(pollRecords, 3000);
        }
      };
      setTimeout(pollRecords, 2000);
    } catch {
      setActionStatus("Upload failed");
      setTimeout(() => setActionStatus(null), 3000);
    } finally {
      setUploading(false);
    }
  }

  async function requestCall() {
    if (!selectedPatientId) return;
    try {
      await apiPost("/api/console/call-request", { userId: selectedPatientId, reason: callReason || undefined });
      setCallReason("");
      setActionStatus("Call request sent");
      setTimeout(() => setActionStatus(null), 3000);
    } catch { setActionStatus("Call request failed"); }
  }

  if (!selectedPatientId) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="text-4xl mb-3 opacity-30">&#x1F4CB;</div>
          <h2 className="text-lg font-semibold text-slate-700">Select a Patient</h2>
          <p className="text-sm text-slate-400 mt-1">Choose a patient from the sidebar to view their health records</p>
        </div>
      </div>
    );
  }

  const profile = selectedPatient?.profile;
  const glp1Start = profile?.glp1StartDate ? new Date(profile.glp1StartDate) : null;
  const daysSinceStart = glp1Start ? Math.floor((Date.now() - glp1Start.getTime()) / 86400000) : null;
  const weekNumber = daysSinceStart !== null ? Math.ceil(daysSinceStart / 7) : null;

  return (
    <div className="space-y-4">
      {/* Demographics Bar */}
      {profile && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {profile.firstName} {profile.lastName}
              </h1>
              <div className="flex gap-4 mt-1 text-xs text-slate-600">
                <span>{profile.ageBracket}</span>
                <span>{profile.glp1Medication} {profile.glp1Dosage || ""}</span>
                {weekNumber && <span>Week {weekNumber} (Day {daysSinceStart})</span>}
                {profile.injectionDay && <span>Inj: {profile.injectionDay}</span>}
              </div>
            </div>
            <div className="text-right text-xs text-slate-500">
              {selectedPatient?.coordinator && <div>Coordinator: {selectedPatient.coordinator.name}</div>}
              {profile.phone && <div>{profile.phone}</div>}
            </div>
          </div>
          {(profile.conditions?.length > 0 || profile.currentSideEffects?.length > 0) && (
            <div className="flex gap-4 mt-2">
              {profile.conditions?.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium text-slate-700">Conditions: </span>
                  {profile.conditions.join(", ")}
                </div>
              )}
              {profile.currentSideEffects?.length > 0 && (
                <div className="text-xs">
                  <span className="font-medium text-slate-700">Side effects: </span>
                  {profile.currentSideEffects.join(", ")}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        {/* Main content */}
        <div className="col-span-9 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Tabs */}
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

          <div className="p-4">
            {loading ? (
              <div className="text-slate-400 text-sm py-8 text-center">Loading...</div>
            ) : (
              <>
                {activeTab === "ehr" && <EHRTab chartData={chartData} adherence={adherence} encounters={encounters} />}
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
                  <MonologueList monologue={monologue} expandedAction={expandedAction} setExpandedAction={setExpandedAction} />
                )}
                {activeTab === "preferences" && <PreferencesTab preferences={preferences} />}
              </>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="col-span-3 space-y-4">
          {actionStatus && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm px-3 py-2 rounded-lg">
              {actionStatus}
            </div>
          )}

          {/* Upload Medical Records */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 text-sm mb-2">Upload Medical Records</h3>
            <p className="text-xs text-slate-500 mb-3">PDF, images, or CCD/XML files (max 20MB)</p>
            <label className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
              uploading ? "border-blue-300 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-blue-50"
            }`}>
              {uploading ? (
                <span className="text-sm text-blue-600 flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                  Uploading...
                </span>
              ) : (
                <span className="text-sm text-slate-600">Choose file to upload</span>
              )}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png,.heic,.xml"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadHealthRecord(file);
                  e.target.value = "";
                }}
              />
            </label>
            {healthRecords.length > 0 && (
              <div className="mt-3 space-y-1.5">
                <div className="text-xs font-medium text-slate-700">{healthRecords.length} record{healthRecords.length !== 1 ? "s" : ""}</div>
                {healthRecords.map((r) => (
                  <div key={r.id} className="flex items-center justify-between text-xs bg-slate-50 rounded px-2 py-1.5">
                    <span className="text-slate-700 truncate max-w-[140px]" title={r.filename}>{r.filename}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      r.status === "processed" ? "bg-green-100 text-green-700" :
                      r.status === "processing" || r.status === "pending" ? "bg-amber-100 text-amber-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {r.status === "processed" ? "Done" : r.status === "processing" || r.status === "pending" ? "Processing" : r.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 text-sm mb-2">Send Message</h3>
            <div className="flex gap-2">
              <input type="text" value={overrideMessage} onChange={(e) => setOverrideMessage(e.target.value)}
                placeholder="As coordinator..." className="flex-1 text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900"
                onKeyDown={(e) => e.key === "Enter" && sendOverrideMessage()} />
              <button onClick={sendOverrideMessage} className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Send</button>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 text-sm mb-2">Push Notification</h3>
            <select value={pushCategory} onChange={(e) => setPushCategory(e.target.value)}
              className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 mb-2">
              {PUSH_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
            <textarea value={pushBody} onChange={(e) => setPushBody(e.target.value)}
              placeholder="Notification message..." rows={2}
              className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 mb-2 resize-none" />
            <button onClick={sendPushNotification} className="w-full px-3 py-1.5 bg-purple-600 text-white text-sm rounded-lg hover:bg-purple-700">Send Push</button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
            <h3 className="font-semibold text-slate-900 text-sm mb-2">Request Call</h3>
            <p className="text-xs text-slate-500 mb-2">Sends push to open voice call in patient&apos;s app</p>
            <input type="text" value={callReason} onChange={(e) => setCallReason(e.target.value)}
              placeholder="Reason (optional)..." className="w-full text-sm px-3 py-1.5 border border-slate-300 rounded-lg text-slate-900 mb-2" />
            <button onClick={requestCall} className="w-full px-3 py-1.5 bg-teal-600 text-white text-sm rounded-lg hover:bg-teal-700">Request Call</button>
          </div>

          {adherence && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
              <h3 className="font-semibold text-slate-900 text-sm mb-2">Adherence (30d)</h3>
              <div className="text-3xl font-bold text-slate-900">{adherence.rate}%</div>
              <div className="text-xs text-slate-500 mt-1">{adherence.totalTaken}/{adherence.totalScheduled} taken | {adherence.totalMissed} missed</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EHR Tab
// ---------------------------------------------------------------------------

function EHRTab({ chartData, adherence, encounters }: {
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
        <div className="text-slate-400 text-sm text-center py-8">No chart data or encounter notes yet</div>
      )}

      {weightData.length > 1 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Weight Trend (30d)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => d.slice(5)} />
              <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} labelFormatter={(d) => d} formatter={(v) => [`${v} lbs`, "Weight"]} />
              <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

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

      {encounters.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-slate-900 mb-2">Encounter Notes</h4>
          <div className="space-y-2">
            {encounters.map((enc) => (
              <div key={enc.id} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_COLORS[enc.urgency] || ""}`}>{enc.urgency}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{enc.source === "chat_summary" ? "Chat" : "Cron"}</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(enc.createdAt).toLocaleString()}</span>
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
// Timeline
// ---------------------------------------------------------------------------

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
          <div className="text-sm text-slate-700 mt-0.5">Duration: {data.durationSeconds || "\u2014"}s | {data.initiatedBy}</div>
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

// ---------------------------------------------------------------------------
// Monologue List
// ---------------------------------------------------------------------------

function MonologueList({ monologue, expandedAction, setExpandedAction }: {
  monologue: AiAction[];
  expandedAction: string | null;
  setExpandedAction: (id: string | null) => void;
}) {
  if (monologue.length === 0) return <div className="text-slate-400 text-sm">No AI actions yet</div>;

  return (
    <div className="space-y-3">
      {monologue.map((action) => (
        <div key={action.id} className="border border-slate-200 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className={`text-xs px-2 py-0.5 rounded-full ${URGENCY_COLORS[action.urgency] || ""}`}>{action.urgency}</span>
            <span className="text-xs text-slate-400">{new Date(action.createdAt).toLocaleString()}</span>
          </div>
          <div className="text-sm font-medium text-slate-900 mt-1">{action.assessment}</div>
          <div className="text-xs text-slate-500 mt-1">{action.action} | {action.source}{action.coordinatorPersona && ` | ${action.coordinatorPersona}`}</div>
          <button onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)} className="text-xs text-blue-600 mt-2 hover:underline">
            {expandedAction === action.id ? "Hide" : "Details"}
          </button>
          {expandedAction === action.id && (
            <div className="mt-2 space-y-2 text-xs">
              <div><span className="font-medium text-slate-700">Observation:</span><p className="text-slate-600 mt-0.5">{action.observation}</p></div>
              <div><span className="font-medium text-slate-700">Reasoning:</span><p className="text-slate-600 mt-0.5 whitespace-pre-wrap">{action.reasoning}</p></div>
              {action.messageContent && (
                <div><span className="font-medium text-slate-700">Message:</span><p className="text-slate-600 mt-0.5 bg-blue-50 p-2 rounded">{action.messageContent}</p></div>
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
  if (!preferences) return <div className="text-slate-400 text-sm text-center py-8">No preferences set yet</div>;

  const labelMap: Record<string, string> = {
    once_daily: "Once daily", twice_daily: "Twice daily", morning: "Morning", evening: "Evening",
    both: "Morning & Evening", daily: "Daily", every_2_days: "Every 2 days", every_3_days: "Every 3 days",
    weekly: "Weekly", text: "Text only", voice: "Voice only", daily_morning: "Daily (morning)",
    daily_evening: "Daily (evening)", weekly_only: "Weekly only", day1_chat: "Day 1 chat", api: "API",
  };
  const label = (v: string) => labelMap[v] || v;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-900">Patient Preferences</h4>
        <span className="text-[11px] text-slate-400">Set via {label(preferences.setVia)} &middot; Updated {new Date(preferences.updatedAt).toLocaleDateString()}</span>
      </div>

      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Check-ins</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Frequency" value={label(preferences.checkinFrequency)} />
          <PrefRow label="Time preference" value={label(preferences.checkinTimePreference)} />
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Medications</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Med reminders" value={preferences.medReminderEnabled ? "On" : "Off"} on={preferences.medReminderEnabled} />
          <PrefRow label="Night-before prep" value={preferences.medReminderPrepNightBefore ? "On" : "Off"} on={preferences.medReminderPrepNightBefore} />
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Hydration & Activity</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Hydration nudges" value={preferences.hydrationNudgesEnabled ? `On (${preferences.hydrationNudgesPerDay}/day)` : "Off"} on={preferences.hydrationNudgesEnabled} />
          <PrefRow label="Exercise nudges" value={preferences.exerciseNudgesEnabled ? "On" : "Off"} on={preferences.exerciseNudgesEnabled} />
          <PrefRow label="Weigh-in prompt" value={label(preferences.weighinPrompt)} />
          {preferences.glucoseAlertMode && <PrefRow label="Glucose alerts" value={preferences.glucoseAlertMode} />}
        </div>
      </div>

      <div className="border border-slate-200 rounded-lg p-3">
        <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">Communication</h5>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <PrefRow label="Preferred channel" value={label(preferences.preferredChannel)} />
          <PrefRow label="Voice call frequency" value={label(preferences.voiceCallFrequency)} />
          <PrefRow label="Quiet hours" value={`${preferences.quietStart} \u2013 ${preferences.quietEnd}`} />
        </div>
      </div>
    </div>
  );
}

function PrefRow({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${on === false ? "text-slate-400" : on === true ? "text-green-700" : "text-slate-900"}`}>{value}</span>
    </div>
  );
}
