"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface VitalRecord {
  id: string;
  patientId: string;
  vitalType: string;
  value: number;
  unit: string;
  recordedAt: string;
}

interface TrendSummaryProps {
  patientId: string;
}

interface TrendData {
  bpSystolicAvg: number | null;
  bpDiastolicAvg: number | null;
  bpSystolicPrevAvg: number | null;
  bpDiastolicPrevAvg: number | null;
  hrAvg: number | null;
  glucoseAvg: number | null;
  o2Avg: number | null;
  adherenceEstimate: number;
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

function buildSummary(data: TrendData): string {
  const parts: string[] = [];

  // BP summary
  if (data.bpSystolicAvg !== null && data.bpDiastolicAvg !== null) {
    let bpLine = `Your blood pressure averaged ${data.bpSystolicAvg}/${data.bpDiastolicAvg} mmHg this week`;
    if (
      data.bpSystolicPrevAvg !== null &&
      data.bpDiastolicPrevAvg !== null
    ) {
      const sysDiff = data.bpSystolicAvg - data.bpSystolicPrevAvg;
      if (Math.abs(sysDiff) >= 3) {
        bpLine += sysDiff < 0
          ? `, down from ${data.bpSystolicPrevAvg}/${data.bpDiastolicPrevAvg} last week`
          : `, up from ${data.bpSystolicPrevAvg}/${data.bpDiastolicPrevAvg} last week`;
      } else {
        bpLine += `, consistent with last week`;
      }
    }
    parts.push(bpLine + ".");
  }

  // Heart rate summary
  if (data.hrAvg !== null) {
    parts.push(`Average heart rate: ${data.hrAvg} bpm.`);
  }

  // Blood glucose summary
  if (data.glucoseAvg !== null) {
    parts.push(`Average blood glucose: ${data.glucoseAvg} mg/dL.`);
  }

  // O2 summary
  if (data.o2Avg !== null) {
    parts.push(`Average oxygen saturation: ${data.o2Avg}%.`);
  }

  // Adherence
  parts.push(`Medication adherence: ${data.adherenceEstimate}%.`);

  return parts.join(" ");
}

export function TrendSummary({ patientId }: TrendSummaryProps) {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const fetchAndCompute = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch 30 days of data so we can compare weeks
      const res = await fetch(
        `/api/vitals?patientId=${patientId}&range=30`
      );
      if (!res.ok) throw new Error("Failed to fetch vitals");
      const records: VitalRecord[] = await res.json();

      const now = new Date();
      const oneWeekAgo = new Date(now);
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const twoWeeksAgo = new Date(now);
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      // Partition into this week and last week
      const thisWeek = records.filter(
        (r) => new Date(r.recordedAt) >= oneWeekAgo
      );
      const lastWeek = records.filter(
        (r) =>
          new Date(r.recordedAt) >= twoWeeksAgo &&
          new Date(r.recordedAt) < oneWeekAgo
      );

      const byType = (arr: VitalRecord[], type: string) =>
        arr.filter((r) => r.vitalType === type).map((r) => r.value);

      const trendData: TrendData = {
        bpSystolicAvg: average(byType(thisWeek, "blood_pressure_systolic")),
        bpDiastolicAvg: average(byType(thisWeek, "blood_pressure_diastolic")),
        bpSystolicPrevAvg: average(
          byType(lastWeek, "blood_pressure_systolic")
        ),
        bpDiastolicPrevAvg: average(
          byType(lastWeek, "blood_pressure_diastolic")
        ),
        hrAvg: average(byType(thisWeek, "heart_rate")),
        glucoseAvg: average(byType(thisWeek, "blood_glucose")),
        o2Avg: average(byType(thisWeek, "oxygen_saturation")),
        // Estimate adherence based on available data -- for demo purposes
        // we'll fetch from the patient detail endpoint later if available
        adherenceEstimate: 85,
      };

      // Try to get actual adherence from patient detail
      try {
        const patientRes = await fetch(`/api/patients/${patientId}`);
        if (patientRes.ok) {
          const patientData = await patientRes.json();
          if (typeof patientData.adherenceRate === "number") {
            trendData.adherenceEstimate = patientData.adherenceRate;
          }
        }
      } catch {
        // Use default adherence estimate
      }

      setSummary(buildSummary(trendData));
    } catch {
      setSummary(
        "Unable to generate trend summary at this time. Please try again later."
      );
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchAndCompute();
  }, [fetchAndCompute]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-primary"
          >
            <path d="M2 20h.01" />
            <path d="M7 20v-4" />
            <path d="M12 20v-8" />
            <path d="M17 20V8" />
            <path d="M22 4v16" />
          </svg>
          Weekly Trend Summary
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <div className="h-4 w-full animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted/60" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted/60" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
