"use client";

import { cn } from "@/lib/utils";

interface AlertItem {
  severity: string;
  title: string;
}

interface AlertBannerProps {
  alerts: AlertItem[];
  className?: string;
}

const severityBadgeStyles: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  elevated: "bg-amber-100 text-amber-700 border-amber-200",
  informational: "bg-blue-100 text-blue-700 border-blue-200",
};

export function AlertBanner({ alerts, className }: AlertBannerProps) {
  if (alerts.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3",
          className
        )}
      >
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3 w-3"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>
        <p className="text-sm font-medium text-emerald-700">
          No current concerns
        </p>
      </div>
    );
  }

  // Determine banner style based on highest severity
  const hasCritical = alerts.some((a) => a.severity === "critical");
  const hasElevated = alerts.some((a) => a.severity === "elevated");

  const bannerStyle = hasCritical
    ? "border-red-200 bg-red-50"
    : hasElevated
      ? "border-amber-200 bg-amber-50"
      : "border-blue-200 bg-blue-50";

  const iconColor = hasCritical
    ? "text-red-600"
    : hasElevated
      ? "text-amber-600"
      : "text-blue-600";

  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        bannerStyle,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("h-4 w-4", iconColor)}
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className={cn("text-sm font-semibold", iconColor)}>
          {alerts.length} alert{alerts.length !== 1 ? "s" : ""} to be aware of
        </p>
      </div>

      {/* Alert list */}
      <div className="space-y-1.5">
        {alerts.map((alert, idx) => {
          const badgeStyle =
            severityBadgeStyles[alert.severity] ??
            severityBadgeStyles.informational;
          return (
            <div key={idx} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex shrink-0 rounded border px-1.5 py-0.5 text-xs font-medium",
                  badgeStyle
                )}
              >
                {alert.severity === "critical"
                  ? "Critical"
                  : alert.severity === "elevated"
                    ? "Elevated"
                    : "Info"}
              </span>
              <span className="text-sm text-foreground">{alert.title}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
