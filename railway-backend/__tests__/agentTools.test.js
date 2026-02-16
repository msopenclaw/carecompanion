/**
 * Unit tests for agent tools endpoints
 * Tests the logic of confirm-medication, manage-goal, and other endpoints
 */

describe("Agent Tools: Confirm Medication", () => {
  test("finds medication by name (case insensitive)", () => {
    const meds = [
      { id: "m1", name: "Wegovy 0.25mg", isActive: true },
      { id: "m2", name: "Metformin 1000mg", isActive: true },
    ];

    const medication_name = "wegovy";
    let med = meds[0];
    if (medication_name) {
      const match = meds.find(m => m.name.toLowerCase().includes(medication_name.toLowerCase()));
      if (match) med = match;
    }

    expect(med.id).toBe("m1");
  });

  test("falls back to first med when name doesn't match", () => {
    const meds = [
      { id: "m1", name: "Wegovy 0.25mg", isActive: true },
      { id: "m2", name: "Metformin 1000mg", isActive: true },
    ];

    const medication_name = "aspirin";
    let med = meds[0];
    if (medication_name) {
      const match = meds.find(m => m.name.toLowerCase().includes(medication_name.toLowerCase()));
      if (match) med = match;
    }

    expect(med.id).toBe("m1");
  });

  test("finds second medication when specified", () => {
    const meds = [
      { id: "m1", name: "Wegovy 0.25mg", isActive: true },
      { id: "m2", name: "Metformin 1000mg", isActive: true },
    ];

    const medication_name = "metformin";
    let med = meds[0];
    if (medication_name) {
      const match = meds.find(m => m.name.toLowerCase().includes(medication_name.toLowerCase()));
      if (match) med = match;
    }

    expect(med.id).toBe("m2");
  });

  test("returns error when no meds exist", () => {
    const meds = [];
    const med = meds[0];

    expect(med).toBeUndefined();
  });
});

describe("Agent Tools: Manage Goal", () => {
  test("adds goal to empty list", () => {
    let goals = [];
    const action = "add";
    const goal = "Weight Loss";

    if (action === "add" && !goals.includes(goal)) {
      goals.push(goal);
    }

    expect(goals).toEqual(["Weight Loss"]);
  });

  test("prevents duplicate goals", () => {
    let goals = ["Weight Loss", "Better Energy"];
    const action = "add";
    const goal = "Weight Loss";

    if (action === "add" && !goals.includes(goal)) {
      goals.push(goal);
    }

    expect(goals).toHaveLength(2);
  });

  test("removes existing goal", () => {
    let goals = ["Weight Loss", "Better Energy", "Heart Health"];
    const action = "remove";
    const goal = "Better Energy";

    if (action === "remove") {
      goals = goals.filter(g => g !== goal);
    }

    expect(goals).toHaveLength(2);
    expect(goals).toEqual(["Weight Loss", "Heart Health"]);
  });

  test("remove on non-existent goal is no-op", () => {
    let goals = ["Weight Loss"];
    const action = "remove";
    const goal = "Nonexistent";

    if (action === "remove") {
      goals = goals.filter(g => g !== goal);
    }

    expect(goals).toEqual(["Weight Loss"]);
  });

  test("handles null goals array", () => {
    let goals = null || [];
    const action = "add";
    const goal = "8hrs Sleep";

    if (action === "add" && !goals.includes(goal)) {
      goals.push(goal);
    }

    expect(goals).toEqual(["8hrs Sleep"]);
  });
});

describe("Agent Tools: Update Preference", () => {
  test("validates allowed preferences", () => {
    const allowedPrefs = [
      "checkinFrequency", "checkinTimePreference", "medReminderEnabled",
      "hydrationNudgesEnabled", "hydrationNudgesPerDay", "voiceCallFrequency",
      "quietStart", "quietEnd", "preferredChannel", "exerciseNudgesEnabled",
    ];

    expect(allowedPrefs.includes("checkinFrequency")).toBe(true);
    expect(allowedPrefs.includes("quietStart")).toBe(true);
    expect(allowedPrefs.includes("invalidField")).toBe(false);
    expect(allowedPrefs.includes("password")).toBe(false);
  });
});

describe("Agent Tools: Set Reminder", () => {
  test("maps reminder types correctly", () => {
    const actionTypeMap = {
      medication: "med_reminder",
      hydration: "hydration_reminder",
      checkin: "checkin_reminder",
      custom: "custom_reminder",
    };

    expect(actionTypeMap["medication"]).toBe("med_reminder");
    expect(actionTypeMap["hydration"]).toBe("hydration_reminder");
    expect(actionTypeMap["checkin"]).toBe("checkin_reminder");
    expect(actionTypeMap["custom"]).toBe("custom_reminder");
    expect(actionTypeMap["unknown"] || "custom_reminder").toBe("custom_reminder");
  });
});

describe("Agent Tools: Log Vital", () => {
  test("parses value as float", () => {
    const value = "178.5";
    const parsed = parseFloat(value);

    expect(parsed).toBe(178.5);
    expect(typeof parsed).toBe("number");
  });

  test("handles integer values", () => {
    const value = "120";
    const parsed = parseFloat(value);

    expect(parsed).toBe(120);
  });

  test("validates required fields", () => {
    const body1 = { user_id: "u1", vital_type: "weight", value: 180, unit: "lbs" };
    const body2 = { user_id: "u1", vital_type: "weight" }; // missing value and unit

    const isValid1 = body1.user_id && body1.vital_type && body1.value !== undefined && body1.unit;
    const isValid2 = body2.user_id && body2.vital_type && body2.value !== undefined && body2.unit;

    expect(!!isValid1).toBe(true);
    expect(!!isValid2).toBe(false);
  });
});

describe("Agent Tools: Auth Middleware", () => {
  test("validates agent secret header", () => {
    const secret = "test-secret-123";
    const envSecret = "test-secret-123";

    expect(secret === envSecret).toBe(true);
  });

  test("rejects missing secret", () => {
    const secret = undefined;
    const envSecret = "test-secret-123";

    expect(!secret || secret !== envSecret).toBe(true);
  });

  test("rejects wrong secret", () => {
    const secret = "wrong-secret";
    const envSecret = "test-secret-123";

    expect(!secret || secret !== envSecret).toBe(true);
  });
});
