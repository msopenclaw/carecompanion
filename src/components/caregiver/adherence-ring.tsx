"use client";

import { cn } from "@/lib/utils";

interface AdherenceRingProps {
  percentage: number;
  className?: string;
}

function getColor(percentage: number): {
  stroke: string;
  text: string;
  bg: string;
} {
  if (percentage >= 80) {
    return {
      stroke: "stroke-emerald-500",
      text: "text-emerald-600",
      bg: "bg-emerald-50",
    };
  }
  if (percentage >= 60) {
    return {
      stroke: "stroke-amber-500",
      text: "text-amber-600",
      bg: "bg-amber-50",
    };
  }
  return {
    stroke: "stroke-red-500",
    text: "text-red-600",
    bg: "bg-red-50",
  };
}

export function AdherenceRing({ percentage, className }: AdherenceRingProps) {
  const clampedPercentage = Math.max(0, Math.min(100, percentage));
  const color = getColor(clampedPercentage);

  // SVG circle math
  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clampedPercentage / 100) * circumference;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border p-6",
        color.bg,
        className
      )}
    >
      <div className="relative">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          {/* Background track */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            className="stroke-gray-200"
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            className={cn(color.stroke, "transition-all duration-700 ease-out")}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>

        {/* Percentage text in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn("text-3xl font-bold tabular-nums", color.text)}>
            {Math.round(clampedPercentage)}%
          </span>
        </div>
      </div>

      <p className="text-sm font-medium text-muted-foreground">
        Medication Adherence
      </p>
    </div>
  );
}
