// Severity type mirrors the DB enum values

// ---------------------------------------------------------------------------
// Vital type literal union (mirrors the DB enum)
// ---------------------------------------------------------------------------

export type VitalType =
  | "blood_pressure_systolic"
  | "blood_pressure_diastolic"
  | "heart_rate"
  | "blood_glucose"
  | "weight"
  | "oxygen_saturation"
  | "temperature";

// ---------------------------------------------------------------------------
// Alert severity literal (mirrors the DB enum)
// ---------------------------------------------------------------------------

export type AlertSeverity = "critical" | "elevated" | "informational";

// ---------------------------------------------------------------------------
// Threshold Rule
// ---------------------------------------------------------------------------

/** A single threshold boundary (e.g. systolic > 180 => critical). */
export interface ThresholdBound {
  /** "gt" (greater than) or "lt" (less than). */
  operator: "gt" | "lt";
  value: number;
  severity: AlertSeverity;
  /** Human-readable label shown in the alert title. */
  label: string;
}

/**
 * A threshold rule fires when a single vital reading crosses one of its
 * configured bounds.  Bounds are evaluated from most severe to least severe,
 * so the first matching bound determines the alert.
 */
export interface ThresholdRule {
  kind: "threshold";
  id: string;
  name: string;
  vitalType: VitalType;
  /** Ordered most-severe-first. */
  bounds: ThresholdBound[];
}

// ---------------------------------------------------------------------------
// Trend Rule
// ---------------------------------------------------------------------------

export type TrendDirection = "rising" | "falling";

/**
 * A trend rule fires when N consecutive readings are all
 * rising or all falling, which may signal a deteriorating condition.
 */
export interface TrendRule {
  kind: "trend";
  id: string;
  name: string;
  vitalType: VitalType;
  /** Number of consecutive readings required to trigger. */
  consecutiveCount: number;
  direction: TrendDirection;
  severity: AlertSeverity;
}

// ---------------------------------------------------------------------------
// Composite Rule
// ---------------------------------------------------------------------------

/**
 * A single sub-condition within a composite rule.
 * Each condition references a vital type and its own threshold.
 */
export interface CompositeCondition {
  vitalType: VitalType;
  operator: "gt" | "lt";
  /** Threshold value OR a special keyword like "delta" for delta checks. */
  value: number;
  /**
   * When set, this condition checks the *change* over `lookbackDays` rather
   * than an absolute reading.
   */
  deltaOverDays?: number;
  label: string;
}

/**
 * A composite rule fires when a minimum number of its sub-conditions are all
 * true at the same time.  This allows modeling multi-factor clinical scenarios
 * such as CHF exacerbation (weight gain + BP rise + HR increase).
 */
export interface CompositeRule {
  kind: "composite";
  id: string;
  name: string;
  /** All the sub-conditions to evaluate. */
  conditions: CompositeCondition[];
  /** How many of `conditions` must be true to fire the rule. */
  minConditionsMet: number;
  severity: AlertSeverity;
}

// ---------------------------------------------------------------------------
// Discriminated union of all rule types
// ---------------------------------------------------------------------------

export type ClinicalRule = ThresholdRule | TrendRule | CompositeRule;

// ---------------------------------------------------------------------------
// Alert output (returned by the rules engine before DB insertion)
// ---------------------------------------------------------------------------

export interface PendingAlert {
  patientId: string;
  severity: AlertSeverity;
  ruleId: string;
  ruleName: string;
  title: string;
  description: string;
  vitalsSnapshot: Record<string, unknown>;
}
