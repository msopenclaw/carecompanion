import type { TrendRule } from "./types";

// ---------------------------------------------------------------------------
// Blood Pressure — Systolic trends
// ---------------------------------------------------------------------------

export const bpSystolicRisingTrend: TrendRule = {
  kind: "trend",
  id: "trend-bp-systolic-rising",
  name: "Rising Systolic BP Trend",
  vitalType: "blood_pressure_systolic",
  consecutiveCount: 3,
  direction: "rising",
  severity: "elevated",
};

export const bpSystolicFallingTrend: TrendRule = {
  kind: "trend",
  id: "trend-bp-systolic-falling",
  name: "Falling Systolic BP Trend",
  vitalType: "blood_pressure_systolic",
  consecutiveCount: 3,
  direction: "falling",
  severity: "elevated",
};

// ---------------------------------------------------------------------------
// Blood Pressure — Diastolic trends
// ---------------------------------------------------------------------------

export const bpDiastolicRisingTrend: TrendRule = {
  kind: "trend",
  id: "trend-bp-diastolic-rising",
  name: "Rising Diastolic BP Trend",
  vitalType: "blood_pressure_diastolic",
  consecutiveCount: 3,
  direction: "rising",
  severity: "elevated",
};

export const bpDiastolicFallingTrend: TrendRule = {
  kind: "trend",
  id: "trend-bp-diastolic-falling",
  name: "Falling Diastolic BP Trend",
  vitalType: "blood_pressure_diastolic",
  consecutiveCount: 3,
  direction: "falling",
  severity: "elevated",
};

// ---------------------------------------------------------------------------
// Blood Glucose trends
// ---------------------------------------------------------------------------

export const glucoseRisingTrend: TrendRule = {
  kind: "trend",
  id: "trend-glucose-rising",
  name: "Rising Blood Glucose Trend",
  vitalType: "blood_glucose",
  consecutiveCount: 3,
  direction: "rising",
  severity: "elevated",
};

export const glucoseFallingTrend: TrendRule = {
  kind: "trend",
  id: "trend-glucose-falling",
  name: "Falling Blood Glucose Trend",
  vitalType: "blood_glucose",
  consecutiveCount: 3,
  direction: "falling",
  severity: "elevated",
};

// ---------------------------------------------------------------------------
// Weight trends
// ---------------------------------------------------------------------------

export const weightRisingTrend: TrendRule = {
  kind: "trend",
  id: "trend-weight-rising",
  name: "Rising Weight Trend",
  vitalType: "weight",
  consecutiveCount: 3,
  direction: "rising",
  severity: "elevated",
};

export const weightFallingTrend: TrendRule = {
  kind: "trend",
  id: "trend-weight-falling",
  name: "Falling Weight Trend",
  vitalType: "weight",
  consecutiveCount: 3,
  direction: "falling",
  severity: "informational",
};

// ---------------------------------------------------------------------------
// Heart Rate trends
// ---------------------------------------------------------------------------

export const heartRateRisingTrend: TrendRule = {
  kind: "trend",
  id: "trend-heart-rate-rising",
  name: "Rising Heart Rate Trend",
  vitalType: "heart_rate",
  consecutiveCount: 3,
  direction: "rising",
  severity: "elevated",
};

export const heartRateFallingTrend: TrendRule = {
  kind: "trend",
  id: "trend-heart-rate-falling",
  name: "Falling Heart Rate Trend",
  vitalType: "heart_rate",
  consecutiveCount: 3,
  direction: "falling",
  severity: "informational",
};

// ---------------------------------------------------------------------------
// Aggregate export
// ---------------------------------------------------------------------------

export const trendRules: TrendRule[] = [
  bpSystolicRisingTrend,
  bpSystolicFallingTrend,
  bpDiastolicRisingTrend,
  bpDiastolicFallingTrend,
  glucoseRisingTrend,
  glucoseFallingTrend,
  weightRisingTrend,
  weightFallingTrend,
  heartRateRisingTrend,
  heartRateFallingTrend,
];
