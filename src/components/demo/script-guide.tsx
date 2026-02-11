"use client";

import { useDemo } from "./demo-context";

// ---------------------------------------------------------------------------
// Script data
// ---------------------------------------------------------------------------

interface ScriptStep {
  step: number;
  aiLine: string;
  patientLine: string;
}

const INCIDENT_STEPS: ScriptStep[] = [
  {
    step: 1,
    aiLine:
      '"Hi Margaret, I noticed you missed your check-in and your nausea has been increasing. How are you feeling?"',
    patientLine:
      '"The nausea has been terrible. I almost stopped taking the Wegovy altogether."',
  },
  {
    step: 2,
    aiLine:
      '"That\'s very common in the first week. Can I share some tips that help?"',
    patientLine:
      '"Yes please. I really want this to work but I feel awful."',
  },
  {
    step: 3,
    aiLine:
      '"Try smaller meals, ginger tea, and sipping water. I\'ll flag this for Dr. Patel too."',
    patientLine:
      '"That helps. I\'ll keep going with the medication."',
  },
];

const CHECKIN_STEPS: ScriptStep[] = [
  {
    step: 1,
    aiLine:
      '"Hi Margaret! Just checking in on your second day with Wegovy. How are you feeling?"',
    patientLine:
      '"I\'m feeling a little queasy, but nothing too bad."',
  },
  {
    step: 2,
    aiLine:
      '"That mild nausea is very common. Try eating smaller meals and sipping ginger tea."',
    patientLine:
      '"Okay, I\'ll try that. Thank you for checking on me."',
  },
  {
    step: 3,
    aiLine:
      '"Of course! Remember to log your check-in tomorrow. I\'m here anytime you need me."',
    patientLine: "",
  },
];

// ---------------------------------------------------------------------------
// ScriptGuide component
// ---------------------------------------------------------------------------

export function ScriptGuide() {
  const { showScript, toggleScript, currentDay } = useDemo();

  if (!showScript) return null;

  const isCheckIn = currentDay === 2;
  const steps = isCheckIn ? CHECKIN_STEPS : INCIDENT_STEPS;

  return (
    <>
      {/* Keyframe styles */}
      <style>{`
        @keyframes scriptFadeIn {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes backdropFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Semi-transparent backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
        onClick={toggleScript}
        style={{ animation: "backdropFadeIn 0.2s ease-out" }}
      >
        {/* Card */}
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
          style={{ animation: "scriptFadeIn 0.3s ease-out" }}
        >
          {/* Header */}
          <div className="px-5 pt-5 pb-3 flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </div>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">
                  Conversation Preview
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isCheckIn ? "Day 2 — Proactive check-in" : "Day 4 — Incident intervention"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleScript}
              className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100 -mt-1 -mr-1"
              aria-label="Close script guide"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Info banner */}
          <div className="px-5 pb-3">
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              <p className="text-[12px] text-blue-800 leading-relaxed">
                This conversation plays automatically with audio. No microphone needed &mdash;
                just watch and listen as the AI engages with Margaret.
              </p>
            </div>
          </div>

          {/* Scrollable script steps */}
          <div className="flex-1 overflow-y-auto px-5 pb-3">
            <div className="space-y-3">
              {steps.map(({ step, aiLine, patientLine }) => (
                <div key={step}>
                  {/* Step label */}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Exchange {step}
                  </p>

                  {/* AI says */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-1.5">
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-0.5">
                      CareCompanion AI
                    </p>
                    <p className="text-[12px] text-blue-700 italic leading-relaxed">
                      {aiLine}
                    </p>
                  </div>

                  {/* Patient says */}
                  {patientLine && (
                    <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-0.5">
                        Patient (Margaret)
                      </p>
                      <p className="text-[12px] text-slate-700 leading-relaxed">
                        {patientLine}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 pb-5 pt-2 border-t border-slate-100 mt-1">
            <button
              onClick={toggleScript}
              className="w-full bg-slate-900 text-white text-[13px] font-medium py-2.5 rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
