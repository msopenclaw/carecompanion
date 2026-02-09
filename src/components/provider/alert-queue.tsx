"use client";

import { useEffect, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCard,
  type AlertWithPatient,
} from "@/components/provider/alert-card";
import { cn } from "@/lib/utils";

interface AlertQueueProps {
  patientId?: string;
  onResolve?: () => void;
}

type SeverityGroup = "critical" | "elevated" | "informational";

const severityOrder: SeverityGroup[] = [
  "critical",
  "elevated",
  "informational",
];

const severityLabels: Record<SeverityGroup, string> = {
  critical: "Critical",
  elevated: "Elevated",
  informational: "Informational",
};

const severityColors: Record<SeverityGroup, string> = {
  critical: "bg-red-100 text-red-700",
  elevated: "bg-amber-100 text-amber-700",
  informational: "bg-blue-100 text-blue-700",
};

export function AlertQueue({ patientId, onResolve }: AlertQueueProps) {
  const [alerts, setAlerts] = useState<AlertWithPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ status: "active" });
      if (patientId) {
        params.set("patientId", patientId);
      }
      const res = await fetch(`/api/alerts?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch alerts");
      const data: AlertWithPatient[] = await res.json();
      setAlerts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Group alerts by severity
  const grouped: Record<SeverityGroup, AlertWithPatient[]> = {
    critical: [],
    elevated: [],
    informational: [],
  };

  for (const alert of alerts) {
    const group = grouped[alert.severity as SeverityGroup];
    if (group) {
      group.push(alert);
    }
  }

  const totalAlerts = alerts.length;

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold">Alert Queue</h3>
          <div className="h-5 w-8 animate-pulse rounded bg-muted" />
        </div>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Error loading alerts: {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Header with total count */}
      <div className="flex items-center gap-3">
        <h3 className="text-base font-semibold">Alert Queue</h3>
        <Badge variant="outline" className="text-xs">
          {totalAlerts} active
        </Badge>
      </div>

      {/* Severity group count chips */}
      <div className="flex gap-2">
        {severityOrder.map((sev) => {
          const count = grouped[sev].length;
          if (count === 0) return null;
          return (
            <Badge
              key={sev}
              variant="outline"
              className={cn("text-xs", severityColors[sev])}
            >
              {count} {severityLabels[sev]}
            </Badge>
          );
        })}
      </div>

      {/* Alert list */}
      {totalAlerts === 0 ? (
        <div className="rounded-lg border bg-emerald-50 p-6 text-center">
          <p className="text-sm font-medium text-emerald-700">
            No active alerts
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            All patients are within normal parameters.
          </p>
        </div>
      ) : (
        <ScrollArea className="max-h-[600px]">
          <div className="space-y-4 pr-3">
            {severityOrder.map((sev) => {
              const groupAlerts = grouped[sev];
              if (groupAlerts.length === 0) return null;

              return (
                <div key={sev}>
                  <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {severityLabels[sev]} ({groupAlerts.length})
                  </h4>
                  <div className="space-y-2">
                    {groupAlerts.map((alert) => (
                      <AlertCard
                        key={alert.id}
                        alert={alert}
                        onStatusChange={() => {
                          fetchAlerts();
                          onResolve?.();
                        }}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
