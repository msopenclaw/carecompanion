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

export type DemoPhase = "idle" | "connecting" | "active" | "complete";

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
  startDemo: () => void;
  setPhaseActive: () => void;
  addTranscript: (speaker: "ai" | "patient", text: string) => void;
  addLog: (type: LogType, message: string, detail?: string) => void;
  triggerAlert: (severity: AlertSeverity, title: string) => void;
  updateBilling: (minutes: number) => void;
  endDemo: () => void;
  resetDemo: () => void;
  toggleLogs: () => void;
  toggleScript: () => void;
}

type DemoContextValue = DemoState & DemoActions;

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper: small random delay between lo and hi ms
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

  // Keep a ref-based counter for unique alert IDs
  const alertIdCounter = useRef(0);

  // Keep track of staged timeouts so we can clear on reset
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

  // ------ Staged event analysis based on transcript keywords ------

  const analyzeTranscript = useCallback(
    (text: string) => {
      const lower = text.toLowerCase();

      // Blood pressure / 155
      if (lower.includes("blood pressure") || lower.includes("155")) {
        const t1 = setTimeout(() => {
          pushLog("voice", "Transcription received");
        }, randomDelay(200, 400));

        const t2 = setTimeout(() => {
          pushLog(
            "nlp",
            "Intent: vital_reading_discussion (confidence: 0.96)",
          );
        }, randomDelay(400, 700));

        const t3 = setTimeout(() => {
          pushAlert("elevated", "BP reading 155/95 - above threshold");
        }, randomDelay(700, 1000));

        stagedTimeouts.current.push(t1, t2, t3);
      }

      // Medication non-adherence
      if (
        lower.includes("forgot") ||
        lower.includes("missed") ||
        lower.includes("didn't take")
      ) {
        const t1 = setTimeout(() => {
          pushLog(
            "nlp",
            "Intent: medication_non_adherence (confidence: 0.94)",
          );
        }, randomDelay(200, 450));

        const t2 = setTimeout(() => {
          pushLog("rules", "Composite rule: missed_dose + elevated_BP");
        }, randomDelay(450, 700));

        const t3 = setTimeout(() => {
          pushAlert("elevated", "Medication non-adherence detected");
        }, randomDelay(700, 1000));

        stagedTimeouts.current.push(t1, t2, t3);
      }

      // Clinical note / doctor
      if (
        lower.includes("note") ||
        lower.includes("doctor") ||
        lower.includes("dr. patel")
      ) {
        const t1 = setTimeout(() => {
          pushLog("ehr", "Draft clinical note generated for Dr. Patel");
        }, randomDelay(200, 500));

        const t2 = setTimeout(() => {
          pushLog("billing", "Interaction minutes logged: clinical review");
        }, randomDelay(500, 800));

        stagedTimeouts.current.push(t1, t2);
      }

      // Reminder / 6 PM
      if (lower.includes("reminder") || lower.includes("6 pm")) {
        const t1 = setTimeout(() => {
          pushLog(
            "ehr",
            "Medication reminder scheduled: Lisinopril 6:00 PM",
          );
        }, randomDelay(200, 500));

        const t2 = setTimeout(() => {
          pushLog("billing", "Care coordination event recorded");
        }, randomDelay(500, 800));

        stagedTimeouts.current.push(t1, t2);
      }
    },
    [pushLog, pushAlert],
  );

  // ------ Public actions ------

  const startDemo = useCallback(() => {
    setDemoPhase("connecting");
  }, []);

  const setPhaseActive = useCallback(() => {
    setDemoPhase("active");
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

  const triggerAlert = useCallback(
    (severity: AlertSeverity, title: string) => {
      pushAlert(severity, title);
    },
    [pushAlert],
  );

  const updateBilling = useCallback(
    (minutes: number) => {
      setBillingMinutes(minutes);

      // Check billing thresholds and unlock events
      if (minutes >= 20) {
        setBillingEvents((prev) => {
          const already = prev.find((e) => e.code === "99457");
          if (!already) {
            pushLog(
              "billing",
              "CPT 99457 threshold reached (20 min clinical time)",
            );
            return [
              ...prev,
              {
                code: "99457",
                description: "First 20 min RPM clinical time ($52)",
                unlocked: true,
                timestamp: new Date(),
              },
            ];
          }
          return prev;
        });
      }

      if (minutes >= 40) {
        setBillingEvents((prev) => {
          const already = prev.find((e) => e.code === "99458");
          if (!already) {
            pushLog(
              "billing",
              "CPT 99458 threshold reached (additional 20 min)",
            );
            return [
              ...prev,
              {
                code: "99458",
                description: "Additional 20 min RPM clinical time ($42)",
                unlocked: true,
                timestamp: new Date(),
              },
            ];
          }
          return prev;
        });
      }

      if (minutes >= 5) {
        setBillingEvents((prev) => {
          const already = prev.find((e) => e.code === "99454");
          if (!already) {
            pushLog(
              "billing",
              "CPT 99454 device supply threshold met (16+ days transmitting)",
            );
            return [
              ...prev,
              {
                code: "99454",
                description: "RPM device supply 16+ days ($55)",
                unlocked: true,
                timestamp: new Date(),
              },
            ];
          }
          return prev;
        });
      }
    },
    [pushLog],
  );

  const endDemo = useCallback(() => {
    setDemoPhase("complete");
  }, []);

  const resetDemo = useCallback(() => {
    // Clear all staged timeouts
    stagedTimeouts.current.forEach(clearTimeout);
    stagedTimeouts.current = [];

    // Reset all state
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

  const toggleLogs = useCallback(() => {
    setShowLogs((prev) => !prev);
  }, []);

  const toggleScript = useCallback(() => {
    setShowScript((prev) => !prev);
  }, []);

  // ------ Context value ------

  const value: DemoContextValue = {
    // State
    demoPhase,
    transcript,
    logs,
    alerts,
    billingMinutes,
    billingEvents,
    showLogs,
    showScript,
    // Actions
    startDemo,
    setPhaseActive,
    addTranscript,
    addLog,
    triggerAlert,
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
