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
// Day 4 triggers the detecting→complete flow; other days stay idle
export type DemoPhase =
  | "idle"         // Panels show data for currentDay
  | "detecting"    // Day 4: engagement drop detected, flag appears
  | "analyzing"    // AI thinking feed plays
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
// 7-Day Clinical Data (GLP-1 / Wegovy Week 1)
// ---------------------------------------------------------------------------

export interface TextMessage {
  sender: "ai" | "patient";
  text: string;
}

export interface DayData {
  day: number;
  date: string;
  weight: number;
  bpSys: number;
  bpDia: number;
  glucose: number;
  nauseaGrade: number;   // 0-3
  fluidOz: number;
  checkInDone: boolean;
  engagementScore: number;
  textThread: TextMessage[];  // multi-turn text conversation (AI-initiated)
  patientInitThread?: TextMessage[];  // patient-initiated conversation (Days 5-7)
  isIncidentDay: boolean;
  isCallDay: boolean;     // true for days that trigger a voice call
}

// Helper to personalize text with patient's first name
export function personalizeText(text: string, firstName: string): string {
  return text.replace(/Margaret/g, firstName);
}

// Selected patient info (flows across all panels)
export interface SelectedPatient {
  firstName: string;
  lastName: string;
  age: number;
  gender: string;
  mrn: string;
}

const DEFAULT_PATIENT: SelectedPatient = {
  firstName: "Margaret",
  lastName: "Chen",
  age: 72,
  gender: "F",
  mrn: "847291",
};

export const DAY_DATA: DayData[] = [
  {
    day: 1,
    date: "Mon, Jul 7",
    weight: 247.2,
    bpSys: 142, bpDia: 88,
    glucose: 168,
    nauseaGrade: 0,
    fluidOz: 64,
    checkInDone: true,
    engagementScore: 92,
    textThread: [
      { sender: "ai", text: "Welcome to your Wegovy journey, Margaret! Your first injection is confirmed. How are you feeling?" },
      { sender: "patient", text: "Feeling good! No side effects yet. Took all my meds this morning." },
      { sender: "ai", text: "Great start! Remember to drink at least 64oz of water today. I'll check in tomorrow!" },
    ],
    isIncidentDay: false,
    isCallDay: false,
  },
  {
    day: 2,
    date: "Tue, Jul 8",
    weight: 247.0,
    bpSys: 138, bpDia: 86,
    glucose: 152,
    nauseaGrade: 1,
    fluidOz: 56,
    checkInDone: true,
    engagementScore: 85,
    textThread: [
      { sender: "ai", text: "Good morning Margaret! How are you feeling on Day 2? Any nausea or discomfort?" },
      { sender: "patient", text: "The nausea started this morning. I threw up after breakfast and I\u2019m honestly not sure I want to keep taking this medication..." },
      { sender: "ai", text: "I\u2019m sorry to hear that, Margaret. I\u2019m going to give you a quick call \u2014 I have some tips that really help. One moment." },
    ],
    isIncidentDay: false,
    isCallDay: true,
  },
  {
    day: 3,
    date: "Wed, Jul 9",
    weight: 246.4,
    bpSys: 136, bpDia: 84,
    glucose: 138,
    nauseaGrade: 2,
    fluidOz: 38,
    checkInDone: true,
    engagementScore: 60,
    textThread: [
      { sender: "ai", text: "Hi Margaret, Day 3 check-in. How's the nausea? Are you staying hydrated?" },
      { sender: "patient", text: "Nausea is worse today. Skipped dinner last night. Only had maybe 5 glasses of water." },
      { sender: "ai", text: "I'm sorry to hear that. Try bland foods \u2014 crackers, rice, toast \u2014 and sip water throughout the day. Your glucose is improving nicely though!" },
    ],
    isIncidentDay: false,
    isCallDay: false,
  },
  {
    day: 4,
    date: "Thu, Jul 10",
    weight: 246.0,
    bpSys: 134, bpDia: 82,
    glucose: 132,
    nauseaGrade: 2,
    fluidOz: 32,
    checkInDone: false,
    engagementScore: 41,
    textThread: [
      { sender: "ai", text: "Hi Margaret, Day 4 check-in. How\u2019s the nausea? Are you staying hydrated?" },
    ],
    isIncidentDay: true,
    isCallDay: true,
  },
  {
    day: 5,
    date: "Fri, Jul 11",
    weight: 246.1,
    bpSys: 130, bpDia: 80,
    glucose: 134,
    nauseaGrade: 1,
    fluidOz: 52,
    checkInDone: true,
    engagementScore: 78,
    textThread: [
      { sender: "ai", text: "Welcome back, Margaret! So glad we talked yesterday. How are you feeling today?" },
      { sender: "patient", text: "Much better! Ginger tea really helped. Had breakfast and lunch. About 6\u20137 glasses of water." },
      { sender: "ai", text: "Wonderful progress! Keep following those small-meals tips. You're doing great!" },
    ],
    patientInitThread: [
      { sender: "patient", text: "Hey, just wanted to share \u2014 I had ginger tea this morning and it really helped! Feeling so much better than yesterday." },
      { sender: "ai", text: "That's wonderful to hear, Margaret! Your nausea is definitely resolving. Keep up the hydration \u2014 you're at 52oz today!" },
    ],
    isIncidentDay: false,
    isCallDay: false,
  },
  {
    day: 6,
    date: "Sat, Jul 12",
    weight: 245.9,
    bpSys: 128, bpDia: 78,
    glucose: 130,
    nauseaGrade: 0,
    fluidOz: 60,
    checkInDone: true,
    engagementScore: 88,
    textThread: [
      { sender: "ai", text: "Good morning! Day 6 \u2014 how's the nausea today?" },
      { sender: "patient", text: "Feeling normal today! Ate all three meals, took all my meds, and drinking lots of water." },
      { sender: "ai", text: "That's fantastic! Your body is adjusting beautifully to Wegovy. Keep it up!" },
    ],
    patientInitThread: [
      { sender: "patient", text: "I walked 20 minutes today! First real exercise since starting Wegovy. Feeling more like myself \ud83d\ude0a" },
      { sender: "ai", text: "That's amazing progress, Margaret! Light exercise is great at this stage. Your weight is down 1.3 lbs and BP is improving too!" },
    ],
    isIncidentDay: false,
    isCallDay: false,
  },
  {
    day: 7,
    date: "Sun, Jul 13",
    weight: 245.6,
    bpSys: 130, bpDia: 80,
    glucose: 128,
    nauseaGrade: 0,
    fluidOz: 64,
    checkInDone: true,
    engagementScore: 94,
    textThread: [
      { sender: "ai", text: "Week 1 complete! You've lost 1.6 lbs and your glucose improved 24%. How are you feeling about continuing?" },
      { sender: "patient", text: "Really good! Glad I didn't quit on Day 4. Thank you for calling me that day." },
      { sender: "ai", text: "You did amazingly well, Margaret. Next injection is tomorrow \u2014 same dose for 3 more weeks. I've sent a summary to Dr. Patel." },
    ],
    patientInitThread: [
      { sender: "patient", text: "Dr. Patel's office called about the summary you sent. Thank you for keeping them in the loop!" },
      { sender: "ai", text: "Of course! Dr. Patel will review your Week 1 progress at your next visit. You should be very proud \u2014 amazing first week!" },
    ],
    isIncidentDay: false,
    isCallDay: false,
  },
];

// ---------------------------------------------------------------------------
// AI Thinking steps (shown in panel 2 during "analyzing" phase on Day 4)
// ---------------------------------------------------------------------------

export interface ThinkingStep {
  id: string;
  label: string;
  detail: string;
  icon: "vitals" | "meds" | "history" | "data" | "pattern" | "plan" | "call";
  durationMs: number;
}

export const AI_THINKING_STEPS: ThinkingStep[] = [
  {
    id: "step-1",
    label: "Analyzing daily engagement pattern",
    detail: "Check-in completion: Day 1: 100%, Day 2: 100%, Day 3: 100%, Day 4: MISSED. Engagement score: 92 \u2192 85 \u2192 60 \u2192 41. 3-day declining trend with first missed check-in \u2014 triggers outreach protocol.",
    icon: "vitals",
    durationMs: 2000,
  },
  {
    id: "step-2",
    label: "Cross-referencing GI symptom reports",
    detail: "Day 2: Nausea Grade 1 (mild). Day 3: Nausea Grade 2 (moderate), food intake reduced ~50%, fluid intake 38oz (below 48oz minimum). Escalating GI pattern consistent with semaglutide 0.25mg initiation.",
    icon: "meds",
    durationMs: 2200,
  },
  {
    id: "step-3",
    label: "Reviewing medication interactions",
    detail: "Active meds: Semaglutide 0.25mg (new, Day 4), Metformin 1000mg BID, Lisinopril 20mg daily. Semaglutide + Metformin = additive GI risk. Lisinopril + dehydration from GI loss = acute kidney injury risk factor.",
    icon: "history",
    durationMs: 1800,
  },
  {
    id: "step-4",
    label: "Scanning 250 GLP-1 patient cohort",
    detail: "Pattern match: 34% of patients on semaglutide 0.25mg report nausea-driven disengagement in week 1. Of those, 68% who receive proactive outreach within 48h maintain program adherence vs. 23% without.",
    icon: "data",
    durationMs: 2500,
  },
  {
    id: "step-5",
    label: "Assessing dehydration risk",
    detail: "Fluid intake trending down: 64oz \u2192 56oz \u2192 38oz \u2192 est. <32oz today. Combined with Lisinopril 20mg + age 72 + eGFR 58 mL/min (CKD Stage 3a) = elevated acute kidney injury risk. Urgent hydration intervention needed.",
    icon: "pattern",
    durationMs: 2000,
  },
  {
    id: "step-6",
    label: "Checking provider protocol",
    detail: "Dr. Patel\u2019s GLP-1 standing order (updated Jan 2026): \"If GI symptoms persist 3+ days or patient misses daily check-in during initiation, initiate proactive outreach. Consider ondansetron PRN if nausea Grade 2+. Flag for review.\"",
    icon: "plan",
    durationMs: 1800,
  },
  {
    id: "step-7",
    label: "Decision: Initiate proactive engagement call",
    detail: "All criteria met: missed check-in + escalating nausea (Grade 2) + dehydration risk + provider protocol match. Initiating voice call to Margaret Chen for GI symptom management and re-engagement.",
    icon: "call",
    durationMs: 1500,
  },
];

// ---------------------------------------------------------------------------
// Day 2 AI Thinking steps (triggered by Margaret's concerning text)
// ---------------------------------------------------------------------------

export const AI_THINKING_STEPS_DAY2: ThinkingStep[] = [
  {
    id: "d2-1",
    label: "Analyzing text sentiment",
    detail: "Patient message: \"threw up after breakfast... not sure I want to keep taking this medication.\" Sentiment: negative. Discontinuation risk: HIGH (0.91 confidence).",
    icon: "vitals",
    durationMs: 1800,
  },
  {
    id: "d2-2",
    label: "Cross-referencing symptom trajectory",
    detail: "Day 1: no symptoms. Day 2: nausea Grade 1 \u2192 vomiting reported. Rapid escalation in 24h consistent with semaglutide GI initiation pattern. 34% of patients experience this.",
    icon: "meds",
    durationMs: 1500,
  },
  {
    id: "d2-3",
    label: "Checking proactive outreach protocol",
    detail: "Patient expressed discontinuation intent via text. Per Dr. Patel\u2019s standing order: immediate voice outreach when patient signals medication cessation within initiation window.",
    icon: "plan",
    durationMs: 1500,
  },
  {
    id: "d2-4",
    label: "Decision: Initiate proactive engagement call",
    detail: "Discontinuation risk detected in text. Calling Margaret to provide nausea management coaching and encourage continuation. Coaching topics: small meals, ginger tea, hydration.",
    icon: "call",
    durationMs: 1200,
  },
];

// ---------------------------------------------------------------------------
// Daily AI Thinking Steps (shown for ALL days — daily monitoring routine)
// Non-call days end with "no action needed"; call days end with "initiate call"
// ---------------------------------------------------------------------------

export const DAILY_THINKING_STEPS: Record<number, ThinkingStep[]> = {
  1: [
    {
      id: "d1-1",
      label: "Reviewing new patient onboarding data",
      detail: "Margaret Chen initiated Wegovy 0.25mg today. Vitals baseline: Weight 247.2 lbs, BP 142/88, Glucose 168 mg/dL. All medications confirmed: Metformin 1000mg BID, Lisinopril 20mg daily.",
      icon: "vitals",
      durationMs: 1800,
    },
    {
      id: "d1-2",
      label: "Analyzing medication interaction risks",
      detail: "Semaglutide + Metformin: additive GI risk (monitor nausea). Semaglutide + Lisinopril: monitor renal function if dehydration occurs. Standard GLP-1 initiation monitoring protocol activated.",
      icon: "meds",
      durationMs: 1600,
    },
    {
      id: "d1-3",
      label: "Decision: Normal monitoring — send welcome text",
      detail: "All vitals within acceptable range. Engagement score: 92%. No risk factors detected. Sending welcome check-in message. Next review: Day 2.",
      icon: "plan",
      durationMs: 1200,
    },
  ],
  2: AI_THINKING_STEPS_DAY2,
  3: [
    {
      id: "d3-1",
      label: "Reviewing 3-day engagement trend",
      detail: "Engagement: 92% → 85% → 60%. Declining but patient still responding to texts. Nausea Grade 2 (moderate), food intake reduced ~50%. Check-in completed.",
      icon: "vitals",
      durationMs: 1800,
    },
    {
      id: "d3-2",
      label: "Cross-referencing dehydration markers",
      detail: "Fluid intake 38oz (below 48oz minimum). Weight down 0.8 lbs in 2 days. Combined with Lisinopril + age 72 — monitoring renal risk. Not yet at intervention threshold.",
      icon: "pattern",
      durationMs: 1600,
    },
    {
      id: "d3-3",
      label: "Checking GI escalation protocol",
      detail: "Nausea Grade 2 at Day 3 is within expected range for semaglutide initiation. 34% of patients experience this. Patient still engaged via text and reporting symptoms.",
      icon: "meds",
      durationMs: 1400,
    },
    {
      id: "d3-4",
      label: "Decision: Continue monitoring — send coaching text",
      detail: "Symptoms concerning but patient engaged. Sending hydration and dietary coaching text. Flagged for automatic escalation if engagement drops below 50% or check-in missed tomorrow.",
      icon: "plan",
      durationMs: 1200,
    },
  ],
  4: AI_THINKING_STEPS,
  5: [
    {
      id: "d5-1",
      label: "Reviewing post-outreach engagement",
      detail: "Engagement score rebounded: 41% → 78%. Check-in completed. Nausea Grade 1 (improving). Fluid intake up to 52oz. Patient proactively reporting improvement.",
      icon: "vitals",
      durationMs: 1600,
    },
    {
      id: "d5-2",
      label: "Analyzing re-engagement indicators",
      detail: "Patient texting proactively (positive sentiment: \"ginger tea helped!\"). Oral intake recovering. All medications taken. Proactive outreach on Day 4 successfully prevented discontinuation.",
      icon: "data",
      durationMs: 1500,
    },
    {
      id: "d5-3",
      label: "Decision: Re-engagement successful — standard monitoring",
      detail: "Intervention on Day 4 was effective. Continue daily check-ins. No escalation needed. Preparing positive progress update for patient.",
      icon: "plan",
      durationMs: 1200,
    },
  ],
  6: [
    {
      id: "d6-1",
      label: "Analyzing symptom resolution trend",
      detail: "Nausea Grade 0 — fully resolved. All meals consumed. Engagement 88%. BP improving: 128/78 mmHg. Weight: 245.9 lbs (-1.3 lbs from baseline).",
      icon: "vitals",
      durationMs: 1600,
    },
    {
      id: "d6-2",
      label: "Checking GLP-1 adherence trajectory",
      detail: "On track for Week 2 injection. 5 of 6 check-ins completed. Patient resumed exercise (20 min walk). Fluid intake normalized at 60oz. GI tolerance achieved.",
      icon: "data",
      durationMs: 1500,
    },
    {
      id: "d6-3",
      label: "Decision: Excellent progress — preparing Week 1 summary",
      detail: "Patient fully re-engaged. GI side effects resolved. Compiling clinical outcomes for Dr. Patel's review. Continue standard monitoring.",
      icon: "plan",
      durationMs: 1200,
    },
  ],
  7: [
    {
      id: "d7-1",
      label: "Compiling Week 1 clinical outcomes",
      detail: "Weight: -1.6 lbs (247.2→245.6). Glucose: -24% (168→128 mg/dL). BP: 142/88→130/80. Nausea resolved. 7-day engagement rate: 94%. Critical event Day 4 resolved via AI outreach.",
      icon: "vitals",
      durationMs: 1800,
    },
    {
      id: "d7-2",
      label: "Generating provider summary for Dr. Patel",
      detail: "Week 1 summary includes: vitals trends, GI symptom timeline, intervention log (Day 2 proactive call, Day 4 incident call), medication adherence, and patient self-reported outcomes.",
      icon: "history",
      durationMs: 1600,
    },
    {
      id: "d7-3",
      label: "Calculating program billing & ROI",
      detail: "CPT codes captured: 99457 ($52), 99490 ($64), 99453 ($19), 99454 ($55). Total: $190/patient/month. Projected annual: $2,280/patient × 250 patients = $570,000.",
      icon: "data",
      durationMs: 1500,
    },
    {
      id: "d7-4",
      label: "Decision: Week 1 complete — summary sent to provider",
      detail: "Clinical summary transmitted to Dr. Patel via EHR. Patient maintained on Wegovy 0.25mg. Next injection scheduled. Continue Week 2 monitoring protocol.",
      icon: "plan",
      durationMs: 1200,
    },
  ],
};

// ---------------------------------------------------------------------------
// Call Reasoning Steps (internal AI reasoning shown during active voice calls)
// Replaces live transcript on Clinical Intelligence panel
// ---------------------------------------------------------------------------

export const CALL_REASONING_STEPS: Record<number, ThinkingStep[]> = {
  2: [
    {
      id: "cr2-1",
      label: "Assessing patient emotional state",
      detail: "Voice stress indicators: elevated. Patient reports vomiting and expresses discontinuation intent: \"thinking about stopping.\" Frustration level: moderate. Immediate de-escalation needed.",
      icon: "vitals",
      durationMs: 4000,
    },
    {
      id: "cr2-2",
      label: "Deploying empathetic coaching protocol",
      detail: "Strategy: normalize GI side effects (34% incidence in week 1), cite clinical data on resolution timeline, provide actionable self-care tips. Tone: patient, calm, encouraging.",
      icon: "plan",
      durationMs: 5000,
    },
    {
      id: "cr2-3",
      label: "Monitoring de-escalation signals",
      detail: "Patient receptive to tips. Key phrase detected: \"I really want this to work\" — commitment indicator. Voice stress decreasing. Discontinuation risk dropping: 0.91 → 0.34.",
      icon: "pattern",
      durationMs: 4500,
    },
    {
      id: "cr2-4",
      label: "Scheduling follow-up touchpoint",
      detail: "Patient agreed to continue Wegovy. Coaching delivered: small meals, ginger tea, hydration. Setting Day 3 check-in. Proactive outreach successful — no provider escalation needed.",
      icon: "history",
      durationMs: 3000,
    },
  ],
  4: [
    {
      id: "cr4-1",
      label: "Assessing patient emotional state",
      detail: "Voice stress indicators: elevated. Patient reports near-discontinuation: \"almost stopped taking it altogether.\" 3-day frustration accumulation detected. Critical re-engagement moment.",
      icon: "vitals",
      durationMs: 4000,
    },
    {
      id: "cr4-2",
      label: "Cross-referencing real-time vitals with conversation",
      detail: "Fluid intake critically low (est. <32oz). Combined with Lisinopril 20mg + age 72 + eGFR 58 = elevated AKI risk. Urgent hydration intervention woven into coaching.",
      icon: "meds",
      durationMs: 4500,
    },
    {
      id: "cr4-3",
      label: "Deploying empathetic coaching protocol",
      detail: "Normalizing GI side effects with clinical data. Citing Week 1 resolution timeline. Positive reinforcement: weight already down 1.2 lbs, glucose improving. Patient responding positively.",
      icon: "plan",
      durationMs: 5000,
    },
    {
      id: "cr4-4",
      label: "Monitoring re-engagement signals",
      detail: "Patient tone shifting: frustration → hope. Key phrases: \"I want this to work,\" \"yes please.\" Re-engagement probability: 87%. Discontinuation risk: 0.91 → 0.22.",
      icon: "pattern",
      durationMs: 4000,
    },
    {
      id: "cr4-5",
      label: "Generating clinical documentation",
      detail: "Drafting AI summary for Dr. Patel. Flagging ondansetron 4mg PRN consideration. Scheduling Day 5 follow-up. Creating Epic BPA for provider review and action.",
      icon: "history",
      durationMs: 3500,
    },
  ],
};

// ---------------------------------------------------------------------------
// Context value shape
// ---------------------------------------------------------------------------

interface DemoState {
  demoPhase: DemoPhase;
  currentDay: number;       // 0 = pre-demo, 1-7 = active simulation day
  selectedPatient: SelectedPatient;
  transcript: TranscriptEntry[];
  logs: LogEntry[];
  alerts: AlertEntry[];
  billingMinutes: number;
  billingEvents: BillingEvent[];
  showLogs: boolean;
  showScript: boolean;
}

interface DemoActions {
  setSelectedPatient: (patient: SelectedPatient) => void;
  advanceDay: () => void;        // advance to next day (Day 4 triggers detecting)
  startDemo: () => void;         // backward compat — same as advanceDay from day 0
  openAnalysis: () => void;      // detecting → analyzing
  triggerCall: () => void;       // analyzing → calling
  setPhaseActive: () => void;    // calling → active
  completeCall: () => void;      // active → documenting
  completeAnalysis: () => void;       // analyzing → idle (non-call days)
  completeProactiveCall: () => void;  // calling/active → idle (Day 2 check-in)
  resolveCase: () => void;       // documenting → complete
  addTranscript: (speaker: "ai" | "patient", text: string) => void;
  addLog: (type: LogType, message: string, detail?: string) => void;
  triggerAlert: (severity: AlertSeverity, title: string) => void;
  updateBilling: (minutes: number) => void;
  endDemo: () => void;           // any → complete (backward compat)
  resetDemo: () => void;         // any → idle, day → 0
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
  const [currentDay, setCurrentDay] = useState(0);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);
  const [billingMinutes, setBillingMinutes] = useState(0);
  const [billingEvents, setBillingEvents] = useState<BillingEvent[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [selectedPatient, setSelectedPatientState] = useState<SelectedPatient>(DEFAULT_PATIENT);

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

      if (lower.includes("nausea") || lower.includes("sick") || lower.includes("throw up") || lower.includes("vomit")) {
        const t1 = setTimeout(() => pushLog("voice", "Transcription received"), randomDelay(200, 400));
        const t2 = setTimeout(() => pushLog("nlp", "Intent: GI_symptom_report (confidence: 0.95)"), randomDelay(400, 700));
        const t3 = setTimeout(() => pushAlert("elevated", "Nausea reported \u2014 GI management needed"), randomDelay(700, 1000));
        stagedTimeouts.current.push(t1, t2, t3);
      }

      if (lower.includes("stopped") || lower.includes("quit") || lower.includes("skip") || lower.includes("can't eat")) {
        const t1 = setTimeout(() => pushLog("nlp", "Intent: treatment_discontinuation_risk (confidence: 0.93)"), randomDelay(200, 450));
        const t2 = setTimeout(() => pushLog("rules", "Composite: GI symptoms + disengagement + dehydration risk"), randomDelay(450, 700));
        const t3 = setTimeout(() => pushAlert("elevated", "GLP-1 adherence risk detected"), randomDelay(700, 1000));
        stagedTimeouts.current.push(t1, t2, t3);
      }

      if (lower.includes("note") || lower.includes("doctor") || lower.includes("dr. patel")) {
        const t1 = setTimeout(() => pushLog("ehr", "Draft clinical note generated for Dr. Patel"), randomDelay(200, 500));
        const t2 = setTimeout(() => pushLog("billing", "Interaction minutes logged: clinical review"), randomDelay(500, 800));
        stagedTimeouts.current.push(t1, t2);
      }

      if (lower.includes("ginger") || lower.includes("small meals") || lower.includes("hydrat") || lower.includes("water")) {
        const t1 = setTimeout(() => pushLog("ehr", "Self-care guidance documented: anti-nausea strategies"), randomDelay(200, 500));
        const t2 = setTimeout(() => pushLog("billing", "Care coordination event recorded"), randomDelay(500, 800));
        stagedTimeouts.current.push(t1, t2);
      }
    },
    [pushLog, pushAlert],
  );

  // ------ Day advancement ------

  const advanceDay = useCallback(() => {
    // Clear any pending staged timeouts from previous day
    stagedTimeouts.current.forEach(clearTimeout);
    stagedTimeouts.current = [];

    setCurrentDay((prev) => {
      const next = prev + 1;
      if (next > 7) return prev; // already at day 7
      if (next === 4) {
        // Day 4: trigger the AI incident flow — detecting → analyzing
        setDemoPhase("detecting");
        const t = setTimeout(() => setDemoPhase("analyzing"), 3500);
        stagedTimeouts.current.push(t);
      } else if (next === 2) {
        // Day 2: start idle — text plays first, then analysis triggers after texting
        setDemoPhase("idle");
      } else {
        // Days 1, 3, 5, 6, 7: start with AI analyzing (daily monitoring)
        // After analysis completes → idle → text notification plays
        setDemoPhase("analyzing");
      }
      return next;
    });
  }, []);

  // ------ Phase transitions ------

  const startDemo = useCallback(() => {
    // Backward compat: if at day 0, advance to day 1; if at day 4 idle, start detecting
    advanceDay();
  }, [advanceDay]);

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

  const completeAnalysis = useCallback(() => {
    setDemoPhase("idle");
  }, []);

  const completeProactiveCall = useCallback(() => {
    setDemoPhase("idle");
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

      if (minutes >= 5) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99453")) return prev;
          pushLog("billing", "CPT 99453 \u2014 RPM setup & patient education");
          return [...prev, { code: "99453", description: "RPM setup & patient education ($19)", unlocked: true, timestamp: new Date() }];
        });
      }
      if (minutes >= 10) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99454")) return prev;
          pushLog("billing", "CPT 99454 \u2014 RPM device supply (16+ days transmitting)");
          return [...prev, { code: "99454", description: "RPM device supply 16+ days ($55)", unlocked: true, timestamp: new Date() }];
        });
      }
      if (minutes >= 20) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99457")) return prev;
          pushLog("billing", "CPT 99457 \u2014 First 20 min clinical time");
          return [...prev, { code: "99457", description: "First 20 min RPM clinical time ($52)", unlocked: true, timestamp: new Date() }];
        });
      }
      if (minutes >= 25) {
        setBillingEvents((prev) => {
          if (prev.find((e) => e.code === "99490")) return prev;
          pushLog("billing", "CPT 99490 \u2014 Chronic care management (GLP-1 support)");
          return [...prev, { code: "99490", description: "CCM first 20 min ($64)", unlocked: true, timestamp: new Date() }];
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
    setCurrentDay(0);
    setTranscript([]);
    setLogs([]);
    setAlerts([]);
    setBillingMinutes(0);
    setBillingEvents([]);
    setShowLogs(false);
    setShowScript(false);
    alertIdCounter.current = 0;
  }, []);

  const setSelectedPatient = useCallback((patient: SelectedPatient) => {
    setSelectedPatientState(patient);
  }, []);

  const toggleLogs = useCallback(() => setShowLogs((prev) => !prev), []);
  const toggleScript = useCallback(() => setShowScript((prev) => !prev), []);

  // ------ Context value ------

  const value: DemoContextValue = {
    demoPhase,
    currentDay,
    selectedPatient,
    transcript,
    logs,
    alerts,
    billingMinutes,
    billingEvents,
    showLogs,
    showScript,
    setSelectedPatient,
    advanceDay,
    startDemo,
    openAnalysis,
    completeAnalysis,
    triggerCall: triggerCallAction,
    setPhaseActive,
    completeCall,
    completeProactiveCall,
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
