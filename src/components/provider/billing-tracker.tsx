"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface BillingTrackerProps {
  patientId?: string;
}

/**
 * RPM billing codes reference:
 * - 99453: Initial setup (one-time) — $19.32
 * - 99454: Device supply + 16 days of data — $55.72/month
 * - 99457: First 20 min of interactive communication — $50.94/month
 * - 99458: Additional 20 min — $42.22/month
 * - 99091: Data review (30 min/month) — $56.88/month
 */

interface BillingCodeInfo {
  code: string;
  description: string;
  reimbursement: number;
  requirement: string;
  eligible: boolean;
  progress?: number; // 0 to 100
  progressLabel?: string;
}

function getDemoData(patientId?: string): {
  codes: BillingCodeInfo[];
  projectedMonthly: number;
  activePatients: number;
} {
  // Demo data -- varies slightly by patient for realism
  const readingDays = patientId ? 22 : 18;
  const interactiveMinutes = patientId ? 25 : 35;

  const codes: BillingCodeInfo[] = [
    {
      code: "99454",
      description: "Device supply & daily readings",
      reimbursement: 55.72,
      requirement: "16+ days of readings per month",
      eligible: readingDays >= 16,
      progress: Math.min(100, (readingDays / 16) * 100),
      progressLabel: `${readingDays}/16 reading days`,
    },
    {
      code: "99457",
      description: "Interactive communication (first 20 min)",
      reimbursement: 50.94,
      requirement: "20+ minutes of live interactive communication",
      eligible: interactiveMinutes >= 20,
      progress: Math.min(100, (interactiveMinutes / 20) * 100),
      progressLabel: `${interactiveMinutes}/20 minutes`,
    },
    {
      code: "99458",
      description: "Additional interactive communication (20 min)",
      reimbursement: 42.22,
      requirement: "Additional 20+ minutes beyond 99457",
      eligible: interactiveMinutes >= 40,
      progress: Math.min(
        100,
        (Math.max(0, interactiveMinutes - 20) / 20) * 100
      ),
      progressLabel: `${Math.max(0, interactiveMinutes - 20)}/20 additional minutes`,
    },
    {
      code: "99091",
      description: "Data review & interpretation (30 min)",
      reimbursement: 56.88,
      requirement: "30+ minutes of data analysis per month",
      eligible: true,
      progress: 100,
      progressLabel: "32/30 minutes",
    },
    {
      code: "99453",
      description: "Initial device setup & patient education",
      reimbursement: 19.32,
      requirement: "One-time per patient enrollment",
      eligible: true,
    },
  ];

  const eligibleRevenue = codes
    .filter((c) => c.eligible)
    .reduce((sum, c) => sum + c.reimbursement, 0);

  const activePatients = 5; // demo

  return {
    codes,
    projectedMonthly: eligibleRevenue * activePatients,
    activePatients,
  };
}

export function BillingTracker({ patientId }: BillingTrackerProps) {
  const { codes, projectedMonthly, activePatients } = getDemoData(patientId);

  const eligibleCount = codes.filter((c) => c.eligible).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">RPM Billing Tracker</CardTitle>
          <Badge variant="outline" className="text-xs">
            {eligibleCount}/{codes.length} eligible
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Revenue projection */}
        <div className="rounded-lg bg-primary/5 p-3">
          <p className="text-xs font-medium text-muted-foreground">
            Monthly Revenue Projection ({activePatients} patients)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            ${projectedMonthly.toFixed(2)}
          </p>
        </div>

        <Separator />

        {/* Billing codes */}
        <div className="space-y-3">
          {codes.map((code) => (
            <div key={code.code} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold">
                    {code.code}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      code.eligible
                        ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                        : "bg-gray-100 text-gray-500 border-gray-200"
                    )}
                  >
                    {code.eligible ? "Eligible" : "Not Met"}
                  </Badge>
                </div>
                <span className="text-sm font-medium tabular-nums">
                  ${code.reimbursement.toFixed(2)}
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                {code.description}
              </p>

              {code.progress !== undefined && (
                <div className="space-y-1">
                  <Progress
                    value={code.progress}
                    className={cn(
                      "h-1.5",
                      code.eligible
                        ? "[&>[role=progressbar]]:bg-emerald-500"
                        : "[&>[role=progressbar]]:bg-amber-500"
                    )}
                  />
                  <p className="text-xs text-muted-foreground">
                    {code.progressLabel}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
