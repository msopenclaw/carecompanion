"use client";

import { useEffect, useState, useCallback } from "react";
import { VitalsCard } from "@/components/patient/vitals-card";

interface VitalRecord {
  id: string;
  patientId: string;
  vitalType: string;
  value: number;
  unit: string;
  recordedAt: string;
  source: string | null;
}

interface VitalsGridProps {
  patientId: string;
}

/** Configuration for each vital type shown in the grid. */
const VITAL_CONFIGS: {
  type: string;
  title: string;
  color: string;
  unit: string;
  normalRange: { min: number; max: number };
}[] = [
  {
    type: "blood_pressure_systolic",
    title: "BP Systolic",
    color: "#ef4444",
    unit: "mmHg",
    normalRange: { min: 90, max: 140 },
  },
  {
    type: "blood_pressure_diastolic",
    title: "BP Diastolic",
    color: "#f97316",
    unit: "mmHg",
    normalRange: { min: 60, max: 90 },
  },
  {
    type: "heart_rate",
    title: "Heart Rate",
    color: "#ec4899",
    unit: "bpm",
    normalRange: { min: 60, max: 100 },
  },
  {
    type: "blood_glucose",
    title: "Blood Glucose",
    color: "#8b5cf6",
    unit: "mg/dL",
    normalRange: { min: 70, max: 140 },
  },
  {
    type: "weight",
    title: "Weight",
    color: "#06b6d4",
    unit: "lbs",
    normalRange: { min: 100, max: 300 },
  },
  {
    type: "oxygen_saturation",
    title: "O2 Sat",
    color: "#22c55e",
    unit: "%",
    normalRange: { min: 95, max: 100 },
  },
];

function computeTrend(
  data: { value: number }[]
): "up" | "down" | "stable" {
  if (data.length < 2) return "stable";
  const recent = data.slice(-3);
  const first = recent[0].value;
  const last = recent[recent.length - 1].value;
  const diff = last - first;
  const threshold = Math.abs(first) * 0.02; // 2% change threshold
  if (diff > threshold) return "up";
  if (diff < -threshold) return "down";
  return "stable";
}

export function VitalsGrid({ patientId }: VitalsGridProps) {
  const [vitals, setVitals] = useState<VitalRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVitals = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(
        `/api/vitals?patientId=${patientId}&range=7`
      );
      if (!res.ok) throw new Error("Failed to fetch vitals");
      const data: VitalRecord[] = await res.json();
      setVitals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchVitals();
  }, [fetchVitals]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {VITAL_CONFIGS.map((config) => (
          <div
            key={config.type}
            className="h-[160px] animate-pulse rounded-xl border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error loading vitals: {error}
      </div>
    );
  }

  // Group vitals by type
  const grouped = new Map<string, VitalRecord[]>();
  for (const v of vitals) {
    const existing = grouped.get(v.vitalType) ?? [];
    existing.push(v);
    grouped.set(v.vitalType, existing);
  }

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {VITAL_CONFIGS.map((config) => {
        const typeData = grouped.get(config.type) ?? [];
        const chartData = typeData.map((v) => ({
          value: v.value,
          time: v.recordedAt,
        }));
        const latestValue =
          typeData.length > 0 ? typeData[typeData.length - 1].value : 0;
        const latestUnit =
          typeData.length > 0 ? typeData[typeData.length - 1].unit : config.unit;
        const trend = computeTrend(chartData);

        return (
          <VitalsCard
            key={config.type}
            title={config.title}
            value={Math.round(latestValue * 10) / 10}
            unit={latestUnit}
            trend={trend}
            data={chartData}
            color={config.color}
            normalRange={config.normalRange}
          />
        );
      })}
    </div>
  );
}
