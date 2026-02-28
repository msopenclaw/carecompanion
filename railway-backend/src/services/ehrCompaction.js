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
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

  const mimeType = record.contentType === "application/pdf" ? "application/pdf" : record.contentType;

  console.log(`[HEALTH_RECORDS] Sending ${(fileData.length / 1024).toFixed(0)}KB ${mimeType} to Gemini Vision...`);
  const startTime = Date.now();

  // Wrap Gemini call with a 5-minute timeout
  const timeoutMs = 5 * 60 * 1000;
  const geminiPromise = model.generateContent({
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

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Gemini Vision timed out after ${timeoutMs / 1000}s`)), timeoutMs)
  );

  const result = await Promise.race([geminiPromise, timeoutPromise]);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[HEALTH_RECORDS] Gemini Vision responded in ${elapsed}s`);

  // Capture response text ONCE — calling .text() multiple times may exhaust the stream
  const rawResponseText = result.response.text();
  console.log(`[HEALTH_RECORDS] Response length: ${rawResponseText?.length || 0} chars`);

  let extractedData;
  try {
    let cleanText = rawResponseText || "";
    // Strip markdown code fences if present (```json ... ```)
    cleanText = cleanText.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
    extractedData = JSON.parse(cleanText);
    const condCount = extractedData.conditions?.length || 0;
    const medCount = extractedData.medications?.length || 0;
    const labCount = extractedData.lab_results?.length || 0;
    console.log(`[HEALTH_RECORDS] Extracted: ${condCount} conditions, ${medCount} medications, ${labCount} labs, keys: ${Object.keys(extractedData).join(",")}`);
  } catch (parseErr) {
    console.error(`[HEALTH_RECORDS] JSON parse error: ${parseErr.message}`);
    console.error(`[HEALTH_RECORDS] First 500 chars: ${rawResponseText?.substring(0, 500)}`);
    console.error(`[HEALTH_RECORDS] Last 200 chars: ${rawResponseText?.substring(rawResponseText.length - 200)}`);
    // Try regex fallback on the SAME captured text
    const jsonMatch = rawResponseText?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        extractedData = JSON.parse(jsonMatch[0]);
        console.log(`[HEALTH_RECORDS] Extracted via regex fallback: ${Object.keys(extractedData).join(",")}`);
      } catch (e2) {
        console.error(`[HEALTH_RECORDS] Regex fallback also failed: ${e2.message}`);
        extractedData = { raw_text: rawResponseText?.substring(0, 5000), parse_error: true };
      }
    } else {
      extractedData = { raw_text: rawResponseText?.substring(0, 5000), parse_error: true };
    }
  }

  await db.update(healthRecords).set({
    extractedData,
    status: "processed",
  }).where(eq(healthRecords.id, recordId));

  console.log(`[HEALTH_RECORDS] Record ${recordId} marked as processed`);

  // Trigger compaction after processing
  await compactMemory(userId);
  return extractedData;
}

// ---------------------------------------------------------------------------
// extractFromText — For XML/CCD documents, extract via Gemini text
// ---------------------------------------------------------------------------

async function extractFromText(xmlText, apiKey) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-pro-preview" });

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

  // Wait for any pending health records to finish processing (up to 3 min)
  const maxWait = 180_000;
  const pollInterval = 5_000;
  let waited = 0;
  while (waited < maxWait) {
    const pendingRecords = await db.select({ id: healthRecords.id })
      .from(healthRecords)
      .where(and(eq(healthRecords.userId, userId), eq(healthRecords.status, "pending")));
    if (pendingRecords.length === 0) break;
    console.log(`[EHR_COMPACTION] Waiting for ${pendingRecords.length} pending health record(s) to finish processing...`);
    await new Promise(r => setTimeout(r, pollInterval));
    waited += pollInterval;
  }

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
    detail: "Scanned data sources: uploaded health records + Apple HealthKit device vitals only (no self-reported app data)",
    healthRecordsCount: records.length,
    processedRecordsCount: extractedRecords.length,
    appleHealthVitalsCount: recentVitals.length,
    patientName: profile ? `${profile.firstName} ${profile.lastName}` : "unknown",
  });

  // Build data bundle for Gemini — ONLY health records + Apple HealthKit data
  // Do NOT include self-reported profile data (GLP-1, conditions, goals, preferences)
  // or app-entered medications. The agent should only work from clinical documents
  // and device-sourced vitals.
  const dataBundle = {
    demographics: profile ? {
      name: `${profile.firstName} ${profile.lastName}`,
      dob: profile.dateOfBirth,
      gender: profile.gender,
      ageBracket: profile.ageBracket,
    } : null,
    healthRecords: extractedRecords,
    appleHealthVitals: summarizeVitals(recentVitals),
  };

  // Verbose: log what we're sending to Gemini
  await logEvent("ehr_gemini_analysis", "running", {
    detail: "Sending health records + Apple HealthKit data to Gemini (no self-reported app data)",
    dataSummary: {
      patientName: dataBundle.demographics?.name || "unknown",
      healthRecordsSent: extractedRecords.length,
      appleHealthVitalTypes: Object.keys(dataBundle.appleHealthVitals || {}),
    },
  });

  // Gemini compaction call — with heartbeat so UI shows progress
  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const compactionStart = Date.now();
  const heartbeat = setInterval(async () => {
    const elapsed = Math.round((Date.now() - compactionStart) / 1000);
    await logEvent("ehr_gemini_analysis", "running", {
      detail: `Gemini analyzing patient records... (${elapsed}s elapsed)`,
      elapsedSeconds: elapsed,
    });
  }, 8000);

  let result;
  try {
    result = await model.generateContent({
    contents: [{
      role: "user",
      parts: [{
        text: `You are a clinical data compaction engine. You are given ONLY two data sources:
1. Uploaded medical records (health records from HIE, doctor visits, lab reports, etc.)
2. Apple HealthKit device data (steps, heart rate, blood pressure, etc. from wearables)

IMPORTANT: Only reference information actually present in these data sources. Do NOT fabricate medications, conditions, or treatments that are not documented below. If the data is sparse, say so — do not fill gaps with assumptions.

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
- ONLY use data from the healthRecords and appleHealthVitals fields above. Do NOT reference medications, conditions, or goals that are not in these sources.
- Tag trust levels: "high" = from medical records, "low" = inferred from device data patterns
- For insights, find NON-OBVIOUS connections in the actual records (e.g., lab trends, vital patterns, medication interactions documented in records)
- For care_gaps, identify overdue screenings, unfilled prescriptions, missing follow-ups based on what the records show
- For hook_anchor, pick the detail that creates maximum curiosity without alarm (per Hook Opener Rubric: one anchor, curiosity/contrast, no fear)
- If healthRecords is empty and only device vitals are available, base insights entirely on the device data patterns
- Keep total output under 2000 tokens`,
      }],
    }],
    generationConfig: {
      maxOutputTokens: 65536,
      responseMimeType: "application/json",
    },
  });
  } finally {
    clearInterval(heartbeat);
  }

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
