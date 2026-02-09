"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface VitalRecord {
  id: string;
  patientId: string;
  vitalType: string;
  value: number;
  unit: string;
  recordedAt: string;
}

interface TodaysVitalsProps {
  patientId: string;
}

interface VitalDisplay {
  label: string;
  value: number;
  unit: string;
  status: "normal" | "elevated" | "critical";
}

const VITAL_CONFIG: Record<
  string,
  {
    label: string;
    normalRange: { min: number; max: number };
    criticalRange: { min: number; max: number };
  }
> = {
  blood_pressure_systolic: {
    label: "Blood Pressure (Sys)",
    normalRange: { min: 90, max: 140 },
    criticalRange: { min: 70, max: 180 },
  },
  blood_pressure_diastolic: {
    label: "Blood Pressure (Dia)",
    normalRange: { min: 60, max: 90 },
    criticalRange: { min: 40, max: 120 },
  },
  heart_rate: {
    label: "Heart Rate",
    normalRange: { min: 60, max: 100 },
    criticalRange: { min: 40, max: 150 },
  },
  blood_glucose: {
    label: "Blood Sugar",
    normalRange: { min: 70, max: 140 },
    criticalRange: { min: 50, max: 300 },
  },
  weight: {
    label: "Weight",
    normalRange: { min: 80, max: 350 },
    criticalRange: { min: 50, max: 500 },
  },
  oxygen_saturation: {
    label: "Oxygen Level",
    normalRange: { min: 95, max: 100 },
    criticalRange: { min: 90, max: 100 },
  },
  temperature: {
    label: "Temperature",
    normalRange: { min: 97, max: 99.5 },
    criticalRange: { min: 95, max: 103 },
  },
};

function getStatus(
  value: number,
  vitalType: string
): "normal" | "elevated" | "critical" {
  const config = VITAL_CONFIG[vitalType];
  if (!config) return "normal";

  if (
    value < config.criticalRange.min ||
    value > config.criticalRange.max
  ) {
    return "critical";
  }
  if (
    value < config.normalRange.min ||
    value > config.normalRange.max
  ) {
    return "elevated";
  }
  return "normal";
}

const statusStyles: Record<string, string> = {
  normal: "text-foreground",
  elevated: "text-amber-600",
  critical: "text-red-600 font-bold",
};

const dotStyles: Record<string, string> = {
  normal: "bg-emerald-500",
  elevated: "bg-amber-500",
  critical: "bg-red-500",
};

export function TodaysVitals({ patientId }: TodaysVitalsProps) {
  const [vitals, setVitals] = useState<VitalDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchVitals = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/vitals?patientId=${patientId}&range=7`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const records: VitalRecord[] = await res.json();

      // Get the most recent reading of each type
      const latestByType = new Map<string, VitalRecord>();
      for (const r of records) {
        const existing = latestByType.get(r.vitalType);
        if (
          !existing ||
          new Date(r.recordedAt) > new Date(existing.recordedAt)
        ) {
          latestByType.set(r.vitalType, r);
        }
      }

      const displayVitals: VitalDisplay[] = [];
      latestByType.forEach((record, type) => {
        const config = VITAL_CONFIG[type];
        if (!config) return;
        displayVitals.push({
          label: config.label,
          value: Math.round(record.value * 10) / 10,
          unit: record.unit,
          status: getStatus(record.value, type),
        });
      });

      setVitals(displayVitals);
    } catch {
      setVitals([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchVitals();
  }, [fetchVitals]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s Vitals</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-10 animate-pulse rounded bg-muted/40"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Today&apos;s Vitals</CardTitle>
      </CardHeader>
      <CardContent>
        {vitals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No vitals recorded recently.
          </p>
        ) : (
          <div className="space-y-3">
            {vitals.map((vital) => (
              <div
                key={vital.label}
                className="flex items-center justify-between rounded-lg border p-3"
              >
                <div className="flex items-center gap-2.5">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      dotStyles[vital.status]
                    )}
                  />
                  <span className="text-sm text-muted-foreground">
                    {vital.label}
                  </span>
                </div>
                <span
                  className={cn(
                    "text-sm font-semibold tabular-nums",
                    statusStyles[vital.status]
                  )}
                >
                  {vital.value}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {vital.unit}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
