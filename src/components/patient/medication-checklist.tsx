"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface MedicationLog {
  id: string;
  medicationId: string;
  patientId: string;
  scheduledAt: string;
  takenAt: string | null;
  status: "taken" | "missed" | "late" | "skipped";
}

interface MedicationWithLogs {
  id: string;
  patientId: string;
  name: string;
  dosage: string;
  frequency: string;
  scheduledTimes: string[];
  isActive: boolean;
  prescribedBy: string | null;
  startDate: string | null;
  endDate: string | null;
  todayLogs: MedicationLog[];
}

interface MedicationChecklistProps {
  patientId: string;
}

type TimeSlotStatus = "taken" | "missed" | "pending";

interface TimeSlot {
  medication: MedicationWithLogs;
  time: string;
  status: TimeSlotStatus;
  log: MedicationLog | null;
}

function getTimeSlotStatus(
  scheduledTime: string,
  logs: MedicationLog[]
): { status: TimeSlotStatus; log: MedicationLog | null } {
  // Check if there's a log for this time slot
  const matchingLog = logs.find((l) => {
    const logScheduledHour = new Date(l.scheduledAt).getHours();
    const slotHour = parseInt(scheduledTime.split(":")[0], 10);
    return logScheduledHour === slotHour;
  });

  if (matchingLog) {
    if (matchingLog.status === "taken" || matchingLog.status === "late") {
      return { status: "taken", log: matchingLog };
    }
    return { status: "missed", log: matchingLog };
  }

  // If no log exists, check if the time has passed
  const now = new Date();
  const [hours, minutes] = scheduledTime.split(":").map(Number);
  const scheduledDate = new Date();
  scheduledDate.setHours(hours, minutes || 0, 0, 0);

  // Give a 1-hour grace period
  const graceEnd = new Date(scheduledDate);
  graceEnd.setHours(graceEnd.getHours() + 1);

  if (now > graceEnd) {
    return { status: "missed", log: null };
  }

  return { status: "pending", log: null };
}

const statusConfig: Record<TimeSlotStatus, { label: string; className: string }> = {
  taken: {
    label: "Taken",
    className: "bg-emerald-100 text-emerald-700 border-emerald-200",
  },
  missed: {
    label: "Missed",
    className: "bg-red-100 text-red-700 border-red-200",
  },
  pending: {
    label: "Pending",
    className: "bg-gray-100 text-gray-600 border-gray-200",
  },
};

export function MedicationChecklist({ patientId }: MedicationChecklistProps) {
  const [medications, setMedications] = useState<MedicationWithLogs[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingSlots, setTogglingSlots] = useState<Set<string>>(new Set());

  const fetchMedications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/medications?patientId=${patientId}`);
      if (!res.ok) throw new Error("Failed to fetch medications");
      const data: MedicationWithLogs[] = await res.json();
      setMedications(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchMedications();
  }, [fetchMedications]);

  const handleToggleTaken = async (
    medicationId: string,
    scheduledTime: string
  ) => {
    const slotKey = `${medicationId}-${scheduledTime}`;
    if (togglingSlots.has(slotKey)) return;

    setTogglingSlots((prev) => new Set(prev).add(slotKey));

    try {
      // Build the scheduled datetime for today
      const [hours, minutes] = scheduledTime.split(":").map(Number);
      const scheduledAt = new Date();
      scheduledAt.setHours(hours, minutes || 0, 0, 0);

      await fetch("/api/medications/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          medicationId,
          patientId,
          scheduledAt: scheduledAt.toISOString(),
        }),
      });

      // Refresh the list
      await fetchMedications();
    } catch {
      // Silently fail -- the UI will still show the old state
    } finally {
      setTogglingSlots((prev) => {
        const next = new Set(prev);
        next.delete(slotKey);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s Medications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg bg-muted/40"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Today&apos;s Medications</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-600">Error: {error}</p>
        </CardContent>
      </Card>
    );
  }

  // Build time slots across all medications
  const timeSlots: TimeSlot[] = [];
  for (const med of medications) {
    for (const time of med.scheduledTimes) {
      const { status, log } = getTimeSlotStatus(time, med.todayLogs);
      timeSlots.push({ medication: med, time, status, log });
    }
  }

  // Sort by time
  timeSlots.sort((a, b) => a.time.localeCompare(b.time));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Today&apos;s Medications</CardTitle>
          <Badge variant="outline" className="text-xs">
            {timeSlots.filter((s) => s.status === "taken").length}/
            {timeSlots.length} taken
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {timeSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No medications scheduled for today.
          </p>
        ) : (
          <div className="space-y-2">
            {timeSlots.map((slot) => {
              const slotKey = `${slot.medication.id}-${slot.time}`;
              const isToggling = togglingSlots.has(slotKey);
              const config = statusConfig[slot.status];

              return (
                <div
                  key={slotKey}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                    slot.status === "taken" && "bg-emerald-50/50 border-emerald-100",
                    slot.status === "missed" && "bg-red-50/50 border-red-100",
                    slot.status === "pending" && "bg-background"
                  )}
                >
                  {/* Checkbox */}
                  <button
                    type="button"
                    onClick={() =>
                      handleToggleTaken(slot.medication.id, slot.time)
                    }
                    disabled={slot.status === "taken" || isToggling}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                      slot.status === "taken"
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-muted-foreground/40 hover:border-primary"
                    )}
                    aria-label={`Mark ${slot.medication.name} as taken`}
                  >
                    {slot.status === "taken" && (
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
                    )}
                    {isToggling && (
                      <div className="h-3 w-3 animate-spin rounded-full border border-primary border-t-transparent" />
                    )}
                  </button>

                  {/* Medication info */}
                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        slot.status === "taken" && "line-through text-muted-foreground"
                      )}
                    >
                      {slot.medication.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {slot.medication.dosage} &middot; {slot.time}
                    </p>
                  </div>

                  {/* Status badge */}
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 text-xs", config.className)}
                  >
                    {config.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
