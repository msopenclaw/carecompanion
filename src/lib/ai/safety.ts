// ---------------------------------------------------------------------------
// Safety flag types
// ---------------------------------------------------------------------------

export interface SafetyFlags {
  /** The AI response suggests the patient should call 911 / go to the ER. */
  emergencyGuidance: boolean;
  /** The AI response recommends contacting their care provider. */
  providerEscalation: boolean;
  /** Potential policy violations detected in the response. */
  policyViolations: string[];
}

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

/** Phrases that indicate the AI is directing the patient to emergency services. */
const EMERGENCY_PATTERNS: RegExp[] = [
  /call\s+911/i,
  /call\s+emergency/i,
  /go\s+to\s+(the\s+)?(emergency\s+room|ER|nearest\s+hospital)/i,
  /seek\s+(immediate\s+)?emergency\s+(medical\s+)?(care|help|attention|treatment)/i,
  /dial\s+911/i,
  /contact\s+emergency\s+services/i,
  /life[\s-]threatening/i,
  /medical\s+emergency/i,
];

/** Phrases that indicate the AI is recommending provider contact. */
const ESCALATION_PATTERNS: RegExp[] = [
  /contact\s+(your\s+)?(doctor|provider|physician|care\s+team|healthcare)/i,
  /reach\s+out\s+to\s+(your\s+)?(doctor|provider|physician|care\s+team)/i,
  /speak\s+(with|to)\s+(your\s+)?(doctor|provider|physician|care\s+team)/i,
  /schedule\s+(an?\s+)?appointment/i,
  /follow\s+up\s+with\s+(your\s+)?(doctor|provider)/i,
  /let\s+(your\s+)?(doctor|provider|care\s+team)\s+know/i,
  /consult\s+(your\s+)?(doctor|provider|physician)/i,
];

/** Patterns that suggest the AI may be violating safety policy. */
const VIOLATION_CHECKS: { pattern: RegExp; violation: string }[] = [
  {
    pattern: /you\s+(likely\s+)?have\s+[a-zA-Z\s]*(disease|disorder|syndrome|condition|infection|cancer)/i,
    violation: "Possible diagnosis: AI appears to be diagnosing a condition.",
  },
  {
    pattern: /I\s+diagnose/i,
    violation: "Explicit diagnosis language detected.",
  },
  {
    pattern: /you\s+should\s+(take|start|stop|increase|decrease|change)\s+(your\s+)?(?:medication|dosage|dose|prescription|drug)/i,
    violation: "Possible medication recommendation: AI appears to be advising medication changes.",
  },
  {
    pattern: /prescri(be|bing)/i,
    violation: "Prescribing language detected.",
  },
  {
    pattern: /I\s+recommend\s+(you\s+)?(take|start|increase|decrease)\s+\d+\s*(mg|mcg|ml|units)/i,
    violation: "Specific dosage recommendation detected.",
  },
  {
    pattern: /you\s+don'?t\s+need\s+to\s+(see\s+a\s+doctor|go\s+to\s+(the\s+)?hospital|worry)/i,
    violation: "Dismissal of medical concern: AI may be discouraging appropriate care-seeking.",
  },
  {
    pattern: /no\s+need\s+(to\s+)?(see|visit|call)\s+(a\s+|your\s+)?(doctor|provider)/i,
    violation: "Dismissal of provider contact detected.",
  },
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Scan an AI-generated response for safety-relevant signals.
 *
 * Returns flags indicating whether the response contains emergency guidance,
 * provider escalation language, or potential policy violations.
 *
 * This function is designed to run synchronously and should be called
 * immediately after receiving the AI response, before it is stored or
 * displayed to the user.
 */
export function checkSafetyFlags(response: string): SafetyFlags {
  const emergencyGuidance = EMERGENCY_PATTERNS.some((p) => p.test(response));
  const providerEscalation = ESCALATION_PATTERNS.some((p) => p.test(response));

  const policyViolations: string[] = [];
  for (const check of VIOLATION_CHECKS) {
    if (check.pattern.test(response)) {
      policyViolations.push(check.violation);
    }
  }

  return {
    emergencyGuidance,
    providerEscalation,
    policyViolations,
  };
}

/**
 * Returns true if the safety check found any policy violations that should
 * block or flag the response before displaying to the user.
 */
export function hasPolicyViolations(flags: SafetyFlags): boolean {
  return flags.policyViolations.length > 0;
}

/**
 * Returns true if the response contains any safety-relevant signals
 * (emergency, escalation, or violations).
 */
export function hasAnySafetySignal(flags: SafetyFlags): boolean {
  return (
    flags.emergencyGuidance ||
    flags.providerEscalation ||
    flags.policyViolations.length > 0
  );
}
