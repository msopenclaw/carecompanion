"use client";

import { useEffect, useState, useCallback } from "react";
import { PatientSelector } from "@/components/shared/patient-selector";
import { SafetyDisclaimer } from "@/components/shared/safety-disclaimer";
import { IPhoneFrame } from "@/components/shared/iphone-frame";
import { MonitorFrame } from "@/components/shared/monitor-frame";
import VoiceExperience from "@/components/demo/voice-experience";
import TriageDashboard from "@/components/demo/triage-dashboard";
import { BillingSimulator } from "@/components/demo/billing-simulator";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  statusBadge: string;
  conditions: string[];
  dateOfBirth: string;
  gender: string;
}

export default function Home() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null
  );
  const [refreshKey, setRefreshKey] = useState(0);

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
      <header className="flex items-center justify-between px-6 py-2.5 bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-sm shrink-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-white font-bold text-xs">CC</span>
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">
              CareCompanion AI
            </h1>
            <p className="text-[10px] text-slate-400 mt-0.5">
              Voice-First Chronic Care Co-Pilot &mdash; Demo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right mr-2 hidden lg:block">
            <p className="text-[10px] text-slate-500 leading-tight">Select a patient to see</p>
            <p className="text-[10px] text-slate-500 leading-tight">all three journeys update</p>
          </div>
          <PatientSelector
            patients={patients}
            selectedId={currentPatientId}
            onSelect={(id) => {
              setSelectedPatientId(id);
              setRefreshKey((k) => k + 1);
            }}
          />
        </div>
      </header>

      {/* Three-panel layout */}
      <div className="flex flex-1 overflow-hidden p-4 gap-4 min-h-0">

        {/* Panel 1: Patient Voice Experience — iPhone */}
        <div className="flex items-center justify-center shrink-0">
          <IPhoneFrame
            label="1. Patient Voice"
            labelColor="#10b981"
            sublabel="The Hook"
          >
            <VoiceExperience
              patientName={selectedPatient.firstName}
              patientId={currentPatientId}
              key={`voice-${currentPatientId}-${refreshKey}`}
            />
          </IPhoneFrame>
        </div>

        {/* Panel 2: Clinician Triage Dashboard — Monitor */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          <MonitorFrame
            label="2. Clinician Triage"
            labelColor="#7c3aed"
            sublabel="The Efficiency"
          >
            <TriageDashboard
              patientId={currentPatientId}
              onResolve={handleRefresh}
              key={`triage-${currentPatientId}-${refreshKey}`}
            />
          </MonitorFrame>
        </div>

        {/* Panel 3: Billing/ROI Simulation — Second Monitor */}
        <div className="w-[420px] shrink-0 min-h-0 flex flex-col">
          <MonitorFrame
            label="3. Revenue Model"
            labelColor="#f59e0b"
            sublabel="The ROI"
          >
            <BillingSimulator
              key={`billing-${refreshKey}`}
            />
          </MonitorFrame>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-4 py-1.5 bg-slate-900/80 border-t border-slate-700/50 shrink-0">
        <SafetyDisclaimer />
      </footer>
    </div>
  );
}
