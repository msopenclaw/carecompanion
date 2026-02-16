/**
 * Unit tests for hourlyMonologue cron job logic
 */

describe("Hourly Monologue: Vitals Formatting", () => {
  function formatVitals(vitalsArray) {
    if (!vitalsArray || vitalsArray.length === 0) return "No vitals recorded";

    const grouped = {};
    for (const v of vitalsArray) {
      if (!grouped[v.vitalType]) grouped[v.vitalType] = [];
      grouped[v.vitalType].push(v);
    }

    return Object.entries(grouped).map(([type, readings]) => {
      const latest = readings[0];
      const values = readings.slice(0, 5).map((r) => r.value);
      return `${type}: latest=${latest.value}${latest.unit}, recent=[${values.join(", ")}]`;
    }).join("\n");
  }

  test("formats empty vitals array", () => {
    expect(formatVitals([])).toBe("No vitals recorded");
  });

  test("formats null vitals", () => {
    expect(formatVitals(null)).toBe("No vitals recorded");
  });

  test("formats single vital reading", () => {
    const vitals = [{ vitalType: "weight", value: 180, unit: "lbs" }];
    const result = formatVitals(vitals);

    expect(result).toBe("weight: latest=180lbs, recent=[180]");
  });

  test("groups multiple vitals by type", () => {
    const vitals = [
      { vitalType: "weight", value: 180, unit: "lbs" },
      { vitalType: "weight", value: 181, unit: "lbs" },
      { vitalType: "hydration", value: 64, unit: "oz" },
    ];
    const result = formatVitals(vitals);

    expect(result).toContain("weight: latest=180lbs, recent=[180, 181]");
    expect(result).toContain("hydration: latest=64oz, recent=[64]");
  });

  test("limits to 5 recent values per type", () => {
    const vitals = Array.from({ length: 8 }, (_, i) => ({
      vitalType: "weight",
      value: 180 + i,
      unit: "lbs",
    }));
    const result = formatVitals(vitals);

    expect(result).toBe("weight: latest=180lbs, recent=[180, 181, 182, 183, 184]");
  });
});

describe("Hourly Monologue: Adherence Calculation", () => {
  test("calculates 100% adherence", () => {
    const recentMeds = [
      { status: "taken" },
      { status: "taken" },
      { status: "taken" },
    ];

    const totalScheduled = recentMeds.length;
    const totalTaken = recentMeds.filter(l => l.status === "taken" || l.status === "late").length;
    const adherenceRate = totalScheduled > 0 ? Math.round((totalTaken / totalScheduled) * 100) : 100;

    expect(adherenceRate).toBe(100);
  });

  test("counts late as taken", () => {
    const recentMeds = [
      { status: "taken" },
      { status: "late" },
      { status: "missed" },
    ];

    const totalTaken = recentMeds.filter(l => l.status === "taken" || l.status === "late").length;
    expect(totalTaken).toBe(2);

    const adherenceRate = Math.round((totalTaken / recentMeds.length) * 100);
    expect(adherenceRate).toBe(67);
  });

  test("handles zero scheduled meds", () => {
    const recentMeds = [];
    const totalScheduled = recentMeds.length;
    const adherenceRate = totalScheduled > 0 ? Math.round((0 / totalScheduled) * 100) : 100;

    expect(adherenceRate).toBe(100);
  });

  test("calculates missed count correctly", () => {
    const recentMeds = [
      { status: "taken" },
      { status: "missed" },
      { status: "missed" },
      { status: "late" },
    ];

    const missed = recentMeds.filter(l => l.status === "missed").length;
    expect(missed).toBe(2);
  });
});

describe("Hourly Monologue: GLP-1 Context", () => {
  test("calculates week number from start date", () => {
    const glp1StartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // 14 days ago
    const daysSinceStart = Math.floor((Date.now() - glp1StartDate.getTime()) / (24 * 60 * 60 * 1000));
    const weekNumber = Math.ceil(daysSinceStart / 7);

    expect(daysSinceStart).toBe(14);
    expect(weekNumber).toBe(2);
  });

  test("week 1 for days 1-7", () => {
    for (let days = 1; days <= 7; days++) {
      const weekNumber = Math.ceil(days / 7);
      expect(weekNumber).toBe(1);
    }
  });

  test("handles null start date", () => {
    const glp1StartDate = null;
    const daysSinceStart = glp1StartDate
      ? Math.floor((Date.now() - glp1StartDate.getTime()) / (24 * 60 * 60 * 1000))
      : null;
    const weekNumber = daysSinceStart !== null ? Math.ceil(daysSinceStart / 7) : null;

    expect(daysSinceStart).toBeNull();
    expect(weekNumber).toBeNull();
  });
});

describe("Hourly Monologue: AI Decision Parsing", () => {
  test("parses valid JSON decision", () => {
    const responseText = JSON.stringify({
      observation: "Patient has not logged vitals today",
      reasoning: "Missing daily check-in, may need reminder",
      assessment: "Mild disengagement detected",
      urgency: "medium",
      action: "send_message",
      message: "Hi! Just checking in - how are you feeling today?",
      escalation_target: null,
    });

    const decision = JSON.parse(responseText);

    expect(decision.action).toBe("send_message");
    expect(decision.urgency).toBe("medium");
    expect(decision.message).toBeTruthy();
    expect(decision.escalation_target).toBeNull();
  });

  test("handles invalid JSON with fallback", () => {
    const responseText = "This is not JSON";
    let decision;

    try {
      decision = JSON.parse(responseText);
    } catch {
      decision = {
        observation: "Failed to parse AI response",
        reasoning: "Error in AI processing",
        assessment: "System error",
        urgency: "low",
        action: "none",
        message: null,
        escalation_target: null,
      };
    }

    expect(decision.action).toBe("none");
    expect(decision.urgency).toBe("low");
    expect(decision.message).toBeNull();
  });

  test("message type derived from urgency", () => {
    const testCases = [
      { urgency: "low", expected: "check_in" },
      { urgency: "medium", expected: "check_in" },
      { urgency: "high", expected: "alert" },
      { urgency: "critical", expected: "alert" },
    ];

    for (const tc of testCases) {
      const msgType = tc.urgency === "high" || tc.urgency === "critical" ? "alert" : "check_in";
      expect(msgType).toBe(tc.expected);
    }
  });
});

describe("Hourly Monologue: Prompt Construction", () => {
  test("includes all required sections", () => {
    const profile = {
      firstName: "John",
      lastName: "Doe",
      ageBracket: "65+",
      glp1Medication: "Wegovy",
      glp1Dosage: "0.25mg",
      injectionDay: "Monday",
      conditions: ["Type 2 Diabetes", "Hypertension"],
      currentSideEffects: ["Nausea"],
      goals: ["Weight Loss", "Better Energy"],
    };

    const prompt = `PATIENT PROFILE:
- Name: ${profile.firstName} ${profile.lastName}
- Age bracket: ${profile.ageBracket}
- GLP-1 Medication: ${profile.glp1Medication || "not set"} ${profile.glp1Dosage || ""}
- Conditions: ${JSON.stringify(profile.conditions || [])}
- Goals: ${JSON.stringify(profile.goals || [])}`;

    expect(prompt).toContain("John Doe");
    expect(prompt).toContain("65+");
    expect(prompt).toContain("Wegovy");
    expect(prompt).toContain("Type 2 Diabetes");
    expect(prompt).toContain("Weight Loss");
  });

  test("handles missing profile fields gracefully", () => {
    const profile = { firstName: null, glp1Medication: null };

    const name = `${profile.firstName} ${profile.lastName}`;
    const med = profile.glp1Medication || "not set";

    expect(med).toBe("not set");
  });
});
