import type { VitalType } from "@/lib/rules/types";

// ---------------------------------------------------------------------------
// Display names
// ---------------------------------------------------------------------------

const VITAL_DISPLAY_NAMES: Record<VitalType, string> = {
  blood_pressure_systolic: "Blood Pressure (Systolic)",
  blood_pressure_diastolic: "Blood Pressure (Diastolic)",
  heart_rate: "Heart Rate",
  blood_glucose: "Blood Glucose",
  weight: "Weight",
  oxygen_saturation: "Oxygen Saturation",
  temperature: "Temperature",
};

/**
 * Return a human-friendly display name for a vital type.
 */
export function getVitalDisplayName(type: VitalType): string {
  return VITAL_DISPLAY_NAMES[type] ?? type;
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

const VITAL_UNITS: Record<VitalType, string> = {
  blood_pressure_systolic: "mmHg",
  blood_pressure_diastolic: "mmHg",
  heart_rate: "bpm",
  blood_glucose: "mg/dL",
  weight: "lbs",
  oxygen_saturation: "%",
  temperature: "\u00B0F",
};

/**
 * Return the standard unit string for a vital type.
 */
export function getVitalUnit(type: VitalType): string {
  return VITAL_UNITS[type] ?? "";
}

// ---------------------------------------------------------------------------
// Chart colors
// ---------------------------------------------------------------------------

const VITAL_COLORS: Record<VitalType, string> = {
  blood_pressure_systolic: "#ef4444", // red-500
  blood_pressure_diastolic: "#f97316", // orange-500
  heart_rate: "#ec4899", // pink-500
  blood_glucose: "#8b5cf6", // violet-500
  weight: "#3b82f6", // blue-500
  oxygen_saturation: "#06b6d4", // cyan-500
  temperature: "#f59e0b", // amber-500
};

/**
 * Return a hex color string suitable for Recharts series for a vital type.
 */
export function getVitalColor(type: VitalType): string {
  return VITAL_COLORS[type] ?? "#6b7280"; // gray-500 fallback
}

// ---------------------------------------------------------------------------
// Normal ranges
// ---------------------------------------------------------------------------

interface NormalRange {
  min: number;
  max: number;
}

const VITAL_NORMAL_RANGES: Record<VitalType, NormalRange> = {
  blood_pressure_systolic: { min: 90, max: 120 },
  blood_pressure_diastolic: { min: 60, max: 80 },
  heart_rate: { min: 60, max: 100 },
  blood_glucose: { min: 70, max: 140 },
  weight: { min: 0, max: 0 }, // Weight ranges are patient-specific; 0 means "no universal range"
  oxygen_saturation: { min: 95, max: 100 },
  temperature: { min: 97.0, max: 99.0 },
};

/**
 * Return the normal range boundaries for a vital type.
 * Used for reference-area shading on charts.
 *
 * Note: Weight does not have a universal normal range (min/max will both be 0).
 * The caller should handle this case (e.g. skip the reference area).
 */
export function getVitalNormalRange(type: VitalType): NormalRange {
  return VITAL_NORMAL_RANGES[type] ?? { min: 0, max: 0 };
}

// ---------------------------------------------------------------------------
// Trend arrows
// ---------------------------------------------------------------------------

export type TrendDirection = "up" | "down" | "stable";

/**
 * Compare two sequential vital readings and return a simple trend indicator.
 *
 * @param current  - The most recent reading value.
 * @param previous - The prior reading value.
 * @param threshold - Minimum absolute change to be considered non-stable.
 *                    Defaults to 0 (any change counts). Set higher to avoid
 *                    noise (e.g. 2 for BP, 0.1 for temperature).
 */
export function getTrendArrow(
  current: number,
  previous: number,
  threshold: number = 0,
): TrendDirection {
  const delta = current - previous;
  if (Math.abs(delta) <= threshold) return "stable";
  return delta > 0 ? "up" : "down";
}

// ---------------------------------------------------------------------------
// Status badge colors
// ---------------------------------------------------------------------------

export type StatusBadge = "green" | "yellow" | "red";

interface StatusStyle {
  bg: string;
  text: string;
  border: string;
  dot: string;
  label: string;
}

const STATUS_STYLES: Record<StatusBadge, StatusStyle> = {
  green: {
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
    label: "Stable",
  },
  yellow: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
    label: "Needs Attention",
  },
  red: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
    label: "Critical",
  },
};

/**
 * Return Tailwind CSS utility classes for a patient status badge.
 *
 * Usage example:
 * ```tsx
 * const style = getStatusColor("yellow");
 * <span className={`${style.bg} ${style.text} ${style.border}`}>
 *   {style.label}
 * </span>
 * ```
 */
export function getStatusColor(badge: StatusBadge): StatusStyle {
  return STATUS_STYLES[badge] ?? STATUS_STYLES.green;
}

// ---------------------------------------------------------------------------
// Alert severity colors (convenience)
// ---------------------------------------------------------------------------

export type AlertSeverity = "critical" | "elevated" | "informational";

interface SeverityStyle {
  bg: string;
  text: string;
  border: string;
  icon: string;
  label: string;
}

const SEVERITY_STYLES: Record<AlertSeverity, SeverityStyle> = {
  critical: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    icon: "text-red-500",
    label: "Critical",
  },
  elevated: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    icon: "text-amber-500",
    label: "Elevated",
  },
  informational: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    icon: "text-blue-500",
    label: "Informational",
  },
};

/**
 * Return Tailwind CSS utility classes for an alert severity level.
 */
export function getSeverityColor(severity: AlertSeverity): SeverityStyle {
  return SEVERITY_STYLES[severity] ?? SEVERITY_STYLES.informational;
}
