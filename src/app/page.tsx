"use client";

import { useEffect, useState, useCallback } from "react";
import { PatientSelector } from "@/components/shared/patient-selector";
import { SafetyDisclaimer } from "@/components/shared/safety-disclaimer";
import { IPhoneFrame } from "@/components/shared/iphone-frame";
import { DemoProvider, useDemo } from "@/components/demo/demo-context";
import VoiceAgent from "@/components/demo/voice-agent";
import { LiveTriage } from "@/components/demo/live-triage";
import { LiveBilling } from "@/components/demo/live-billing";
import { DeveloperLogs } from "@/components/demo/developer-logs";
import { ScriptGuide } from "@/components/demo/script-guide";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  statusBadge: string;
  conditions: string[];
  dateOfBirth: string;
  gender: string;
}

function DemoPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);
  const demo = useDemo();

  useEffect(() => {
    fetch("/api/patients")
      .then((r) => r.json())
      .then((data) => {
        setPatients(data);
        if (data.length > 0) setSelectedPatientId(data[0].id);
      })
      .catch(console.error);
  }, []);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!selectedPatient || !selectedPatientId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="animate-pulse text-slate-400 text-sm">
          Loading CareCompanion AI...
        </div>
      </div>
    );
  }

  const currentPatientId: string = selectedPatientId;

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-2 bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-xs">CC</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">
              CareCompanion AI
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Voice-First Chronic Care Co-Pilot
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Run Demo / Reset button */}
          {demo.demoPhase === "idle" ? (
            <button
              onClick={() => demo.startDemo()}
              className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white text-xs font-semibold rounded-lg shadow-lg shadow-emerald-500/30 hover:shadow-emerald-500/50 transition-all flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Run Demo
            </button>
          ) : demo.demoPhase === "complete" ? (
            <button
              onClick={() => {
                demo.resetDemo();
                handleRefresh();
              }}
              className="px-4 py-1.5 bg-slate-700 text-white text-xs font-semibold rounded-lg hover:bg-slate-600 transition-all flex items-center gap-2"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M1 4v6h6M23 20v-6h-6" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reset Demo
            </button>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 text-xs font-medium">Demo Running</span>
            </div>
          )}

          {/* Developer Logs button */}
          <button
            onClick={() => demo.toggleLogs()}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              demo.showLogs
                ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40"
                : "bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-300"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16,18 22,12 16,6" />
              <polyline points="8,6 2,12 8,18" />
            </svg>
            Dev Logs
          </button>

          {/* Script button */}
          <button
            onClick={() => demo.toggleScript()}
            className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 text-slate-400 hover:text-white text-xs font-bold flex items-center justify-center transition-all"
            title="View patient script"
          >
            i
          </button>

          {/* Patient selector */}
          <PatientSelector
            patients={patients}
            selectedId={currentPatientId}
            onSelect={(id) => {
              setSelectedPatientId(id);
              demo.resetDemo();
              setRefreshKey((k) => k + 1);
            }}
          />
        </div>
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden p-3 gap-3 min-h-0">
        {/* Panel 1: Patient Voice — iPhone */}
        <div className="flex items-center justify-center shrink-0">
          <IPhoneFrame
            label="1. Patient Voice"
            labelColor="#10b981"
            sublabel="The Hook"
          >
            <VoiceAgent
              patientName={selectedPatient.firstName}
              key={`voice-${currentPatientId}-${refreshKey}`}
            />
          </IPhoneFrame>
        </div>

        {/* Panel 2: Clinician Triage — Window */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
              2. Clinician Triage
            </span>
            <span className="text-[10px] text-slate-500">The Efficiency</span>
          </div>
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-700/50 shadow-2xl bg-white text-slate-900">
            <div className="h-full overflow-y-auto">
              <LiveTriage key={`triage-${currentPatientId}-${refreshKey}`} />
            </div>
          </div>
        </div>

        {/* Panel 3: Billing Dashboard — Window */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex items-center gap-2 mb-2 shrink-0">
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              3. Billing Dashboard
            </span>
            <span className="text-[10px] text-slate-500">The ROI</span>
          </div>
          <div className="flex-1 min-h-0 rounded-xl overflow-hidden border border-slate-700/50 shadow-2xl bg-white text-slate-900">
            <div className="h-full overflow-y-auto">
              <LiveBilling key={`billing-${refreshKey}`} />
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 py-1 bg-slate-900/80 border-t border-slate-700/50 shrink-0">
        <SafetyDisclaimer />
      </footer>

      {/* Overlay panels */}
      <DeveloperLogs />
      <ScriptGuide />
    </div>
  );
}

export default function Home() {
  return (
    <DemoProvider>
      <DemoPage />
    </DemoProvider>
  );
}
