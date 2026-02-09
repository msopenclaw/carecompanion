import type { ThresholdRule } from "./types";

// ---------------------------------------------------------------------------
// Blood Pressure — Systolic
// ---------------------------------------------------------------------------

export const bpSystolicRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-bp-systolic",
  name: "Blood Pressure (Systolic) Threshold",
  vitalType: "blood_pressure_systolic",
  bounds: [
    {
      operator: "gt",
      value: 180,
      severity: "critical",
      label: "Hypertensive crisis",
    },
    {
      operator: "gt",
      value: 140,
      severity: "elevated",
      label: "Hypertension Stage 2",
    },
  ],
};

// ---------------------------------------------------------------------------
// Blood Pressure — Diastolic
// ---------------------------------------------------------------------------

export const bpDiastolicRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-bp-diastolic",
  name: "Blood Pressure (Diastolic) Threshold",
  vitalType: "blood_pressure_diastolic",
  bounds: [
    {
      operator: "gt",
      value: 120,
      severity: "critical",
      label: "Hypertensive crisis (diastolic)",
    },
    {
      operator: "gt",
      value: 90,
      severity: "elevated",
      label: "Diastolic hypertension",
    },
  ],
};

// ---------------------------------------------------------------------------
// Heart Rate
// ---------------------------------------------------------------------------

export const heartRateRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-heart-rate",
  name: "Heart Rate Threshold",
  vitalType: "heart_rate",
  bounds: [
    {
      operator: "gt",
      value: 120,
      severity: "critical",
      label: "Tachycardia (severe)",
    },
    {
      operator: "lt",
      value: 50,
      severity: "elevated",
      label: "Bradycardia",
    },
    {
      operator: "gt",
      value: 100,
      severity: "elevated",
      label: "Tachycardia (mild)",
    },
  ],
};

// ---------------------------------------------------------------------------
// Blood Glucose
// ---------------------------------------------------------------------------

export const bloodGlucoseRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-blood-glucose",
  name: "Blood Glucose Threshold",
  vitalType: "blood_glucose",
  bounds: [
    {
      operator: "gt",
      value: 300,
      severity: "critical",
      label: "Severe hyperglycemia",
    },
    {
      operator: "lt",
      value: 70,
      severity: "critical",
      label: "Hypoglycemia",
    },
    {
      operator: "gt",
      value: 200,
      severity: "elevated",
      label: "Hyperglycemia",
    },
  ],
};

// ---------------------------------------------------------------------------
// Oxygen Saturation
// ---------------------------------------------------------------------------

export const oxygenSaturationRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-oxygen-saturation",
  name: "Oxygen Saturation Threshold",
  vitalType: "oxygen_saturation",
  bounds: [
    {
      operator: "lt",
      value: 90,
      severity: "critical",
      label: "Severe hypoxemia",
    },
    {
      operator: "lt",
      value: 94,
      severity: "elevated",
      label: "Low oxygen saturation",
    },
  ],
};

// ---------------------------------------------------------------------------
// Temperature
// ---------------------------------------------------------------------------

export const temperatureRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-temperature",
  name: "Temperature Threshold",
  vitalType: "temperature",
  bounds: [
    {
      operator: "gt",
      value: 103,
      severity: "critical",
      label: "High fever",
    },
    {
      operator: "gt",
      value: 100.4,
      severity: "elevated",
      label: "Fever",
    },
  ],
};

// ---------------------------------------------------------------------------
// Weight — sudden daily gain
// ---------------------------------------------------------------------------

export const weightGainRule: ThresholdRule = {
  kind: "threshold",
  id: "threshold-weight-gain",
  name: "Sudden Weight Gain",
  vitalType: "weight",
  // NOTE: The engine treats this value as a *delta* from the previous day's
  // reading rather than an absolute bound.  See engine.ts for the special
  // handling of this rule.
  bounds: [
    {
      operator: "gt",
      value: 3,
      severity: "elevated",
      label: "Sudden weight gain (>3 lbs/day)",
    },
  ],
};

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const thresholdRules: ThresholdRule[] = [
  bpSystolicRule,
  bpDiastolicRule,
  heartRateRule,
  bloodGlucoseRule,
  oxygenSaturationRule,
  temperatureRule,
  weightGainRule,
];
