"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Demo flow: idle → detecting → analyzing → calling → active → documenting → complete
export type DemoPhase =
  | "idle"         // All panels show baseline populated state
  | "detecting"    // BP rising on phone, flag appears on panel 2
  | "analyzing"    // AI thinking feed plays (user clicked flag)
  | "calling"      // AI initiates call to patient
  | "active"       // Voice call in progress
  | "documenting"  // Call ended, AI creating Epic note
  | "complete";    // Provider sees flag in Epic, can review & resolve

export interface TranscriptEntry {
  speaker: "ai" | "patient";
  text: string;
  timestamp: Date;
}

export type LogType = "voice" | "nlp" | "rules" | "alert" | "billing" | "ehr";

export interface LogEntry {
  type: LogType;
  message: string;
  timestamp: Date;
  detail?: string;
}

export type AlertSeverity = "critical" | "elevated" | "informational";

export interface AlertEntry {
  id: string;
  severity: AlertSeverity;
  title: string;
  status: "active" | "resolved";
  patientName: string;
  timestamp: Date;
  note?: string;
}

export interface BillingEvent {
  code: string;
  description: string;
  unlocked: boolean;
  timestamp: Date;
}

// ---------------------------------------------------------------------------
// AI Thinking steps (shown in panel 2 during "analyzing" phase)
// ---------------------------------------------------------------------------

export interface ThinkingStep {
  id: string;
  label: string;
  detail: string;
  icon: "vitals" | "meds" | "history" | "data" | "pattern" | "plan" | "call";
  durationMs: number; // how long this step takes to "complete"
}

export const AI_THINKING_STEPS: ThinkingStep[] = [
  {
    id: "step-1",
    label: "Analyzing vital trends",
    detail: "BP systolic: 132 → 142 → 155 mmHg (3-day upward trend detected). Diastolic: 85 → 90 → 95. Rate of change: +11.5 mmHg/day — exceeds threshold.",
    icon: "vitals",
    durationMs: 2000,
  },
  {
    id: "step-2",
    label: "Cross-referencing medication adherence",
    detail: "Evening Lisinopril 10mg: Missed 2 of last 3 doses (Day 5 evening, Day 6 evening). Morning dose adherence: 100%. Temporal correlation: BP rise begins within 24h of first missed dose.",
    icon: "meds",
    durationMs: 2200,
  },
  {
    id: "step-3",
    label: "Reviewing patient history",
    detail: "CHF diagnosis (ICD-10: I50.9) increases compound risk. Uncontrolled HTN + CHF = elevated risk for acute decompensation. Last hospitalization: 8 months ago (CHF exacerbation).",
    icon: "history",
    durationMs: 1800,
  },
  {
    id: "step-4",
    label: "Scanning 847 readings across 120 patients",
    detail: "Cross-patient analysis complete. No similar cluster detected in cohort. Margaret's pattern is isolated — not a device or environmental artifact. Confidence: high.",
    icon: "data",
    durationMs: 2500,
  },
  {
    id: "step-5",
    label: "Matching against historical patterns",
    detail: "Pattern match found: Oct 12-18, 2024 — same BP trajectory + missed doses. That episode resolved in 5 days after adherence restored. Similarity: 91%.",
    icon: "pattern",
    durationMs: 2000,
  },
  {
    id: "step-6",
    label: "Checking provider care plan",
    detail: "Dr. Patel's standing order (updated Jan 15): \"If BP >140 systolic for 2+ days with medication non-adherence, contact patient for verbal confirmation and set medication reminder. Flag for provider review.\"",
    icon: "plan",
    durationMs: 1800,
  },
  {
    id: "step-7",
    label: "Decision: Initiate proactive patient outreach",
    detail: "All criteria met. Initiating voice call to Margaret Chen to confirm missed doses, provide medication reminder, and collect verbal status update for clinical documentation.",
    icon: "call",
    durationMs: 1500,
  },
];

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

interface DemoState {
  demoPhase: DemoPhase;
  transcript: TranscriptEntry[];
  logs: LogEntry[];
  alerts: AlertEntry[];
  billingMinutes: number;
  billingEvents: BillingEvent[];
  showLogs: boolean;
  showScript: boolean;
}

interface DemoActions {
  startDemo: () => void;           // idle → detecting
  openAnalysis: () => void;        // detecting → analyzing
  triggerCall: () => void;         // analyzing → calling
  setPhaseActive: () => void;      // calling → active
  completeCall: () => void;        // active → documenting
  resolveCase: () => void;         // documenting → complete
  addTranscript: (speaker: "ai" | "patient", text: string) => void;
  addLog: (type: LogType, message: string, detail?: string) => void;
  triggerAlert: (severity: AlertSeverity, title: string) => void;
  updateBilling: (minutes: number) => void;
  endDemo: () => void;             // any → complete (backward compat)
  resetDemo: () => void;           // any → idle
  toggleLogs: () => void;
  toggleScript: () => void;
}

type DemoContextValue = DemoState & DemoActions;

// ---------------------------------------------------------------------------
// Helper: small random delay
// ---------------------------------------------------------------------------

function randomDelay(lo: number = 200, hi: number = 500): number {
  return lo + Math.random() * (hi - lo);
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const DemoContext = createContext<DemoContextValue | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DemoProvider({ children }: { children: ReactNode }) {
  const [demoPhase, setDemoPhase] = useState<DemoPhase>("idle");
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [billingMinutes, setBillingMinutes] = useState(0);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showScript, setShowScript] = useState(false);

  const alertIdCounter = useRef(0);
  const stagedTimeouts = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ------ Internal helpers ------

  const pushLog = useCallback(
    (type: LogType, message: string, detail?: string) => {
      setLogs((prev) => [
        ...prev,
        { type, message, timestamp: new Date(), detail },
      ]);
    },
    [],
  );

  const pushAlert = useCallback(
    (severity: AlertSeverity, title: string) => {
      alertIdCounter.current += 1;
      const id = `alert-${alertIdCounter.current}-${Date.now()}`;
      const entry: AlertEntry = {
        id,
        severity,
        title,
        status: "active",
        patientName: "Margaret Chen",
        timestamp: new Date(),
      };
      setAlerts((prev) => [...prev, entry]);
      pushLog("alert", `[${severity.toUpperCase()}] ${title}`);
    },
    [pushLog],
  );

  // ------ Transcript analysis (staged events) ------

  const analyzeTranscript = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();

      if (lower.includes("blood pressure") || lower.includes("155")) {
        const t1 = setTimeout(() => pushLog("voice", "Transcription received"), randomDelay(200, 400));
        const t2 = setTimeout(() => pushLog("nlp", "Intent: vital_reading_discussion (confidence: 0.96)"), randomDelay(400, 700));
        const t3 = setTimeout(() => pushAlert("elevated", "BP reading 155/95 - above threshold"), randomDelay(700, 1000));
        stagedTimeouts.current.push(t1, t2, t3);
      }

      if (lower.includes("forgot") || lower.includes("missed") || lower.includes("didn't take")) {
        const t1 = setTimeout(() => pushLog("nlp", "Intent: medication_non_adherence (confidence: 0.94)"), randomDelay(200, 450));
        const t2 = setTimeout(() => pushLog("rules", "Composite rule: missed_dose + elevated_BP"), randomDelay(450, 700));
        const t3 = setTimeout(() => pushAlert("elevated", "Medication non-adherence detected"), randomDelay(700, 1000));
        stagedTimeouts.current.push(t1, t2, t3);
      }

      if (lower.includes("note") || lower.includes("doctor") || lower.includes("dr. patel")) {
        const t1 = setTimeout(() => pushLog("ehr", "Draft clinical note generated for Dr. Patel"), randomDelay(200, 500));
        const t2 = setTimeout(() => pushLog("billing", "Interaction minutes logged: clinical review"), randomDelay(500, 800));
        stagedTimeouts.current.push(t1, t2);
      }

      if (lower.includes("reminder") || lower.includes("6 pm")) {
        const t1 = setTimeout(() => pushLog("ehr", "Medication reminder scheduled: Lisinopril 6:00 PM"), randomDelay(200, 500));
        const t2 = setTimeout(() => pushLog("billing", "Care coordination event recorded"), randomDelay(500, 800));
        stagedTimeouts.current.push(t1, t2);
      }
    },
    [pushLog, pushAlert],
  );

  // ------ Phase transitions ------

  const startDemo = useCallback(() => {
    setDemoPhase("detecting");
  }, []);

  const openAnalysis = useCallback(() => {
    setDemoPhase("analyzing");
  }, []);

  const triggerCallAction = useCallback(() => {
    setDemoPhase("calling");
  }, []);

  const setPhaseActive = useCallback(() => {
    setDemoPhase("active");
  }, []);

  const completeCall = useCallback(() => {
    setDemoPhase("documenting");
  }, []);

  const resolveCase = useCallback(() => {
    setDemoPhase("complete");
  }, []);

  const addTranscript = useCallback(
    (speaker: "ai" | "patient", text: string) => {
      setTranscript((prev) => [
        ...prev,
        { speaker, text, timestamp: new Date() },
      ]);
      analyzeTranscript(text);
    },
    [analyzeTranscript],
  );

  const addLog = useCallback(
    (type: LogType, message: string, detail?: string) => {
      pushLog(type, message, detail);
    },
    [pushLog],
  );

  const triggerAlertAction = useCallback(
    (severity: AlertSeverity, title: string) => {
      pushAlert(severity, title);
    },
    [pushAlert],
  );

  const updateBilling = useCallback(
    (minutes: number) => {
      setBillingMinutes(minutes);

      if (minutes >= 20) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99457")) return prev;
          pushLog("billing", "CPT 99457 threshold reached (20 min clinical time)");
          return [...prev, { code: "99457", description: "First 20 min RPM clinical time ($52)", unlocked: true, timestamp: new Date() }];
        });
      }
      if (minutes >= 40) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99458")) return prev;
          pushLog("billing", "CPT 99458 threshold reached (additional 20 min)");
          return [...prev, { code: "99458", description: "Additional 20 min RPM clinical time ($42)", unlocked: true, timestamp: new Date() }];
        });
      }
      if (minutes >= 5) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99454")) return prev;
          pushLog("billing", "CPT 99454 device supply threshold met (16+ days transmitting)");
          return [...prev, { code: "99454", description: "RPM device supply 16+ days ($55)", unlocked: true, timestamp: new Date() }];
        });
      }
    },
    [pushLog],
  );

  const endDemo = useCallback(() => {
    setDemoPhase("complete");
  }, []);

  const resetDemo = useCallback(() => {
    stagedTimeouts.current.forEach(clearTimeout);
    stagedTimeouts.current = [];
    setDemoPhase("idle");
    setTranscript([]);
    setLogs([]);
    setAlerts([]);
    setBillingMinutes(0);
    setBillingEvents([]);
    setShowLogs(false);
    setShowScript(false);
    alertIdCounter.current = 0;
  }, []);

  const toggleLogs = useCallback(() => setShowLogs((prev) => !prev), []);
  const toggleScript = useCallback(() => setShowScript((prev) => !prev), []);

  // ------ Context value ------

  const value: DemoContextValue = {
    demoPhase,
    transcript,
    logs,
    alerts,
    billingMinutes,
    billingEvents,
    showLogs,
    showScript,
    startDemo,
    openAnalysis,
    triggerCall: triggerCallAction,
    setPhaseActive,
    completeCall,
    resolveCase,
    addTranscript,
    addLog,
    triggerAlert: triggerAlertAction,
    updateBilling,
    endDemo,
    resetDemo,
    toggleLogs,
    toggleScript,
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDemo(): DemoContextValue {
  const ctx = useContext(DemoContext);
  if (!ctx) {
    throw new Error("useDemo must be used within a <DemoProvider>");
  }
  return ctx;
}
