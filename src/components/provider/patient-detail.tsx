"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { HealthStatusBadge } from "@/components/patient/health-status-badge";
import { VitalsChart } from "@/components/patient/vitals-chart";
import { AlertQueue } from "@/components/provider/alert-queue";
import { cn } from "@/lib/utils";

interface PatientDetailData {
  id: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: string;
  conditions: string[];
  statusBadge: "green" | "yellow" | "red";
  phone: string | null;
  email: string | null;
  providerFirstName: string | null;
  providerLastName: string | null;
  providerSpecialty: string | null;
  latestVitals: {
    id: string;
    vitalType: string;
    value: number;
    unit: string;
    recordedAt: string;
    source: string | null;
  }[];
  activeMedications: {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
  }[];
  activeAlertsCount: number;
  adherenceRate: number;
}

interface PatientDetailProps {
  patientId: string;
}

function calculateAge(dateOfBirth: string): number {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

const vitalTypeLabels: Record<string, string> = {
  blood_pressure_systolic: "BP Systolic",
  blood_pressure_diastolic: "BP Diastolic",
  heart_rate: "Heart Rate",
  blood_glucose: "Blood Glucose",
  weight: "Weight",
  oxygen_saturation: "O2 Sat",
  temperature: "Temperature",
};

const chartVitalTypes = [
  { key: "blood_pressure_systolic", label: "BP Systolic" },
  { key: "blood_pressure_diastolic", label: "BP Diastolic" },
  { key: "heart_rate", label: "Heart Rate" },
  { key: "blood_glucose", label: "Blood Glucose" },
  { key: "weight", label: "Weight" },
  { key: "oxygen_saturation", label: "O2 Sat" },
];

export function PatientDetail({ patientId }: PatientDetailProps) {
  const [patient, setPatient] = useState<PatientDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVital, setSelectedVital] = useState("blood_pressure_systolic");

  const fetchPatient = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/patients/${patientId}`);
      if (!res.ok) throw new Error("Failed to fetch patient");
      const data = await res.json();
      setPatient(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPatient();
  }, [fetchPatient]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl border bg-muted/40" />
        <div className="h-64 animate-pulse rounded-xl border bg-muted/40" />
      </div>
    );
  }

  if (error || !patient) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error ?? "Patient not found"}
      </div>
    );
  }

  const age = calculateAge(patient.dateOfBirth);

  return (
    <div className="space-y-4">
      {/* Patient info header */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-bold">
                  {patient.firstName} {patient.lastName}
                </h2>
                <HealthStatusBadge
                  status={patient.statusBadge}
                />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {age} years old &middot;{" "}
                {patient.gender.charAt(0).toUpperCase() +
                  patient.gender.slice(1)}{" "}
                {patient.providerFirstName &&
                  `&middot; Dr. ${patient.providerFirstName} ${patient.providerLastName}`}
              </p>
              {patient.conditions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {patient.conditions.map((condition) => (
                    <Badge key={condition} variant="secondary" className="text-xs">
                      {condition}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex gap-4 text-center">
              <div>
                <p className="text-2xl font-bold tabular-nums">
                  {patient.adherenceRate}%
                </p>
                <p className="text-xs text-muted-foreground">Adherence</p>
              </div>
              <div>
                <p
                  className={cn(
                    "text-2xl font-bold tabular-nums",
                    patient.activeAlertsCount > 0
                      ? "text-red-600"
                      : "text-emerald-600"
                  )}
                >
                  {patient.activeAlertsCount}
                </p>
                <p className="text-xs text-muted-foreground">Alerts</p>
              </div>
            </div>
          </div>

          {/* Latest vitals row */}
          {patient.latestVitals.length > 0 && (
            <>
              <Separator className="my-3" />
              <div className="flex flex-wrap gap-4">
                {patient.latestVitals.map((vital) => (
                  <div key={vital.id} className="text-center">
                    <p className="text-xs text-muted-foreground">
                      {vitalTypeLabels[vital.vitalType] ?? vital.vitalType}
                    </p>
                    <p className="text-sm font-semibold tabular-nums">
                      {Math.round(vital.value * 10) / 10}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {vital.unit}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Charts section with vital type tabs */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Vitals History</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedVital} onValueChange={setSelectedVital}>
            <TabsList className="mb-3 flex flex-wrap h-auto gap-1">
              {chartVitalTypes.map((vt) => (
                <TabsTrigger
                  key={vt.key}
                  value={vt.key}
                  className="px-2.5 py-1 text-xs"
                >
                  {vt.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {chartVitalTypes.map((vt) => (
              <TabsContent key={vt.key} value={vt.key}>
                <VitalsChart
                  patientId={patientId}
                  vitalType={vt.key}
                />
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Active alerts */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Active Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          <AlertQueue patientId={patientId} />
        </CardContent>
      </Card>

      {/* Active medications */}
      {patient.activeMedications.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Active Medications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {patient.activeMedications.map((med) => (
                <div
                  key={med.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{med.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {med.dosage} &middot; {med.frequency}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline">
          Schedule Follow-up
        </Button>
        <Button size="sm" variant="outline">
          Adjust Medications
        </Button>
        <Button size="sm" variant="outline">
          Send Message
        </Button>
        <Button size="sm" variant="outline">
          Export Report
        </Button>
      </div>
    </div>
  );
}
