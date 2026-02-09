"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface AlertWithPatient {
  id: string;
  patientId: string;
  severity: "critical" | "elevated" | "informational";
  status: string;
  ruleId: string;
  ruleName: string;
  title: string;
  description: string | null;
  vitalsSnapshot: Record<string, unknown> | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  patientFirstName: string;
  patientLastName: string;
}

interface AlertCardProps {
  alert: AlertWithPatient;
  onStatusChange?: () => void;
}

const severityConfig: Record<
  string,
  { label: string; badgeClass: string; borderClass: string }
> = {
  critical: {
    label: "Critical",
    badgeClass: "bg-red-100 text-red-700 border-red-200",
    borderClass: "border-l-red-500",
  },
  elevated: {
    label: "Elevated",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    borderClass: "border-l-amber-500",
  },
  informational: {
    label: "Info",
    badgeClass: "bg-blue-100 text-blue-700 border-blue-200",
    borderClass: "border-l-blue-500",
  },
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

export function AlertCard({ alert, onStatusChange }: AlertCardProps) {
  const [isResolving, setIsResolving] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const config = severityConfig[alert.severity] ?? severityConfig.informational;

  const handleAction = async (
    newStatus: "acknowledged" | "resolved" | "dismissed"
  ) => {
    if (newStatus === "resolved" && !isResolving) {
      setIsResolving(true);
      return;
    }

    setUpdatingStatus(newStatus);

    try {
      const res = await fetch(`/api/alerts/${alert.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          ...(newStatus === "resolved" && resolutionNote
            ? { resolutionNote }
            : {}),
        }),
      });

      if (res.ok) {
        onStatusChange?.();
        setIsResolving(false);
        setResolutionNote("");
      }
    } catch {
      // Silently fail
    } finally {
      setUpdatingStatus(null);
    }
  };

  return (
    <Card
      className={cn("border-l-4 transition-colors", config.borderClass)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant="outline"
                className={cn("text-xs", config.badgeClass)}
              >
                {config.label}
              </Badge>
              <span className="text-sm font-medium">
                {alert.patientFirstName} {alert.patientLastName}
              </span>
              <span className="text-xs text-muted-foreground">
                {timeAgo(alert.createdAt)}
              </span>
            </div>

            {/* Title */}
            <h4 className="mt-1.5 text-sm font-semibold leading-snug">
              {alert.title}
            </h4>

            {/* Description */}
            {alert.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {alert.description}
              </p>
            )}

            {/* Vitals snapshot */}
            {alert.vitalsSnapshot &&
              Object.keys(alert.vitalsSnapshot).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(alert.vitalsSnapshot).map(([key, val]) => (
                    <span
                      key={key}
                      className="inline-flex rounded bg-muted px-2 py-0.5 text-xs"
                    >
                      {key}: {String(val)}
                    </span>
                  ))}
                </div>
              )}
          </div>
        </div>

        {/* Resolution note form */}
        {isResolving && (
          <div className="mt-3 space-y-2">
            <Textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Enter resolution note (optional)..."
              className="min-h-[60px] text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAction("resolved")}
                disabled={updatingStatus !== null}
              >
                {updatingStatus === "resolved" ? "Resolving..." : "Confirm Resolve"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setIsResolving(false);
                  setResolutionNote("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {!isResolving && (
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("acknowledged")}
              disabled={
                updatingStatus !== null || alert.status === "acknowledged"
              }
              className="text-xs"
            >
              {updatingStatus === "acknowledged"
                ? "Updating..."
                : "Acknowledge"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("resolved")}
              disabled={updatingStatus !== null}
              className="text-xs"
            >
              Resolve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleAction("dismissed")}
              disabled={updatingStatus !== null}
              className="text-xs text-muted-foreground"
            >
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
