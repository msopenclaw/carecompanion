"use client";

import { useEffect, useState, useCallback } from "react";
import { PatientSelector } from "@/components/shared/patient-selector";
import { SafetyDisclaimer } from "@/components/shared/safety-disclaimer";
import { IPhoneFrame } from "@/components/shared/iphone-frame";
import { MonitorFrame } from "@/components/shared/monitor-frame";
import { HealthStatusBadge } from "@/components/patient/health-status-badge";
import { VitalsGrid } from "@/components/patient/vitals-grid";
import { MedicationChecklist } from "@/components/patient/medication-checklist";
import { TrendSummary } from "@/components/patient/trend-summary";
import { AiChat } from "@/components/patient/ai-chat";
import { AlertQueue } from "@/components/provider/alert-queue";
import { BillingTracker } from "@/components/provider/billing-tracker";
import { StatusCard } from "@/components/caregiver/status-card";
import { TodaysVitals } from "@/components/caregiver/todays-vitals";
import { AdherenceRing } from "@/components/caregiver/adherence-ring";
import { AlertBanner } from "@/components/caregiver/alert-banner";
import { Separator } from "@/components/ui/separator";

interface Patient {
  id: string;
  firstName: string;
  lastName: string;
  statusBadge: string;
  conditions: string[];
  dateOfBirth: string;
  gender: string;
}

interface AlertData {
  id: string;
  severity: string;
  title: string;
  status: string;
}

export default function Home() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(
    null
  );
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [adherence, setAdherence] = useState(0);
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

  useEffect(() => {
    if (!selectedPatientId) return;
    fetch(`/api/alerts?patientId=${selectedPatientId}&status=active`)
      .then((r) => r.json())
      .then((data) => setAlerts(Array.isArray(data) ? data : []))
      .catch(() => setAlerts([]));
    fetch(`/api/patients/${selectedPatientId}`)
      .then((r) => r.json())
      .then((data) => setAdherence(data.adherenceRate ?? 85))
      .catch(() => setAdherence(0));
  }, [selectedPatientId, refreshKey]);

  const selectedPatient = patients.find((p) => p.id === selectedPatientId);

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  if (!selectedPatient || !selectedPatientId) {
    return (
      <div className="flex h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="animate-pulse text-muted-foreground">
          Loading CareCompanion AI...
        </div>
      </div>
    );
  }

  const currentPatientId: string = selectedPatientId;

  return (
    <div className="flex h-screen flex-col bg-gradient-to-br from-slate-50 via-slate-50 to-blue-50/30">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-6 py-3 bg-white/80 backdrop-blur-sm shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <span className="text-white font-bold text-sm">CC</span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none bg-gradient-to-r from-gray-900 to-gray-600 bg-clip-text text-transparent">
                CareCompanion AI
              </h1>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Chronic Care Co-Pilot &mdash; All three views update together
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right mr-2 hidden lg:block">
            <p className="text-[11px] text-muted-foreground leading-tight">Switch patient to see</p>
            <p className="text-[11px] text-muted-foreground leading-tight">all panels update live</p>
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

      {/* Main: Provider monitor (left) | Patient phone (center) | Caregiver phone (right) */}
      <div className="flex flex-1 overflow-hidden px-6 py-4 gap-6">
        {/* Provider — PC Monitor on the left */}
        <div className="w-[480px] shrink-0 flex flex-col min-h-0">
          <MonitorFrame
            label="Provider Dashboard"
            labelColor="#7c3aed"
            sublabel="Desktop EHR view"
          >
            <div className="p-4 space-y-4">
              <AlertQueue
                patientId={currentPatientId}
                onResolve={handleRefresh}
                key={`alerts-${currentPatientId}-${refreshKey}`}
              />
              <Separator />
              <BillingTracker
                patientId={currentPatientId}
                key={`billing-${currentPatientId}-${refreshKey}`}
              />
            </div>
          </MonitorFrame>
        </div>

        {/* Phones — centered in remaining space */}
        <div className="flex-1 flex items-center justify-center gap-8 overflow-auto min-w-0">
          {/* Patient Phone */}
          <IPhoneFrame
            label="Patient App"
            labelColor="#2563eb"
            sublabel="What the patient sees"
          >
            {/* Mobile-optimized content */}
            <div className="px-3.5 py-3 space-y-3">
              {/* Greeting */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] text-gray-500">Good morning,</p>
                  <h2 className="text-base font-bold leading-tight">
                    {selectedPatient.firstName}
                  </h2>
                </div>
                <HealthStatusBadge
                  status={
                    selectedPatient.statusBadge as "green" | "yellow" | "red"
                  }
                />
              </div>

              {/* Trend summary */}
              <TrendSummary
                patientId={currentPatientId}
                key={`trend-${currentPatientId}-${refreshKey}`}
              />

              {/* Vitals */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
                  Current Vitals
                </h3>
                <VitalsGrid
                  patientId={currentPatientId}
                  key={`vitals-${currentPatientId}-${refreshKey}`}
                />
              </div>

              <div className="border-t border-gray-100" />

              {/* Medications */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
                  Today&apos;s Medications
                </h3>
                <MedicationChecklist
                  patientId={currentPatientId}
                  key={`meds-${currentPatientId}-${refreshKey}`}
                />
              </div>

              <div className="border-t border-gray-100" />

              {/* AI Chat */}
              <div>
                <h3 className="text-[11px] font-semibold text-gray-700 mb-1.5 uppercase tracking-wider">
                  AI Health Companion
                </h3>
                <AiChat
                  patientId={currentPatientId}
                  patientName={selectedPatient.firstName}
                  key={`chat-${currentPatientId}`}
                />
              </div>
            </div>
          </IPhoneFrame>

          {/* Caregiver Phone */}
          <IPhoneFrame
            label="Caregiver App"
            labelColor="#16a34a"
            sublabel="What the family sees"
          >
            {/* Mobile-optimized content */}
            <div className="px-3.5 py-3 space-y-3">
              <StatusCard
                status={
                  selectedPatient.statusBadge as "green" | "yellow" | "red"
                }
                patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                lastUpdated={new Date().toISOString()}
              />

              <div className="border-t border-gray-100" />

              <TodaysVitals
                patientId={currentPatientId}
                key={`cg-vitals-${currentPatientId}-${refreshKey}`}
              />

              <div className="border-t border-gray-100" />

              <div className="flex justify-center py-1">
                <AdherenceRing percentage={adherence} />
              </div>

              <div className="border-t border-gray-100" />

              <AlertBanner
                alerts={alerts.map((a) => ({
                  severity: a.severity,
                  title: a.title,
                }))}
              />
            </div>
          </IPhoneFrame>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-2 bg-white/80 backdrop-blur-sm shrink-0">
        <SafetyDisclaimer />
      </footer>
    </div>
  );
}
