"use client";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Status = "green" | "yellow" | "red";

interface StatusCardProps {
  status: Status;
  patientName: string;
  lastUpdated: string;
  className?: string;
}

const statusConfig: Record<
  Status,
  {
    message: (name: string) => string;
    ringColor: string;
    bgColor: string;
    textColor: string;
    pulseColor: string;
    label: string;
  }
> = {
  green: {
    message: (name) => `${name} is doing well`,
    ringColor: "stroke-emerald-500",
    bgColor: "bg-emerald-50",
    textColor: "text-emerald-700",
    pulseColor: "bg-emerald-400",
    label: "All Clear",
  },
  yellow: {
    message: (name) => `${name} may need attention`,
    ringColor: "stroke-amber-500",
    bgColor: "bg-amber-50",
    textColor: "text-amber-700",
    pulseColor: "bg-amber-400",
    label: "Needs Attention",
  },
  red: {
    message: (name) => `${name} needs immediate attention`,
    ringColor: "stroke-red-500",
    bgColor: "bg-red-50",
    textColor: "text-red-700",
    pulseColor: "bg-red-400",
    label: "Critical",
  },
};

function getTimeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins === 1) return "1 minute ago";
  if (diffMins < 60) return `${diffMins} minutes ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export function StatusCard({
  status,
  patientName,
  lastUpdated,
  className,
}: StatusCardProps) {
  const config = statusConfig[status];

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className={cn("flex flex-col items-center p-8", config.bgColor)}>
        {/* Large status circle */}
        <div className="relative mb-6">
          {/* Pulsing background */}
          {status === "red" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-20" />
          )}
          <svg
            viewBox="0 0 120 120"
            className="h-28 w-28"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Background circle */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              className="text-gray-200"
            />
            {/* Colored status ring */}
            <circle
              cx="60"
              cy="60"
              r="54"
              fill="none"
              strokeWidth="6"
              strokeLinecap="round"
              className={config.ringColor}
              strokeDasharray="339.292"
              strokeDashoffset="0"
              transform="rotate(-90 60 60)"
            />
            {/* Inner filled circle */}
            <circle
              cx="60"
              cy="60"
              r="42"
              className={cn(
                "fill-current",
                status === "green"
                  ? "text-emerald-100"
                  : status === "yellow"
                    ? "text-amber-100"
                    : "text-red-100"
              )}
            />
            {/* Status icon */}
            {status === "green" && (
              <path
                d="M45 60 L55 70 L75 50"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-emerald-600"
              />
            )}
            {status === "yellow" && (
              <>
                <line
                  x1="60"
                  y1="45"
                  x2="60"
                  y2="62"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="text-amber-600"
                />
                <circle cx="60" cy="72" r="2.5" className="fill-amber-600" />
              </>
            )}
            {status === "red" && (
              <>
                <line
                  x1="50"
                  y1="50"
                  x2="70"
                  y2="70"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="text-red-600"
                />
                <line
                  x1="70"
                  y1="50"
                  x2="50"
                  y2="70"
                  stroke="currentColor"
                  strokeWidth="4"
                  strokeLinecap="round"
                  className="text-red-600"
                />
              </>
            )}
          </svg>
        </div>

        {/* Patient name */}
        <h2 className="text-xl font-bold text-foreground">{patientName}</h2>

        {/* Status message */}
        <p className={cn("mt-2 text-lg font-medium", config.textColor)}>
          {config.message(patientName.split(" ")[0])}
        </p>

        {/* Status label */}
        <span
          className={cn(
            "mt-3 inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
            config.bgColor,
            config.textColor,
            "border",
            status === "green" && "border-emerald-200",
            status === "yellow" && "border-amber-200",
            status === "red" && "border-red-200"
          )}
        >
          {config.label}
        </span>

        {/* Last updated */}
        <p className="mt-4 text-xs text-muted-foreground">
          Last updated: {getTimeAgo(lastUpdated)}
        </p>
      </CardContent>
    </Card>
  );
}
