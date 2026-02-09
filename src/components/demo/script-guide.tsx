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

const SCRIPT_STEPS: ScriptStep[] = [
  {
    step: 1,
    aiLine:
      '"Good morning, Margaret. I noticed your blood pressure was 155/95 this morning..."',
    patientLine:
      '"Oh, I think I forgot to take my medication. I was rushing to see my grandson."',
  },
  {
    step: 2,
    aiLine: '"No worries! Go ahead and take it now..."',
    patientLine:
      '"Better add a note for the doctor. I\'ve been forgetting more lately."',
  },
  {
    step: 3,
    aiLine: '"Done! I\'ve flagged this for Dr. Patel..."',
    patientLine: '"Thank you, that\'s very helpful."',
  },
];

// ---------------------------------------------------------------------------
// ScriptGuide component
// ---------------------------------------------------------------------------

export function ScriptGuide() {
  const { showScript, toggleScript } = useDemo();

  if (!showScript) return null;

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
              <span className="text-2xl" role="img" aria-label="Theater mask">
                🎭
              </span>
              <div>
                <h2 className="text-[15px] font-semibold text-slate-900">
                  Your Script
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  You are the patient
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

          {/* Scene description */}
          <div className="px-5 pb-3">
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5">
              <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide mb-1">
                Scene
              </p>
              <p className="text-[12px] text-amber-900 leading-relaxed">
                You&rsquo;re Margaret Chen, 74, at home. The AI health companion
                calls you about your morning blood pressure reading.
              </p>
            </div>
          </div>

          {/* Scrollable script steps */}
          <div className="flex-1 overflow-y-auto px-5 pb-3">
            <div className="space-y-3">
              {SCRIPT_STEPS.map(({ step, aiLine, patientLine }) => (
                <div key={step}>
                  {/* Step label */}
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
                    Step {step}
                  </p>

                  {/* AI says */}
                  <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-1.5">
                    <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide mb-0.5">
                      AI Says
                    </p>
                    <p className="text-[12px] text-blue-700 italic leading-relaxed">
                      {aiLine}
                    </p>
                  </div>

                  {/* Patient says */}
                  <div className="bg-green-50 border-2 border-green-200 rounded-lg px-3 py-2">
                    <p className="text-[10px] font-semibold text-green-500 uppercase tracking-wide mb-0.5">
                      You Say
                    </p>
                    <p className="text-[13px] text-green-900 font-bold leading-relaxed">
                      {patientLine}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tips + action */}
          <div className="px-5 pb-5 pt-2 border-t border-slate-100 mt-1">
            <p className="text-[11px] text-slate-400 italic leading-relaxed mb-3">
              Speak naturally &mdash; the AI will adapt. These are suggested
              lines, not exact scripts.
            </p>
            <button
              onClick={toggleScript}
              className="w-full bg-slate-900 text-white text-[13px] font-medium py-2.5 rounded-xl hover:bg-slate-800 active:bg-slate-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
