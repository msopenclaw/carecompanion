import type { CompositeRule } from "./types";

// ---------------------------------------------------------------------------
// CHF Exacerbation
// ---------------------------------------------------------------------------
// Congestive Heart Failure exacerbation is indicated when at least 2 of the
// following 3 conditions are observed within the look-back window:
//   1. Weight gain > 3 lbs over 3 days
//   2. Systolic BP rise > 20 mmHg over 3 days
//   3. Heart rate increase > 15 bpm over 3 days
// ---------------------------------------------------------------------------

export const chfExacerbationRule: CompositeRule = {
  kind: "composite",
  id: "composite-chf-exacerbation",
  name: "CHF Exacerbation Detection",
  conditions: [
    {
      vitalType: "weight",
      operator: "gt",
      value: 3, // lbs gain
      deltaOverDays: 3,
      label: "Weight gain > 3 lbs over 3 days",
    },
    {
      vitalType: "blood_pressure_systolic",
      operator: "gt",
      value: 20, // mmHg rise
      deltaOverDays: 3,
      label: "Systolic BP rise > 20 mmHg over 3 days",
    },
    {
      vitalType: "heart_rate",
      operator: "gt",
      value: 15, // bpm increase
      deltaOverDays: 3,
      label: "Heart rate increase > 15 bpm over 3 days",
    },
  ],
  minConditionsMet: 2,
  severity: "critical",
};

// ---------------------------------------------------------------------------
// Medication Non-Adherence + Blood Pressure Correlation
// ---------------------------------------------------------------------------
// When a patient has missed 2+ medication doses in the past 3 days AND
// systolic BP has risen by more than 15 mmHg over the same period, flag
// potential correlation between non-adherence and worsening hypertension.
//
// NOTE: The medication adherence check is handled specially inside the engine
// (it queries medication_logs rather than vitals).  We model it here as a
// composite rule so it lives alongside other multi-factor rules, but the
// engine is aware that `vitalType: "blood_pressure_systolic"` with
// `deltaOverDays` is the only vitals condition — the adherence gate is
// evaluated separately.
// ---------------------------------------------------------------------------

export const medNonAdherenceBpRule: CompositeRule = {
  kind: "composite",
  id: "composite-med-nonadherence-bp",
  name: "Medication Non-Adherence + BP Rise",
  conditions: [
    {
      // This condition is a marker — the engine checks missed med logs.
      vitalType: "blood_pressure_systolic",
      operator: "gt",
      value: 0, // placeholder; engine checks med adherence separately
      deltaOverDays: 3,
      label: "2+ missed medication doses in past 3 days",
    },
    {
      vitalType: "blood_pressure_systolic",
      operator: "gt",
      value: 15, // mmHg rise
      deltaOverDays: 3,
      label: "Systolic BP rise > 15 mmHg over 3 days",
    },
  ],
  minConditionsMet: 2,
  severity: "elevated",
};

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const compositeRules: CompositeRule[] = [
  chfExacerbationRule,
  medNonAdherenceBpRule,
];
