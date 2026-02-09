"use client";

import { useEffect, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  ReferenceArea,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface VitalRecord {
  id: string;
  patientId: string;
  vitalType: string;
  value: number;
  unit: string;
  recordedAt: string;
  source: string | null;
}

interface VitalsChartProps {
  patientId: string;
  vitalType: string;
}

const VITAL_META: Record<
  string,
  { label: string; color: string; unit: string; normalRange: { min: number; max: number } }
> = {
  blood_pressure_systolic: {
    label: "BP Systolic",
    color: "#ef4444",
    unit: "mmHg",
    normalRange: { min: 90, max: 140 },
  },
  blood_pressure_diastolic: {
    label: "BP Diastolic",
    color: "#f97316",
    unit: "mmHg",
    normalRange: { min: 60, max: 90 },
  },
  heart_rate: {
    label: "Heart Rate",
    color: "#ec4899",
    unit: "bpm",
    normalRange: { min: 60, max: 100 },
  },
  blood_glucose: {
    label: "Blood Glucose",
    color: "#8b5cf6",
    unit: "mg/dL",
    normalRange: { min: 70, max: 140 },
  },
  weight: {
    label: "Weight",
    color: "#06b6d4",
    unit: "lbs",
    normalRange: { min: 100, max: 300 },
  },
  oxygen_saturation: {
    label: "O2 Saturation",
    color: "#22c55e",
    unit: "%",
    normalRange: { min: 95, max: 100 },
  },
  temperature: {
    label: "Temperature",
    color: "#eab308",
    unit: "\u00b0F",
    normalRange: { min: 97, max: 99.5 },
  },
};

type RangeOption = "7" | "30" | "90";

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function VitalsChart({ patientId, vitalType }: VitalsChartProps) {
  const [range, setRange] = useState<RangeOption>("7");
  const [data, setData] = useState<{ date: string; value: number; rawDate: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const meta = VITAL_META[vitalType] ?? {
    label: vitalType,
    color: "#6b7280",
    unit: "",
    normalRange: { min: 0, max: 200 },
  };

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/vitals?patientId=${patientId}&range=${range}&type=${vitalType}`
      );
      if (!res.ok) throw new Error("Failed to fetch vitals");
      const records: VitalRecord[] = await res.json();
      const chartData = records.map((r) => ({
        date: formatDate(r.recordedAt),
        value: Math.round(r.value * 10) / 10,
        rawDate: r.recordedAt,
      }));
      setData(chartData);
    } catch {
      setData([]);
    } finally {
      setLoading(false);
    }
  }, [patientId, vitalType, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Compute Y axis domain with some padding
  const values = data.map((d) => d.value);
  const allValues = [...values, meta.normalRange.min, meta.normalRange.max];
  const yMin = Math.floor(Math.min(...allValues) * 0.95);
  const yMax = Math.ceil(Math.max(...allValues) * 1.05);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base font-semibold">{meta.label}</CardTitle>
        <Tabs
          value={range}
          onValueChange={(v) => setRange(v as RangeOption)}
        >
          <TabsList className="h-8">
            <TabsTrigger value="7" className="px-3 text-xs">
              7d
            </TabsTrigger>
            <TabsTrigger value="30" className="px-3 text-xs">
              30d
            </TabsTrigger>
            <TabsTrigger value="90" className="px-3 text-xs">
              90d
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex h-[250px] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : data.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            No data for this period
          </div>
        ) : (
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={data}
                margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

                {/* Normal range shading */}
                <ReferenceArea
                  y1={meta.normalRange.min}
                  y2={meta.normalRange.max}
                  fill="#22c55e"
                  fillOpacity={0.08}
                  ifOverflow="extendDomain"
                />

                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={45}
                  tickFormatter={(v: number) => `${v}`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || payload.length === 0)
                      return null;
                    const item = payload[0];
                    return (
                      <div className="rounded-lg border bg-background px-3 py-2 shadow-md">
                        <p className="text-xs text-muted-foreground">
                          {item.payload.date}
                        </p>
                        <p className="text-sm font-semibold">
                          {item.value} {meta.unit}
                        </p>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={meta.color}
                  strokeWidth={2}
                  dot={{ r: 3, fill: meta.color }}
                  activeDot={{ r: 5 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
