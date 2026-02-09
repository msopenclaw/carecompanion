"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

interface VitalDataPoint {
  value: number;
  time: string;
}

interface VitalsCardProps {
  title: string;
  value: number;
  unit: string;
  trend: "up" | "down" | "stable";
  data: VitalDataPoint[];
  color: string;
  normalRange?: { min: number; max: number };
}

/**
 * Determine whether an up/down trend is visually "bad" for a given vital type.
 * - For blood pressure and heart rate, going up is bad.
 * - For SpO2, going down is bad.
 * - Weight is contextual, treated as neutral.
 */
function getTrendDisplay(
  trend: "up" | "down" | "stable",
  title: string
): { arrow: string; className: string } {
  const titleLower = title.toLowerCase();
  const isBPOrHR =
    titleLower.includes("bp") ||
    titleLower.includes("blood pressure") ||
    titleLower.includes("systolic") ||
    titleLower.includes("diastolic") ||
    titleLower.includes("heart rate") ||
    titleLower.includes("glucose");
  const isO2 =
    titleLower.includes("o2") ||
    titleLower.includes("oxygen") ||
    titleLower.includes("spo2");

  if (trend === "stable") {
    return { arrow: "\u2192", className: "text-muted-foreground" };
  }

  if (trend === "up") {
    if (isBPOrHR) {
      return { arrow: "\u2191", className: "text-red-600" };
    }
    if (isO2) {
      return { arrow: "\u2191", className: "text-emerald-600" };
    }
    return { arrow: "\u2191", className: "text-muted-foreground" };
  }

  // trend === "down"
  if (isO2) {
    return { arrow: "\u2193", className: "text-red-600" };
  }
  if (isBPOrHR) {
    return { arrow: "\u2193", className: "text-emerald-600" };
  }
  return { arrow: "\u2193", className: "text-muted-foreground" };
}

function isOutOfRange(
  value: number,
  normalRange?: { min: number; max: number }
): boolean {
  if (!normalRange) return false;
  return value < normalRange.min || value > normalRange.max;
}

export function VitalsCard({
  title,
  value,
  unit,
  trend,
  data,
  color,
  normalRange,
}: VitalsCardProps) {
  const trendDisplay = getTrendDisplay(trend, title);
  const outOfRange = isOutOfRange(value, normalRange);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-baseline gap-1.5">
          <span
            className={cn(
              "text-2xl font-bold tabular-nums",
              outOfRange ? "text-red-600" : "text-foreground"
            )}
          >
            {value}
          </span>
          <span className="text-sm text-muted-foreground">{unit}</span>
          <span className={cn("ml-1 text-lg font-semibold", trendDisplay.className)}>
            {trendDisplay.arrow}
          </span>
        </div>

        {normalRange && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Normal: {normalRange.min}&#8211;{normalRange.max} {unit}
          </p>
        )}

        {/* Mini sparkline */}
        {data.length > 1 && (
          <div className="mt-3 h-12 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={data}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={`grad-${title}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${title})`}
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
