import { and, eq, gte, desc, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  vitals,
  medicationLogs,
  alerts,
  type Vital,
} from "@/lib/db/schema";
import type {
  VitalType,
  PendingAlert,
} from "./types";
import { thresholdRules } from "./threshold-rules";
import { trendRules } from "./trend-rules";
import { compositeRules } from "./composite-rules";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the most recent vital reading for a given patient + type. */
async function getLatestVital(
  db: Database,
  patientId: string,
  vitalType: VitalType,
): Promise<Vital | undefined> {
  const rows = await db
    .select()
    .from(vitals)
    .where(and(eq(vitals.patientId, patientId), eq(vitals.vitalType, vitalType)))
    .orderBy(desc(vitals.recordedAt))
    .limit(1);
  return rows[0];
}

/** Return N most recent vital readings for a given patient + type. */
async function getRecentVitals(
  db: Database,
  patientId: string,
  vitalType: VitalType,
  limit: number,
): Promise<Vital[]> {
  return db
    .select()
    .from(vitals)
    .where(and(eq(vitals.patientId, patientId), eq(vitals.vitalType, vitalType)))
    .orderBy(desc(vitals.recordedAt))
    .limit(limit);
}

/** Return the oldest vital reading within the last N days for delta checks. */
async function getVitalNDaysAgo(
  db: Database,
  patientId: string,
  vitalType: VitalType,
  days: number,
): Promise<Vital | undefined> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select()
    .from(vitals)
    .where(
      and(
        eq(vitals.patientId, patientId),
        eq(vitals.vitalType, vitalType),
        gte(vitals.recordedAt, cutoff),
      ),
    )
    .orderBy(vitals.recordedAt) // oldest first
    .limit(1);
  return rows[0];
}

/** Count missed medication doses in the last N days. */
async function getMissedMedCount(
  db: Database,
  patientId: string,
  days: number,
): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(medicationLogs)
    .where(
      and(
        eq(medicationLogs.patientId, patientId),
        eq(medicationLogs.status, "missed"),
        gte(medicationLogs.scheduledAt, cutoff),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

/** Check whether an active (non-resolved) alert already exists for this rule. */
async function hasActiveAlert(
  db: Database,
  patientId: string,
  ruleId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: alerts.id })
    .from(alerts)
    .where(
      and(
        eq(alerts.patientId, patientId),
        eq(alerts.ruleId, ruleId),
        eq(alerts.status, "active"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Threshold evaluation
// ---------------------------------------------------------------------------

async function evaluateThresholdRules(
  db: Database,
  patientId: string,
): Promise<PendingAlert[]> {
  const pending: PendingAlert[] = [];

  for (const rule of thresholdRules) {
    // Deduplicate: skip if an active alert already exists for this rule.
    if (await hasActiveAlert(db, patientId, rule.id)) continue;

    // Special handling for weight-gain delta rule.
    if (rule.id === "threshold-weight-gain") {
      const latest = await getLatestVital(db, patientId, rule.vitalType);
      const previous = await getVitalNDaysAgo(db, patientId, rule.vitalType, 1);
      if (!latest || !previous) continue;

      const delta = latest.value - previous.value;
      for (const bound of rule.bounds) {
        if (bound.operator === "gt" && delta > bound.value) {
          pending.push({
            patientId,
            severity: bound.severity,
            ruleId: rule.id,
            ruleName: rule.name,
            title: bound.label,
            description: `Weight increased by ${delta.toFixed(1)} lbs in the last day (threshold: ${bound.value} lbs).`,
            vitalsSnapshot: {
              currentWeight: latest.value,
              previousWeight: previous.value,
              delta,
            },
          });
          break; // first match wins (most severe first)
        }
      }
      continue;
    }

    // Standard threshold rules.
    const latest = await getLatestVital(db, patientId, rule.vitalType);
    if (!latest) continue;

    for (const bound of rule.bounds) {
      const triggered =
        bound.operator === "gt"
          ? latest.value > bound.value
          : latest.value < bound.value;

      if (triggered) {
        pending.push({
          patientId,
          severity: bound.severity,
          ruleId: rule.id,
          ruleName: rule.name,
          title: bound.label,
          description: `${rule.name}: reading ${latest.value} ${latest.unit} ${bound.operator === "gt" ? "exceeds" : "is below"} threshold of ${bound.value} ${latest.unit}.`,
          vitalsSnapshot: {
            vitalType: rule.vitalType,
            value: latest.value,
            unit: latest.unit,
            recordedAt: latest.recordedAt.toISOString(),
          },
        });
        break; // first match wins
      }
    }
  }

  return pending;
}

// ---------------------------------------------------------------------------
// Trend evaluation
// ---------------------------------------------------------------------------

async function evaluateTrendRules(
  db: Database,
  patientId: string,
): Promise<PendingAlert[]> {
  const pending: PendingAlert[] = [];

  for (const rule of trendRules) {
    if (await hasActiveAlert(db, patientId, rule.id)) continue;

    const readings = await getRecentVitals(
      db,
      patientId,
      rule.vitalType,
      rule.consecutiveCount,
    );

    // Need at least N readings.
    if (readings.length < rule.consecutiveCount) continue;

    // Readings come newest-first; reverse for chronological order.
    const chronological = [...readings].reverse();

    let allMatch = true;
    for (let i = 1; i < chronological.length; i++) {
      const prev = chronological[i - 1].value;
      const curr = chronological[i].value;

      if (rule.direction === "rising" && curr <= prev) {
        allMatch = false;
        break;
      }
      if (rule.direction === "falling" && curr >= prev) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) {
      const first = chronological[0];
      const last = chronological[chronological.length - 1];

      pending.push({
        patientId,
        severity: rule.severity,
        ruleId: rule.id,
        ruleName: rule.name,
        title: `${rule.name}: ${rule.consecutiveCount} consecutive ${rule.direction} readings`,
        description: `${rule.vitalType.replace(/_/g, " ")} has been ${rule.direction} over the last ${rule.consecutiveCount} readings (${first.value} ${first.unit} -> ${last.value} ${last.unit}).`,
        vitalsSnapshot: {
          vitalType: rule.vitalType,
          direction: rule.direction,
          readings: chronological.map((r) => ({
            value: r.value,
            unit: r.unit,
            recordedAt: r.recordedAt.toISOString(),
          })),
        },
      });
    }
  }

  return pending;
}

// ---------------------------------------------------------------------------
// Composite evaluation
// ---------------------------------------------------------------------------

async function evaluateCompositeRules(
  db: Database,
  patientId: string,
): Promise<PendingAlert[]> {
  const pending: PendingAlert[] = [];

  for (const rule of compositeRules) {
    if (await hasActiveAlert(db, patientId, rule.id)) continue;

    let metCount = 0;
    const metLabels: string[] = [];
    const snapshot: Record<string, unknown> = {};

    // Special handling for medication non-adherence rule.
    if (rule.id === "composite-med-nonadherence-bp") {
      const missedCount = await getMissedMedCount(db, patientId, 3);
      if (missedCount >= 2) {
        metCount++;
        metLabels.push(`${missedCount} missed doses in past 3 days`);
        snapshot.missedMedDoses = missedCount;
      }

      // Check BP rise condition (the second condition).
      const bpCondition = rule.conditions[1];
      const latest = await getLatestVital(db, patientId, bpCondition.vitalType);
      const baseline = await getVitalNDaysAgo(
        db,
        patientId,
        bpCondition.vitalType,
        bpCondition.deltaOverDays ?? 3,
      );
      if (latest && baseline) {
        const delta = latest.value - baseline.value;
        if (delta > bpCondition.value) {
          metCount++;
          metLabels.push(
            `Systolic BP rose ${delta.toFixed(0)} mmHg over ${bpCondition.deltaOverDays} days`,
          );
          snapshot.bpDelta = delta;
        }
      }
    } else {
      // Generic composite evaluation (e.g. CHF exacerbation).
      for (const condition of rule.conditions) {
        const lookback = condition.deltaOverDays ?? 3;
        const latest = await getLatestVital(db, patientId, condition.vitalType);
        const baseline = await getVitalNDaysAgo(
          db,
          patientId,
          condition.vitalType,
          lookback,
        );

        if (!latest || !baseline) continue;

        const delta = latest.value - baseline.value;
        const triggered =
          condition.operator === "gt"
            ? delta > condition.value
            : delta < condition.value;

        if (triggered) {
          metCount++;
          metLabels.push(condition.label);
          snapshot[condition.vitalType] = {
            current: latest.value,
            baseline: baseline.value,
            delta,
          };
        }
      }
    }

    if (metCount >= rule.minConditionsMet) {
      pending.push({
        patientId,
        severity: rule.severity,
        ruleId: rule.id,
        ruleName: rule.name,
        title: `${rule.name} (${metCount}/${rule.conditions.length} conditions met)`,
        description: `Triggered conditions: ${metLabels.join("; ")}.`,
        vitalsSnapshot: snapshot,
      });
    }
  }

  return pending;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate all clinical rules for a given patient and return an array of
 * pending alerts to be inserted into the database.
 *
 * This function does NOT insert the alerts — the caller is responsible for
 * persisting them so that the operation can be wrapped in a transaction or
 * batched with other writes.
 */
export async function evaluatePatientRules(
  db: Database,
  patientId: string,
): Promise<PendingAlert[]> {
  const [thresholdAlerts, trendAlerts, compositeAlerts] = await Promise.all([
    evaluateThresholdRules(db, patientId),
    evaluateTrendRules(db, patientId),
    evaluateCompositeRules(db, patientId),
  ]);

  return [...thresholdAlerts, ...trendAlerts, ...compositeAlerts];
}
