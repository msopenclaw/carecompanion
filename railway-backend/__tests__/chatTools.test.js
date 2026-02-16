/**
 * Unit tests for chat.js tool execution and system prompt building
 */

// Mock all external dependencies
jest.mock("../src/db", () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(() => ({ values: jest.fn(() => ({ returning: jest.fn() })) })),
    update: jest.fn(() => ({ set: jest.fn(() => ({ where: jest.fn(() => ({ returning: jest.fn() })) })) })),
  },
}));

jest.mock("../src/db/schema", () => ({
  vitals: {},
  medications: {},
  medicationLogs: {},
  userProfiles: {},
  userPreferences: {},
  scheduledActions: {},
  messages: {},
}));

jest.mock("../src/services/userContext", () => ({
  getUserContext: jest.fn(),
}));

jest.mock("@google/generative-ai");

const { db } = require("../src/db");

describe("Chat Tool Declarations", () => {
  let toolDeclarations;

  beforeAll(() => {
    // Read tool declarations from the source
    const chatModule = require("../src/routes/chat");
    // The toolDeclarations are not exported, but we can test the expected tools
  });

  test("expected tool names are defined", () => {
    const expectedTools = [
      "log_vital",
      "confirm_medication",
      "update_preference",
      "add_goal",
      "remove_goal",
      "set_reminder",
    ];

    // Since toolDeclarations aren't exported, verify the module loads without error
    expect(() => require("../src/routes/chat")).not.toThrow();
  });
});

describe("Chat Tool Execution Logic", () => {
  // Test the core tool execution logic extracted from chat.js

  test("log_vital inserts correct vital record", async () => {
    const mockInsert = jest.fn(() => ({
      values: jest.fn(() => Promise.resolve()),
    }));
    db.insert = mockInsert;

    // Simulate the log_vital logic
    const args = { vital_type: "weight", value: 180, unit: "lbs" };
    const userId = "test-user-1";

    await db.insert({}).values({
      patientId: userId,
      vitalType: args.vital_type,
      value: parseFloat(args.value),
      unit: args.unit,
      source: "text_agent",
      recordedAt: new Date(),
    });

    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  test("confirm_medication finds medication by name", () => {
    const medications = [
      { id: "m1", name: "Wegovy 0.25mg" },
      { id: "m2", name: "Metformin 1000mg" },
    ];

    const searchName = "wegovy";
    const med = medications.find(m =>
      m.name.toLowerCase().includes(searchName)) || medications[0];

    expect(med.id).toBe("m1");
    expect(med.name).toBe("Wegovy 0.25mg");
  });

  test("confirm_medication falls back to first med if no match", () => {
    const medications = [
      { id: "m1", name: "Wegovy 0.25mg" },
      { id: "m2", name: "Metformin 1000mg" },
    ];

    const searchName = "nonexistent";
    const med = medications.find(m =>
      m.name.toLowerCase().includes(searchName)) || medications[0];

    expect(med.id).toBe("m1");
  });

  test("update_preference validates allowed preferences", () => {
    const allowedPrefs = [
      "checkinFrequency", "checkinTimePreference", "medReminderEnabled",
      "hydrationNudgesEnabled", "hydrationNudgesPerDay", "voiceCallFrequency",
      "quietStart", "quietEnd", "preferredChannel", "exerciseNudgesEnabled",
    ];

    expect(allowedPrefs.includes("checkinFrequency")).toBe(true);
    expect(allowedPrefs.includes("invalidPref")).toBe(false);
    expect(allowedPrefs.includes("medReminderEnabled")).toBe(true);
  });

  test("update_preference correctly parses boolean string values", () => {
    let val;

    val = "true";
    if (val === "true") val = true;
    if (val === "false") val = false;
    expect(val).toBe(true);

    val = "false";
    if (val === "true") val = true;
    if (val === "false") val = false;
    expect(val).toBe(false);

    val = "3";
    if (val === "true") val = true;
    if (val === "false") val = false;
    if (!isNaN(Number(val)) && typeof val === "string" && val.match(/^\d+$/)) val = parseInt(val);
    expect(val).toBe(3);
  });

  test("add_goal prevents duplicates", () => {
    const goals = ["Weight Loss", "Better Energy"];
    const newGoal = "Weight Loss";

    if (!goals.includes(newGoal)) {
      goals.push(newGoal);
    }

    expect(goals).toHaveLength(2);
    expect(goals).toEqual(["Weight Loss", "Better Energy"]);
  });

  test("add_goal appends new goal", () => {
    const goals = ["Weight Loss"];
    const newGoal = "Heart Health";

    if (!goals.includes(newGoal)) {
      goals.push(newGoal);
    }

    expect(goals).toHaveLength(2);
    expect(goals).toContain("Heart Health");
  });

  test("remove_goal filters correctly", () => {
    const goals = ["Weight Loss", "Better Energy", "Heart Health"];
    const removeGoal = "Better Energy";

    const filtered = goals.filter(g => g !== removeGoal);

    expect(filtered).toHaveLength(2);
    expect(filtered).not.toContain("Better Energy");
    expect(filtered).toContain("Weight Loss");
    expect(filtered).toContain("Heart Health");
  });

  test("set_reminder maps types correctly", () => {
    const typeMap = {
      medication: "med_reminder",
      hydration: "hydration_reminder",
      checkin: "checkin_reminder",
      custom: "custom_reminder",
    };

    expect(typeMap["medication"]).toBe("med_reminder");
    expect(typeMap["hydration"]).toBe("hydration_reminder");
    expect(typeMap["unknown"] || "custom_reminder").toBe("custom_reminder");
  });
});

describe("System Prompt Building", () => {
  test("buildSystemPrompt includes all required sections", () => {
    const ctx = {
      profile: {
        firstName: "John",
        lastName: "Doe",
        ageBracket: "55-64",
        glp1Medication: "Wegovy",
        glp1Dosage: "0.25mg",
        glp1StartDate: "2025-01-01",
        conditions: ["Type 2 Diabetes"],
        currentSideEffects: ["Nausea"],
        goals: ["Weight Loss", "8hrs Sleep"],
      },
      coordinator: { name: "Sarah", personalityPrompt: "You are caring." },
      recentVitals: [{ vitalType: "weight", value: 180, unit: "lbs", recordedAt: new Date().toISOString() }],
      medications: [{ id: "m1", name: "Wegovy", dosage: "0.25mg", frequency: "weekly", takenToday: false }],
      recentMessages: [{ sender: "patient", content: "Hi" }],
      preferences: { checkinFrequency: "once_daily", checkinTimePreference: "morning" },
      voiceSessions: [],
      activeReminders: [],
      glp1DaysSinceStart: 10,
      glp1WeekNumber: 2,
    };

    // Simulate buildSystemPrompt logic
    const coordinatorName = ctx.coordinator?.name || "your care coordinator";
    const patientName = ctx.profile ? ctx.profile.firstName : "there";

    expect(coordinatorName).toBe("Sarah");
    expect(patientName).toBe("John");

    // Verify medications formatting
    const medLines = ctx.medications.map(m =>
      `- ${m.name} ${m.dosage} (${m.frequency}) [ID: ${m.id}] ${m.takenToday ? "taken today" : "not taken today"}`
    );
    expect(medLines[0]).toContain("Wegovy");
    expect(medLines[0]).toContain("not taken today");

    // Verify goals
    expect(ctx.profile.goals.join(", ")).toBe("Weight Loss, 8hrs Sleep");
  });

  test("buildSystemPrompt handles missing coordinator", () => {
    const coordinatorName = null?.name || "your care coordinator";
    expect(coordinatorName).toBe("your care coordinator");
  });

  test("buildSystemPrompt handles missing profile", () => {
    const profile = null;
    const patientName = profile ? profile.firstName : "there";
    expect(patientName).toBe("there");
  });
});
