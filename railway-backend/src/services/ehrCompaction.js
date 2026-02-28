const { eq, desc, gte, ne, and } = require("drizzle-orm");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs");
const path = require("path");
const { db } = require("../db");
const {
  healthRecords, patientMemory, userProfiles, vitals, medications,
  medicationLogs, userPreferences, mealLogs,
} = require("../db/schema");
const { decrypt, decryptJson } = require("./encryption");

// ---------------------------------------------------------------------------
// processHealthRecord — Extract data from uploaded file via Gemini Vision
// ---------------------------------------------------------------------------

async function processHealthRecord(recordId, userId) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("No GEMINI_API_KEY");

  const [record] = await db.select().from(healthRecords).where(eq(healthRecords.id, recordId));
  if (!record) throw new Error(`Record ${recordId} not found`);

  const uploadsDir = path.join(__dirname, "../../uploads");
  const filePath = path.join(uploadsDir, record.storageKey);
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${record.storageKey}`);

  const fileData = fs.readFileSync(filePath);
  const base64Data = fileData.toString("base64");

  // For XML/CCD files, try direct text extraction first
  if (record.contentType.includes("xml")) {
    const xmlText = fileData.toString("utf-8");
    const extractedData = await extractFromText(xmlText, GEMINI_API_KEY);
    await db.update(healthRecords).set({
      extractedData,
      status: "processed",
    }).where(eq(healthRecords.id, recordId));

    // Trigger compaction after processing
    await compactMemory(userId);
    return extractedData;
  }

  // PDF and images — use Gemini Vision
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const mimeType = record.contentType === "application/pdf" ? "application/pdf" : record.contentType;

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [
        {
          inlineData: {
            mimeType,
            data: base64Data,
          },
        },
        {
          text: `Extract ALL medical data from this health record document. Return a JSON object with these fields (use null for missing data):

{
  "demographics": { "name": "", "dob": "", "gender": "", "age": null },
  "conditions": [{ "name": "", "status": "active|resolved", "diagnosed_date": "" }],
  "medications": [{ "name": "", "dosage": "", "frequency": "", "purpose": "" }],
  "allergies": [{ "substance": "", "reaction": "" }],
  "lab_results": [{ "test": "", "value": "", "unit": "", "reference_range": "", "date": "", "flag": "normal|high|low" }],
  "vitals": [{ "type": "", "value": "", "unit": "", "date": "" }],
  "procedures": [{ "name": "", "date": "", "findings": "" }],
  "imaging": [{ "type": "", "date": "", "findings": "" }],
  "immunizations": [{ "name": "", "date": "" }],
  "family_history": [{ "condition": "", "relation": "" }],
  "social_history": { "smoking": "", "alcohol": "", "exercise": "", "diet": "" },
  "notes": ""
}

Return ONLY valid JSON. Extract every piece of medical data you can find.`,
        },
      ],
    }],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
  });

  let extractedData;
  try {
    extractedData = JSON.parse(result.response.text());
  } catch {
    extractedData = { raw_text: result.response.text(), parse_error: true };
  }

  await db.update(healthRecords).set({
    extractedData,
    status: "processed",
  }).where(eq(healthRecords.id, recordId));

  // Trigger compaction after processing
  await compactMemory(userId);
  return extractedData;
}

// ---------------------------------------------------------------------------
// extractFromText — For XML/CCD documents, extract via Gemini text
// ---------------------------------------------------------------------------

async function extractFromText(xmlText, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  // Truncate to ~50K chars to avoid token limits
  const truncated = xmlText.length > 50000 ? xmlText.substring(0, 50000) : xmlText;

  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{
        text: `This is a CCD/CCDA XML health record. Extract ALL medical data and return as JSON with fields: demographics, conditions, medications, allergies, lab_results, vitals, procedures, imaging, immunizations, family_history, social_history, notes.\n\n${truncated}`,
      }],
    }],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
  });

  try {
    return JSON.parse(result.response.text());
  } catch {
    return { raw_text: result.response.text(), parse_error: true };
  }
}

// ---------------------------------------------------------------------------
// compactMemory — Gather all data sources → Gemini → 3-tier memory
// ---------------------------------------------------------------------------

async function compactMemory(userId, logPipelineEvent = null) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error("No GEMINI_API_KEY");

  const logEvent = logPipelineEvent || (async () => {});

  console.log(`[EHR_COMPACTION] Starting compaction for user ${userId}`);

  // Gather all data sources
  const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const records = await db.select().from(healthRecords)
    .where(eq(healthRecords.userId, userId))
    .orderBy(desc(healthRecords.createdAt));
  // Only include device/HealthKit data — exclude manually-logged vitals from the app
  const recentVitals = await db.select().from(vitals)
    .where(and(eq(vitals.patientId, userId), ne(vitals.source, "manual")))
    .orderBy(desc(vitals.recordedAt))
    .limit(100);
  const meds = await db.select().from(medications)
    .where(eq(medications.patientId, userId));
  const recentMedLogs = await db.select().from(medicationLogs)
    .where(eq(medicationLogs.patientId, userId))
    .orderBy(desc(medicationLogs.scheduledAt))
    .limit(50);
  const [prefs] = await db.select().from(userPreferences)
    .where(eq(userPreferences.userId, userId));

  // Decrypt profile PII
  if (profile) {
    profile.firstName = decrypt(profile.firstName);
    profile.lastName = decrypt(profile.lastName);
    if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
    if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
    if (profile.allergies) profile.allergies = decryptJson(profile.allergies);
  }

  // Combine extracted data from all health records
  const extractedRecords = records
    .filter(r => r.status === "processed" && r.extractedData)
    .map(r => r.extractedData);

  // Verbose: log data sources found
  await logEvent("ehr_data_scan", "completed", {
    detail: "Scanned patient data sources (HIE records + Apple HealthKit vitals only, manual entries excluded)",
    healthRecordsCount: records.length,
    processedRecordsCount: extractedRecords.length,
    vitalsCount: recentVitals.length,
    medicationsCount: meds.length,
    medicationLogsCount: recentMedLogs.length,
    hasProfile: !!profile,
    profileSummary: profile ? {
      name: `${profile.firstName} ${profile.lastName}`,
      glp1: profile.glp1Medication || "none",
      conditions: profile.conditions || [],
      sideEffects: profile.currentSideEffects || [],
    } : null,
  });

  // Build data bundle for Gemini
  const dataBundle = {
    profile: profile ? {
      name: `${profile.firstName} ${profile.lastName}`,
      dob: profile.dateOfBirth,
      gender: profile.gender,
      conditions: profile.conditions,
      sideEffects: profile.currentSideEffects,
      allergies: profile.allergies,
      goals: profile.goals,
      glp1: profile.glp1Medication ? `${profile.glp1Medication} ${profile.glp1Dosage}` : null,
      glp1StartDate: profile.glp1StartDate,
      injectionDay: profile.injectionDay,
      ageBracket: profile.ageBracket,
    } : null,
    healthRecords: extractedRecords,
    medications: meds.map(m => ({
      name: m.name, dosage: m.dosage, frequency: m.frequency,
      isGlp1: m.isGlp1, isActive: m.isActive,
    })),
    recentVitals: summarizeVitals(recentVitals),
    adherence: computeAdherence(recentMedLogs),
    preferences: prefs ? {
      checkinFrequency: prefs.checkinFrequency,
      preferredChannel: prefs.preferredChannel,
      voiceCallFrequency: prefs.voiceCallFrequency,
    } : null,
  };

  // Verbose: log adherence (only if there are actual med logs)
  const adherenceData = dataBundle.adherence;
  if (adherenceData.total > 0) {
    await logEvent("ehr_adherence", "completed", {
      detail: "Medication adherence computed from recent logs",
      adherenceRate: adherenceData.rate,
      totalLogs: adherenceData.total,
      takenCount: adherenceData.taken,
      missedCount: adherenceData.total - adherenceData.taken,
    });
  }

  // Verbose: log what we're sending to Gemini
  await logEvent("ehr_gemini_analysis", "running", {
    detail: "Sending patient data to Gemini for 3-tier memory compaction",
    dataSummary: {
      profileName: dataBundle.profile?.name || "unknown",
      glp1: dataBundle.profile?.glp1 || "none",
      conditions: dataBundle.profile?.conditions || [],
      healthRecordsSent: extractedRecords.length,
      medicationsSent: dataBundle.medications?.length || 0,
      vitalsTypes: Object.keys(dataBundle.recentVitals || {}),
    },
  });

  // Gemini compaction call
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

  const compactionStart = Date.now();
  const result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{
        text: `You are a clinical data compaction engine. Given this patient's health data from multiple sources, organize it into a 3-tier memory system.

PATIENT DATA:
${JSON.stringify(dataBundle, null, 2)}

Produce a JSON response with this exact structure:

{
  "tier1": {
    "label": "Constitutional — never expires",
    "demographics": { "name": "", "dob": "", "gender": "", "age_bracket": "" },
    "chronic_conditions": [{ "name": "", "status": "", "trust": "high|medium|low", "source": "record|self-report|inferred" }],
    "allergies": [{ "substance": "", "reaction": "" }],
    "family_history": [{ "condition": "", "relation": "" }],
    "insurance": null
  },
  "tier2": {
    "label": "Strategic — refresh quarterly",
    "active_medications": [{ "name": "", "dosage": "", "frequency": "", "purpose": "", "is_glp1": false }],
    "care_plan": "",
    "risk_factors": [""],
    "treatment_goals": [""],
    "specialists": []
  },
  "tier3": {
    "label": "Operational — 90-day window",
    "recent_labs": [{ "test": "", "value": "", "date": "", "trend": "stable|improving|declining" }],
    "recent_vitals": { "weight_trend": "", "bp_trend": "", "glucose_trend": "" },
    "recent_imaging": [],
    "active_symptoms": [],
    "adherence_rate": null
  },
  "top_3_insights": [
    "Insight about a connection in their data they might not know",
    "Second insight",
    "Third insight"
  ],
  "care_gaps": [
    { "type": "screening|medication|follow_up|lifestyle", "description": "", "urgency": "high|medium|low" }
  ],
  "hook_anchor": "The single most hookable detail for a coaching conversation — a specific contrast, surprise, or actionable finding from their data"
}

Rules:
- Tag trust levels on conditions: "high" = from medical records, "medium" = self-reported, "low" = inferred
- For insights, find NON-OBVIOUS connections (e.g., medication interactions, lifestyle impacts on conditions, timing patterns)
- For care_gaps, identify overdue screenings, unfilled prescriptions, missing follow-ups based on guidelines
- For hook_anchor, pick the detail that creates maximum curiosity without alarm (per Hook Opener Rubric: one anchor, curiosity/contrast, no fear)
- Keep total output under 2000 tokens`,
      }],
    }],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
  });

  const compactionDuration = Date.now() - compactionStart;

  // Capture Gemini thinking if available
  let geminiThinking = null;
  try {
    const parts = result.response.candidates?.[0]?.content?.parts || [];
    const thoughtParts = parts.filter(p => p.thought);
    if (thoughtParts.length > 0) {
      geminiThinking = thoughtParts.map(p => p.text).join("\n");
    }
  } catch { /* no thinking available */ }

  let compacted;
  try {
    compacted = JSON.parse(result.response.text());
  } catch {
    console.error("[EHR_COMPACTION] Failed to parse Gemini response");
    compacted = { error: "parse_failed", raw: result.response.text() };
  }

  // Verbose: log full compaction result
  await logEvent("ehr_gemini_analysis", "completed", {
    detail: "Gemini compaction complete — 3-tier memory built",
    durationMs: compactionDuration,
    geminiThinking,
    insights: compacted.top_3_insights || [],
    careGaps: compacted.care_gaps || [],
    hookAnchor: compacted.hook_anchor || null,
    tier1Summary: compacted.tier1 ? {
      conditions: compacted.tier1.chronic_conditions?.map(c => ({
        name: c.name, trust: c.trust, source: c.source,
      })),
      allergies: compacted.tier1.allergies?.length || 0,
      familyHistory: compacted.tier1.family_history?.length || 0,
    } : null,
    tier2Summary: compacted.tier2 ? {
      activeMedications: compacted.tier2.active_medications?.map(m => m.name),
      riskFactors: compacted.tier2.risk_factors,
      treatmentGoals: compacted.tier2.treatment_goals,
    } : null,
    tier3Summary: compacted.tier3 ? {
      recentLabs: compacted.tier3.recent_labs?.map(l => `${l.test}: ${l.value} (${l.trend})`),
      vitalTrends: compacted.tier3.recent_vitals,
      adherenceRate: compacted.tier3.adherence_rate,
      activeSymptoms: compacted.tier3.active_symptoms,
    } : null,
  });

  // Upsert into patient_memory — PRESERVE existing pipeline_log and first_call_prep
  const existing = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));

  if (existing.length > 0) {
    const existingTier2 = existing[0].tier2 || {};
    const mergedTier2 = {
      ...(compacted.tier2 || {}),
      pipeline_log: existingTier2.pipeline_log,
      first_call_prep: existingTier2.first_call_prep,
    };
    await db.update(patientMemory).set({
      tier1: compacted.tier1 || null,
      tier2: mergedTier2,
      tier3: compacted.tier3 || null,
      rawRecords: {
        top_3_insights: compacted.top_3_insights,
        care_gaps: compacted.care_gaps,
        hook_anchor: compacted.hook_anchor,
      },
      compactedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(patientMemory.userId, userId));
  } else {
    await db.insert(patientMemory).values({
      userId,
      tier1: compacted.tier1 || null,
      tier2: compacted.tier2 || null,
      tier3: compacted.tier3 || null,
      rawRecords: {
        top_3_insights: compacted.top_3_insights,
        care_gaps: compacted.care_gaps,
        hook_anchor: compacted.hook_anchor,
      },
      compactedAt: new Date(),
    });
  }

  console.log(`[EHR_COMPACTION] Compaction complete for user ${userId}`);
  return compacted;
}

// ---------------------------------------------------------------------------
// getCompactedContext — Returns prompt-ready string from compacted memory
// ---------------------------------------------------------------------------

async function getCompactedContext(userId) {
  const [mem] = await db.select().from(patientMemory).where(eq(patientMemory.userId, userId));
  if (!mem || !mem.tier1) return null;

  const parts = [];

  if (mem.tier1) {
    parts.push("CONSTITUTIONAL (permanent):");
    const t1 = mem.tier1;
    if (t1.demographics) parts.push(`  Patient: ${t1.demographics.name}, ${t1.demographics.gender}, ${t1.demographics.age_bracket}`);
    if (t1.chronic_conditions?.length) {
      parts.push(`  Conditions: ${t1.chronic_conditions.map(c => `${c.name} [${c.trust}]`).join(", ")}`);
    }
    if (t1.allergies?.length) {
      parts.push(`  Allergies: ${t1.allergies.map(a => a.substance).join(", ")}`);
    }
    if (t1.family_history?.length) {
      parts.push(`  Family: ${t1.family_history.map(f => `${f.relation}: ${f.condition}`).join(", ")}`);
    }
  }

  if (mem.tier2) {
    parts.push("\nSTRATEGIC (quarterly refresh):");
    const t2 = mem.tier2;
    if (t2.active_medications?.length) {
      parts.push(`  Meds: ${t2.active_medications.map(m => `${m.name} ${m.dosage} ${m.frequency}`).join("; ")}`);
    }
    if (t2.care_plan) parts.push(`  Care plan: ${t2.care_plan}`);
    if (t2.risk_factors?.length) parts.push(`  Risks: ${t2.risk_factors.join(", ")}`);
    if (t2.treatment_goals?.length) parts.push(`  Goals: ${t2.treatment_goals.join(", ")}`);
  }

  if (mem.tier3) {
    parts.push("\nOPERATIONAL (90-day):");
    const t3 = mem.tier3;
    if (t3.recent_labs?.length) {
      parts.push(`  Labs: ${t3.recent_labs.map(l => `${l.test}=${l.value} (${l.trend})`).join("; ")}`);
    }
    if (t3.recent_vitals) {
      const rv = t3.recent_vitals;
      parts.push(`  Vitals: weight ${rv.weight_trend || "??"}, BP ${rv.bp_trend || "??"}, glucose ${rv.glucose_trend || "??"}`);
    }
    if (t3.adherence_rate != null) parts.push(`  Adherence: ${t3.adherence_rate}%`);
    if (t3.active_symptoms?.length) parts.push(`  Symptoms: ${t3.active_symptoms.join(", ")}`);
  }

  if (mem.rawRecords?.care_gaps?.length) {
    parts.push("\nCARE GAPS:");
    for (const gap of mem.rawRecords.care_gaps) {
      parts.push(`  [${gap.urgency}] ${gap.description}`);
    }
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function summarizeVitals(vitalsArray) {
  if (!vitalsArray || vitalsArray.length === 0) return {};
  const grouped = {};
  for (const v of vitalsArray) {
    if (!grouped[v.vitalType]) grouped[v.vitalType] = [];
    grouped[v.vitalType].push({ value: v.value, unit: v.unit, date: v.recordedAt });
  }
  const summary = {};
  for (const [type, readings] of Object.entries(grouped)) {
    summary[type] = {
      latest: readings[0].value,
      unit: readings[0].unit,
      count: readings.length,
      values: readings.slice(0, 5).map(r => r.value),
    };
  }
  return summary;
}

function computeAdherence(medLogs) {
  if (!medLogs || medLogs.length === 0) return { rate: 100, total: 0, taken: 0 };
  const taken = medLogs.filter(l => l.status === "taken" || l.status === "late").length;
  return {
    rate: Math.round((taken / medLogs.length) * 100),
    total: medLogs.length,
    taken,
  };
}

module.exports = { processHealthRecord, compactMemory, getCompactedContext };
