"use client";

import { cn } from "@/lib/utils";

type Status = "green" | "yellow" | "red";

interface HealthStatusBadgeProps {
  status: Status;
  className?: string;
}

const statusConfig: Record<
  Status,
  { label: string; dotColor: string; bgColor: string; textColor: string }
> = {
  green: {
    label: "Stable",
    dotColor: "bg-emerald-500",
    bgColor: "bg-emerald-50 border-emerald-200",
    textColor: "text-emerald-700",
  },
  yellow: {
    label: "Needs Attention",
    dotColor: "bg-amber-500",
    bgColor: "bg-amber-50 border-amber-200",
    textColor: "text-amber-700",
  },
  red: {
    label: "Critical",
    dotColor: "bg-red-500",
    bgColor: "bg-red-50 border-red-200",
    textColor: "text-red-700",
  },
};

export function HealthStatusBadge({ status, className }: HealthStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm font-semibold",
        config.bgColor,
        config.textColor,
        className
      )}
    >
      <span className="relative flex h-3.5 w-3.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
            config.dotColor
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-3.5 w-3.5 rounded-full",
            config.dotColor
          )}
        />
      </span>
      {config.label}
    </div>
  );
}
