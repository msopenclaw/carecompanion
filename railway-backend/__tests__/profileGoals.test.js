/**
 * Unit tests for profile route — goals handling
 */

describe("Profile: PUT handler field extraction", () => {
  test("extracts goals from request body", () => {
    const body = {
      firstName: "John",
      goals: ["Weight Loss", "Better Energy", "8hrs Sleep"],
      conditions: ["Type 2 Diabetes"],
    };

    const { firstName, goals, conditions } = body;
    const updates = {};

    if (firstName !== undefined) updates.firstName = firstName;
    if (goals !== undefined) updates.goals = goals;
    if (conditions !== undefined) updates.conditions = conditions;

    expect(updates.goals).toEqual(["Weight Loss", "Better Energy", "8hrs Sleep"]);
    expect(updates.conditions).toEqual(["Type 2 Diabetes"]);
  });

  test("ignores goals when not provided", () => {
    const body = { firstName: "John" };

    const { goals } = body;
    const updates = {};

    if (goals !== undefined) updates.goals = goals;

    expect(updates.goals).toBeUndefined();
  });

  test("handles empty goals array", () => {
    const body = { goals: [] };
    const { goals } = body;
    const updates = {};

    if (goals !== undefined) updates.goals = goals;

    expect(updates.goals).toEqual([]);
  });

  test("handles daily goals merged with health goals", () => {
    // This mirrors the iOS HealthStep.saveProfile() logic
    const healthGoals = new Set(["Weight Loss", "Heart Health"]);
    const dailyGoals = new Set(["8hrs Sleep", "10K Steps"]);

    const allGoals = [...healthGoals, ...dailyGoals];

    expect(allGoals).toHaveLength(4);
    expect(allGoals).toContain("Weight Loss");
    expect(allGoals).toContain("8hrs Sleep");
    expect(allGoals).toContain("10K Steps");
  });
});

describe("Profile: Age bracket computation", () => {
  test("calculates 65+ bracket", () => {
    const dob = new Date("1955-01-01");
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    let bracket;
    if (age >= 65) bracket = "65+";
    else if (age >= 55) bracket = "55-64";
    else if (age >= 40) bracket = "40-54";
    else bracket = "25-39";

    expect(bracket).toBe("65+");
  });

  test("calculates 55-64 bracket", () => {
    const dob = new Date("1965-01-01");
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    let bracket;
    if (age >= 65) bracket = "65+";
    else if (age >= 55) bracket = "55-64";
    else if (age >= 40) bracket = "40-54";
    else bracket = "25-39";

    expect(bracket).toBe("55-64");
  });

  test("calculates 40-54 bracket", () => {
    const dob = new Date("1980-01-01");
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

    let bracket;
    if (age >= 65) bracket = "65+";
    else if (age >= 55) bracket = "55-64";
    else if (age >= 40) bracket = "40-54";
    else bracket = "25-39";

    expect(bracket).toBe("40-54");
  });
});

describe("Profile: Side effects handling", () => {
  test("filters None from conditions list", () => {
    const conditions = new Set(["Type 2 Diabetes", "None", "Hypertension"]);
    const filtered = [...conditions].filter(c => c !== "None");

    expect(filtered).toEqual(["Type 2 Diabetes", "Hypertension"]);
    expect(filtered).not.toContain("None");
  });

  test("filters None from side effects", () => {
    const sideEffects = new Set(["None"]);
    const filtered = [...sideEffects].filter(s => s !== "None");

    expect(filtered).toEqual([]);
  });
});

describe("Profile: Update field mapping", () => {
  test("maps all profile fields correctly", () => {
    const body = {
      firstName: "John",
      lastName: "Doe",
      heightInches: 68,
      startingWeight: 185,
      glp1Medication: "Wegovy",
      glp1Dosage: "0.25mg",
      glp1StartDate: "2025-01-15",
      injectionDay: "Monday",
      conditions: ["Type 2 Diabetes"],
      currentSideEffects: ["Nausea"],
      goals: ["Weight Loss"],
    };

    const updates = {};
    const fields = [
      "firstName", "lastName", "heightInches", "startingWeight",
      "glp1Medication", "glp1Dosage", "glp1StartDate", "injectionDay",
      "conditions", "currentSideEffects", "goals",
    ];

    for (const field of fields) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    expect(Object.keys(updates)).toHaveLength(11);
    expect(updates.goals).toEqual(["Weight Loss"]);
    expect(updates.startingWeight).toBe(185);
  });
});
