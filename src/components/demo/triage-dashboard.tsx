"use client";

import { useState, useEffect, useRef } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TriageDashboardProps {
  patientId: string;
  onResolve?: () => void;
}

type Severity = "escalated" | "flagged" | "stable";

interface PatientRow {
  id: string;
  name: string;
  age: number;
  gender: "M" | "F";
  conditions: string[];
  severity: Severity;
  alertReason: string;
  transcript?: string[];
  clinicalNote?: string;
}

// ---------------------------------------------------------------------------
// Demo data
// ---------------------------------------------------------------------------

const STATS = {
  monitored: 1247,
  aiHandled: 1180,
  flagged: 62,
  escalated: 5,
};

const PATIENTS: PatientRow[] = [
  // ---- Escalated (red) ----
  {
    id: "p-001",
    name: "Margaret Chen",
    age: 74,
    gender: "F",
    conditions: ["HTN", "T2D"],
    severity: "escalated",
    alertReason: "BP trending \u2191 3 days \u2014 155/98 mmHg",
    transcript: [
      "AI: Good morning, Margaret. How are you feeling today?",
      "Margaret: I\u2019ve been having headaches the last couple days. I keep forgetting my evening pill.",
      "AI: I\u2019m sorry to hear that. Can you tell me which medication you\u2019ve been missing?",
      "Margaret: The blood pressure one\u2026 Lisinopril, I think. I missed it three nights in a row.",
    ],
    clinicalNote:
      "Patient Margaret Chen, 74 y/o F, reports missed evening Lisinopril dose \u00d73 days. BP trending upward: 138\u2192145\u2192155 mmHg systolic over 72h. AI assistant confirmed non-adherence via voice check-in. Patient reports associated headaches. Recommend: medication reconciliation call, consider dose adjustment or addition of evening alarm reminder. \u2014 CareCompanion AI Draft",
  },
  {
    id: "p-002",
    name: "James Rodriguez",
    age: 68,
    gender: "M",
    conditions: ["CHF"],
    severity: "escalated",
    alertReason: "Weight gain +4 lbs/week",
    transcript: [
      "AI: Hi James, I noticed your weight has gone up a bit this week. Have you noticed any swelling in your legs or ankles?",
      "James: Yeah, my shoes have been tight. And I\u2019ve been a little more winded than usual.",
      "AI: Thank you for sharing that. Have you been following your fluid restriction and low-sodium diet?",
      "James: I was at my daughter\u2019s birthday\u2026 probably had too much food this weekend.",
    ],
    clinicalNote:
      "Patient James Rodriguez, 68 y/o M, with CHF presenting weight gain of 4 lbs over 7 days (from 198 to 202 lbs). Reports bilateral lower extremity swelling and mild dyspnea on exertion. Admits dietary non-adherence over weekend. Daily weights: 198\u2192199\u2192200\u2192201\u2192202 lbs. Recommend: diuretic adjustment, dietary counseling reinforcement, consider telehealth visit within 24h. \u2014 CareCompanion AI Draft",
  },
  {
    id: "p-003",
    name: "Robert Kim",
    age: 81,
    gender: "M",
    conditions: ["COPD", "HTN"],
    severity: "escalated",
    alertReason: "SpO2 dropped to 89%",
    transcript: [
      "AI: Good afternoon, Robert. Your oxygen level is reading a bit lower than usual. How are you feeling?",
      "Robert: I\u2019m okay, just a little short of breath. Had some trouble sleeping last night.",
      "AI: Are you using your supplemental oxygen as prescribed?",
      "Robert: I took it off during the night\u2026 the tubing bothers me when I sleep.",
    ],
    clinicalNote:
      "Patient Robert Kim, 81 y/o M, with COPD. Pulse oximetry trending down: 94%\u219292%\u219289% over 48h. Patient reports dyspnea and poor sleep. Admits to removing supplemental O2 during nighttime hours. No fever or increased sputum production reported. Recommend: urgent telehealth visit, reinforce O2 compliance, evaluate for exacerbation, consider comfort-fit nasal cannula. \u2014 CareCompanion AI Draft",
  },
  {
    id: "p-004",
    name: "Dorothy Harris",
    age: 77,
    gender: "F",
    conditions: ["T2D", "CKD"],
    severity: "escalated",
    alertReason: "Blood glucose 312 mg/dL fasting",
    transcript: [
      "AI: Good morning, Dorothy. Your blood sugar reading this morning was quite high. Did you take your insulin last night?",
      "Dorothy: I ran out of my Lantus two days ago and haven\u2019t been able to get to the pharmacy.",
      "AI: I understand. Have you been feeling any unusual thirst or needing to urinate more often?",
      "Dorothy: Now that you mention it, yes. I\u2019ve been very thirsty.",
    ],
    clinicalNote:
      "Patient Dorothy Harris, 77 y/o F, with T2D and CKD Stage 3. Fasting glucose 312 mg/dL (baseline 130\u2013160). Patient ran out of Lantus insulin 2 days ago \u2014 reports inability to reach pharmacy. Symptoms: polydipsia, polyuria. No nausea or vomiting. Recommend: urgent Rx refill coordination, BMP to evaluate renal function and electrolytes, consider same-day telehealth visit. \u2014 CareCompanion AI Draft",
  },
  {
    id: "p-005",
    name: "William Turner",
    age: 72,
    gender: "M",
    conditions: ["AFib", "HTN"],
    severity: "escalated",
    alertReason: "Heart rate irregular, 112 bpm resting",
    transcript: [
      "AI: Hi William, your heart rate monitor is showing some irregularity today. How are you feeling?",
      "William: I\u2019ve been feeling fluttery in my chest since this morning. A bit dizzy too.",
      "AI: Have you taken your medications today, including your Eliquis?",
      "William: Yes, I took everything. This just started on its own.",
    ],
    clinicalNote:
      "Patient William Turner, 72 y/o M, with AFib and HTN. Resting HR 112 bpm with irregular rhythm detected by RPM device. Patient reports palpitations and mild dizziness since morning. Medication adherence confirmed (Eliquis, Metoprolol). BP 148/92. No syncope, chest pain, or dyspnea. Recommend: 12-lead ECG, evaluate rate control strategy, consider cardiology consult within 24h. \u2014 CareCompanion AI Draft",
  },
  // ---- Stable (green) ----
  {
    id: "p-006",
    name: "Helen Murray",
    age: 69,
    gender: "F",
    conditions: ["HTN"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-007",
    name: "Thomas Wright",
    age: 73,
    gender: "M",
    conditions: ["T2D"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-008",
    name: "Patricia Davis",
    age: 66,
    gender: "F",
    conditions: ["CHF"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-009",
    name: "George Anderson",
    age: 78,
    gender: "M",
    conditions: ["COPD"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-010",
    name: "Betty Cooper",
    age: 71,
    gender: "F",
    conditions: ["HTN", "T2D"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-011",
    name: "Frank Miller",
    age: 80,
    gender: "M",
    conditions: ["CKD"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-012",
    name: "Dorothy Wilson",
    age: 75,
    gender: "F",
    conditions: ["AFib"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-013",
    name: "Richard Lee",
    age: 67,
    gender: "M",
    conditions: ["HTN", "CHF"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-014",
    name: "Susan Baker",
    age: 72,
    gender: "F",
    conditions: ["T2D"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
  {
    id: "p-015",
    name: "Edward Scott",
    age: 83,
    gender: "M",
    conditions: ["COPD", "HTN"],
    severity: "stable",
    alertReason: "AI monitoring \u2014 no action needed",
  },
];

// ---------------------------------------------------------------------------
// Animated counter hook
// ---------------------------------------------------------------------------

function useCountUp(target: number, durationMs = 1400): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const start = performance.now();
    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(step);
      }
    };
    frameRef.current = requestAnimationFrame(step);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [target, durationMs]);

  return value;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatsBar() {
  const monitored = useCountUp(STATS.monitored);
  const aiHandled = useCountUp(STATS.aiHandled, 1600);
  const flagged = useCountUp(STATS.flagged, 1200);
  const escalated = useCountUp(STATS.escalated, 800);

  return (
    <div className="grid grid-cols-4 gap-3 px-5 py-4 bg-slate-900/60 border-b border-slate-700/60">
      {/* Monitored */}
      <div className="flex flex-col items-center rounded-lg bg-slate-800/50 px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">
          Patients Monitored
        </span>
        <span className="text-2xl font-bold text-white tabular-nums mt-0.5">
          {monitored.toLocaleString()}
        </span>
      </div>
      {/* AI-handled */}
      <div className="flex flex-col items-center rounded-lg bg-emerald-950/40 border border-emerald-800/30 px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-emerald-400 font-medium">
          AI-Handled
        </span>
        <span className="text-2xl font-bold text-emerald-300 tabular-nums mt-0.5">
          {aiHandled.toLocaleString()}
        </span>
      </div>
      {/* Flagged */}
      <div className="flex flex-col items-center rounded-lg bg-amber-950/40 border border-amber-800/30 px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-amber-400 font-medium">
          Flagged for Review
        </span>
        <span className="text-2xl font-bold text-amber-300 tabular-nums mt-0.5">
          {flagged.toLocaleString()}
        </span>
      </div>
      {/* Escalated */}
      <div className="flex flex-col items-center rounded-lg bg-red-950/40 border border-red-800/30 px-3 py-2.5">
        <span className="text-[11px] uppercase tracking-wider text-red-400 font-medium">
          Escalated
        </span>
        <span className="text-2xl font-bold text-red-300 tabular-nums mt-0.5">
          {escalated.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ConditionTag({ label }: { label: string }) {
  const colorMap: Record<string, string> = {
    HTN: "bg-violet-900/60 text-violet-300 border-violet-700/40",
    CHF: "bg-rose-900/60 text-rose-300 border-rose-700/40",
    T2D: "bg-sky-900/60 text-sky-300 border-sky-700/40",
    COPD: "bg-orange-900/60 text-orange-300 border-orange-700/40",
    CKD: "bg-teal-900/60 text-teal-300 border-teal-700/40",
    AFib: "bg-pink-900/60 text-pink-300 border-pink-700/40",
  };
  return (
    <span
      className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
        colorMap[label] || "bg-slate-700 text-slate-300 border-slate-600"
      }`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------

function ExpandedDetails({
  patient,
  onResolve,
}: {
  patient: PatientRow;
  onResolve?: () => void;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bg-slate-800/80 border-t border-slate-700/50 px-5 py-4 space-y-4 animate-in slide-in-from-top-1 duration-200">
      {/* Transcript */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
          AI Conversation Transcript
        </h4>
        <div className="bg-slate-900/70 rounded-lg p-3 space-y-1.5 text-sm font-mono border border-slate-700/40">
          {patient.transcript?.map((line, i) => {
            const isAI = line.startsWith("AI:");
            return (
              <p
                key={i}
                className={
                  isAI ? "text-blue-300/90" : "text-slate-300/90"
                }
              >
                <span
                  className={`font-semibold ${
                    isAI ? "text-blue-400" : "text-slate-200"
                  }`}
                >
                  {line.split(":")[0]}:
                </span>
                {line.substring(line.indexOf(":") + 1)}
              </p>
            );
          })}
        </div>
      </div>

      {/* Clinical Note */}
      <div>
        <h4 className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
          Drafted Clinical Note
        </h4>
        <div className="bg-white/[0.03] rounded-lg p-3 text-[13px] leading-relaxed text-slate-300 border border-slate-700/40 italic">
          {patient.clinicalNote} {today}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 pt-1">
        <button
          onClick={onResolve}
          className="px-3.5 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer"
        >
          Approve &amp; Send to EHR
        </button>
        <button className="px-3.5 py-1.5 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer">
          Call Patient
        </button>
        <button className="px-3.5 py-1.5 rounded-md bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer">
          Adjust Medications
        </button>
        <button className="px-3.5 py-1.5 rounded-md bg-slate-600 hover:bg-slate-500 text-white text-xs font-semibold tracking-wide transition-colors cursor-pointer">
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function BillingPredictor() {
  const billableMinutes = 14;
  const goalMinutes = 20;
  const pct = Math.round((billableMinutes / goalMinutes) * 100);

  return (
    <div className="mx-5 mb-4 mt-2 rounded-xl bg-gradient-to-br from-slate-800/80 to-slate-800/50 border border-slate-700/50 p-4">
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          Billing Predictor
        </h3>
        <span className="text-[10px] font-medium text-slate-500 bg-slate-700/40 px-2 py-0.5 rounded-full">
          CPT 99457
        </span>
      </div>

      {/* Progress label */}
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm text-slate-300 font-medium">
          Current billable minutes:{" "}
          <span className="text-white font-bold tabular-nums">
            {billableMinutes}
          </span>
          <span className="text-slate-500">/{goalMinutes}</span>
        </span>
        <span className="text-xs tabular-nums text-slate-400 font-semibold">
          {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 w-full bg-slate-700/60 rounded-full overflow-hidden mb-3">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Info text */}
      <p className="text-[12.5px] text-slate-400 leading-snug">
        <span className="text-amber-400 font-semibold">6 more minutes</span> of
        AI/staff interaction needed to unlock{" "}
        <span className="text-white font-semibold">CPT 99457</span>{" "}
        <span className="text-emerald-400 font-semibold">($52)</span>
      </p>

      <div className="mt-2.5 pt-2.5 border-t border-slate-700/40">
        <p className="text-xs text-slate-500">
          Monthly projection:{" "}
          <span className="text-emerald-400 font-bold text-sm">$14,200</span>{" "}
          <span className="text-slate-500">from 100 RPM patients</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function TriageDashboard({
  patientId,
  onResolve,
}: TriageDashboardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-white font-sans select-none">
      {/* ---- Header ---- */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-900 border-b border-slate-700/60">
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
            <svg
              className="w-4 h-4 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight text-white leading-none">
              CareCompanion
            </h1>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase mt-0.5">
              Clinician Triage Dashboard
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500 font-mono">
            ID: {patientId || "DEMO-001"}
          </span>
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wide">
              Live
            </span>
          </div>
        </div>
      </div>

      {/* ---- Stats ---- */}
      <StatsBar />

      {/* ---- Patient List ---- */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Column headers */}
        <div className="sticky top-0 z-10 grid grid-cols-[1fr_50px_140px_1fr_80px] gap-2 items-center px-5 py-2 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700/40 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
          <span>Patient</span>
          <span className="text-center">Age</span>
          <span>Conditions</span>
          <span>Status</span>
          <span className="text-center">Priority</span>
        </div>

        {PATIENTS.map((patient) => {
          const isEscalated = patient.severity === "escalated";
          const isExpanded = expandedId === patient.id;

          return (
            <div key={patient.id}>
              {/* Row */}
              <div
                onClick={() => isEscalated && toggleExpand(patient.id)}
                className={`
                  grid grid-cols-[1fr_50px_140px_1fr_80px] gap-2 items-center px-5 py-2.5
                  border-b border-slate-800/60 transition-colors
                  ${
                    isEscalated
                      ? "bg-red-950/20 hover:bg-red-950/35 cursor-pointer"
                      : "bg-transparent opacity-50 hover:opacity-65"
                  }
                  ${isExpanded ? "bg-red-950/40" : ""}
                `}
              >
                {/* Name */}
                <div className="flex items-center gap-2 min-w-0">
                  {isEscalated ? (
                    <span className="flex-shrink-0 w-2 h-2 rounded-full bg-red-500 shadow-sm shadow-red-500/50" />
                  ) : (
                    <svg
                      className="flex-shrink-0 w-3.5 h-3.5 text-emerald-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  )}
                  <span
                    className={`text-sm font-medium truncate ${
                      isEscalated ? "text-white" : "text-slate-400"
                    }`}
                  >
                    {patient.name}
                  </span>
                </div>

                {/* Age */}
                <span
                  className={`text-xs text-center tabular-nums ${
                    isEscalated ? "text-slate-300" : "text-slate-500"
                  }`}
                >
                  {patient.age}
                </span>

                {/* Conditions */}
                <div className="flex gap-1 flex-wrap">
                  {patient.conditions.map((c) => (
                    <ConditionTag key={c} label={c} />
                  ))}
                </div>

                {/* Alert / Status */}
                <span
                  className={`text-xs truncate ${
                    isEscalated
                      ? "text-red-300 font-medium"
                      : "text-emerald-600 font-normal"
                  }`}
                >
                  {patient.alertReason}
                </span>

                {/* Priority badge */}
                <div className="flex justify-center">
                  {isEscalated ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-900/60 text-red-300 border border-red-700/40">
                      <svg
                        className="w-2.5 h-2.5"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                          clipRule="evenodd"
                        />
                      </svg>
                      Urgent
                    </span>
                  ) : (
                    <span className="inline-flex text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-600 border border-emerald-800/30">
                      Stable
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded detail panel */}
              {isEscalated && isExpanded && (
                <ExpandedDetails patient={patient} onResolve={onResolve} />
              )}
            </div>
          );
        })}
      </div>

      {/* ---- Billing Predictor ---- */}
      <div className="border-t border-slate-700/60 pt-2 pb-1 bg-slate-900/80">
        <BillingPredictor />
      </div>
    </div>
  );
}
