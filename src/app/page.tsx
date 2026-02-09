"use client";

import { useEffect, useState, useCallback } from "react";
import { PatientSelector } from "@/components/shared/patient-selector";
import { SafetyDisclaimer } from "@/components/shared/safety-disclaimer";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading CareCompanion AI...
        </div>
      </div>
    );
  }

  // After the guard above, selectedPatientId is guaranteed to be non-null.
  const currentPatientId: string = selectedPatientId;

  return (
    <div className="flex h-screen flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b px-4 py-3 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">
                CC
              </span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none">
                CareCompanion AI
              </h1>
              <p className="text-xs text-muted-foreground">
                Chronic Care Co-Pilot Demo
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Split Screen - 3 Panels */}
      <div className="flex flex-1 overflow-hidden">
        {/* Patient View */}
        <div className="flex-1 border-r flex flex-col min-w-0">
          <div className="bg-blue-50 px-4 py-2 border-b flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="bg-blue-100 text-blue-700 border-blue-300 text-xs"
            >
              Patient View
            </Badge>
            <span className="text-xs text-muted-foreground">
              Mobile-first dashboard
            </span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4 max-w-md mx-auto">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Good morning,
                  </p>
                  <h2 className="text-xl font-bold">
                    {selectedPatient.firstName}
                  </h2>
                </div>
                <HealthStatusBadge
                  status={
                    selectedPatient.statusBadge as "green" | "yellow" | "red"
                  }
                />
              </div>

              <TrendSummary
                patientId={currentPatientId}
                key={`trend-${currentPatientId}-${refreshKey}`}
              />

              <div>
                <h3 className="text-sm font-semibold mb-2">Current Vitals</h3>
                <VitalsGrid
                  patientId={currentPatientId}
                  key={`vitals-${currentPatientId}-${refreshKey}`}
                />
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">
                  Today&apos;s Medications
                </h3>
                <MedicationChecklist
                  patientId={currentPatientId}
                  key={`meds-${currentPatientId}-${refreshKey}`}
                />
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-semibold mb-2">
                  AI Health Companion
                </h3>
                <AiChat
                  patientId={currentPatientId}
                  patientName={selectedPatient.firstName}
                  key={`chat-${currentPatientId}`}
                />
              </div>
            </div>
          </ScrollArea>
        </div>

        {/* Provider View */}
        <div className="flex-1 border-r flex flex-col min-w-0">
          <div className="bg-purple-50 px-4 py-2 border-b flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="bg-purple-100 text-purple-700 border-purple-300 text-xs"
            >
              Provider View
            </Badge>
            <span className="text-xs text-muted-foreground">
              Alert queue &amp; billing
            </span>
          </div>
          <ScrollArea className="flex-1">
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
          </ScrollArea>
        </div>

        {/* Caregiver View */}
        <div className="w-80 flex flex-col min-w-0 shrink-0">
          <div className="bg-green-50 px-4 py-2 border-b flex items-center gap-2 shrink-0">
            <Badge
              variant="outline"
              className="bg-green-100 text-green-700 border-green-300 text-xs"
            >
              Caregiver View
            </Badge>
            <span className="text-xs text-muted-foreground">Family view</span>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <StatusCard
                status={
                  selectedPatient.statusBadge as "green" | "yellow" | "red"
                }
                patientName={`${selectedPatient.firstName} ${selectedPatient.lastName}`}
                lastUpdated={new Date().toISOString()}
              />

              <Separator />

              <TodaysVitals
                patientId={currentPatientId}
                key={`cg-vitals-${currentPatientId}-${refreshKey}`}
              />

              <Separator />

              <div className="flex justify-center">
                <AdherenceRing percentage={adherence} />
              </div>

              <Separator />

              <AlertBanner
                alerts={alerts.map((a) => ({
                  severity: a.severity,
                  title: a.title,
                }))}
              />
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t px-4 py-2 bg-white shrink-0">
        <SafetyDisclaimer />
      </footer>
    </div>
  );
}
