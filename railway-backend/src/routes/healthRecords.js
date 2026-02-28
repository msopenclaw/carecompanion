const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { eq, desc } = require("drizzle-orm");
const { db } = require("../db");
const { healthRecords, patientMemory } = require("../db/schema");
const { processHealthRecord } = require("../services/ehrCompaction");
const { runOnboardingPipeline } = require("../services/onboardingPipeline");

// ---------------------------------------------------------------------------
// Multer config — store files in uploads/ with unique names
// ---------------------------------------------------------------------------

const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = crypto.randomUUID() + ext;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      "application/pdf",
      "image/jpeg", "image/png", "image/heic",
      "application/xml", "text/xml",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ---------------------------------------------------------------------------
// POST /api/health-records/upload — Upload a health record file
// ---------------------------------------------------------------------------

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const userId = req.user.userId;
    const file = req.file;
    if (!file) return res.status(400).json({ error: "No file uploaded" });

    console.log(`[HEALTH_RECORDS] Upload received: ${file.originalname} (${(file.size / 1024).toFixed(0)}KB, ${file.mimetype}) for user ${userId}`);
    console.log(`[HEALTH_RECORDS] File saved to: ${file.filename}`);

    const [record] = await db.insert(healthRecords).values({
      userId,
      filename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      storageKey: file.filename, // just the filename in uploads/
      status: "pending",
    }).returning();

    console.log(`[HEALTH_RECORDS] DB record created: ${record.id}, starting Gemini extraction...`);

    // Process async — don't block the response
    processHealthRecord(record.id, userId)
      .then(() => {
        console.log(`[HEALTH_RECORDS] Processing complete for ${record.id} (${file.originalname})`);
      })
      .catch(err => {
        console.error(`[HEALTH_RECORDS] Async processing FAILED for ${record.id}:`, err.message);
        console.error(`[HEALTH_RECORDS] Stack:`, err.stack?.split("\n").slice(0, 3).join(" | "));
      });

    res.json({
      id: record.id,
      filename: record.filename,
      status: "processing",
    });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Upload error:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/health-records — List uploaded records for user
// ---------------------------------------------------------------------------

router.get("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const records = await db.select({
      id: healthRecords.id,
      filename: healthRecords.filename,
      contentType: healthRecords.contentType,
      sizeBytes: healthRecords.sizeBytes,
      status: healthRecords.status,
      createdAt: healthRecords.createdAt,
    }).from(healthRecords)
      .where(eq(healthRecords.userId, userId))
      .orderBy(desc(healthRecords.createdAt));

    res.json(records);
  } catch (err) {
    console.error("[HEALTH_RECORDS] List error:", err);
    res.status(500).json({ error: "Failed to list records" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/health-records/:id — Delete a specific health record
// ---------------------------------------------------------------------------

router.delete("/:id", async (req, res) => {
  try {
    const userId = req.user.userId;
    const recordId = req.params.id;
    const [record] = await db.select().from(healthRecords).where(eq(healthRecords.id, recordId));
    if (!record) return res.status(404).json({ error: "Record not found" });
    if (record.userId !== userId) return res.status(403).json({ error: "Not your record" });

    // Delete file from disk if it exists
    const uploadsDir = path.join(__dirname, "../../uploads");
    const filePath = path.join(uploadsDir, record.storageKey);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.delete(healthRecords).where(eq(healthRecords.id, recordId));
    console.log(`[HEALTH_RECORDS] Deleted record ${recordId} (${record.filename}) for user ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/health-records — Delete ALL health records for user
// ---------------------------------------------------------------------------

router.delete("/", async (req, res) => {
  try {
    const userId = req.user.userId;
    const records = await db.select().from(healthRecords).where(eq(healthRecords.userId, userId));

    // Delete files from disk
    const uploadsDir = path.join(__dirname, "../../uploads");
    for (const record of records) {
      const filePath = path.join(uploadsDir, record.storageKey);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }

    const { sql } = require("drizzle-orm");
    await db.delete(healthRecords).where(eq(healthRecords.userId, userId));
    // Also clear patient memory so pipeline can run fresh
    await db.delete(patientMemory).where(eq(patientMemory.userId, userId));
    console.log(`[HEALTH_RECORDS] Deleted all ${records.length} records + patient memory for user ${userId}`);
    res.json({ success: true, deleted: records.length });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Delete all error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/health-records/insight-cards — Return pipeline insight cards
// ---------------------------------------------------------------------------

router.get("/insight-cards", async (req, res) => {
  try {
    const userId = req.user.userId;
    const [mem] = await db.select().from(patientMemory)
      .where(eq(patientMemory.userId, userId));
    if (!mem?.rawRecords) return res.json({ cards: [] });

    const cards = [];
    const raw = mem.rawRecords;

    // Hook anchor -> featured card
    if (raw.hook_anchor) {
      cards.push({ id: "hook", type: "hook", icon: "sparkles",
        title: "Your Health Snapshot", text: raw.hook_anchor,
        color: "brand", priority: 0 });
    }

    // Top 3 insights -> insight cards
    (raw.top_3_insights || []).forEach((text, i) => {
      cards.push({ id: `insight_${i}`, type: "insight", icon: "lightbulb.fill",
        title: "Health Insight", text, color: "brandViolet", priority: 1 });
    });

    // Care gaps -> action cards
    (raw.care_gaps || []).forEach((gap, i) => {
      cards.push({ id: `care_gap_${i}`, type: "care_gap",
        icon: gap.urgency === "high" ? "exclamationmark.circle.fill" : "arrow.right.circle.fill",
        title: gap.type === "screening" ? "Screening Due" : "Follow-up Needed",
        text: gap.description, color: gap.urgency === "high" ? "dangerRed" : "brandAmber",
        priority: gap.urgency === "high" ? 0 : 2 });
    });

    cards.sort((a, b) => a.priority - b.priority);

    // Stage-manage: max 3 cards per day, rotate lower-priority ones daily
    const today = new Date().toISOString().split("T")[0];
    const dayHash = today.split("-").reduce((sum, part) => sum + parseInt(part), 0);
    const highPriority = cards.filter(c => c.priority === 0);
    const rest = cards.filter(c => c.priority > 0);
    const rotatedRest = rest.length > 0
      ? [...rest.slice(dayHash % rest.length), ...rest.slice(0, dayHash % rest.length)]
      : [];
    const dailyCards = [...highPriority, ...rotatedRest].slice(0, 3);

    res.json({ cards: dailyCards, totalAvailable: cards.length });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Insight cards error:", err);
    res.status(500).json({ error: "Failed to fetch insight cards" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/health-records/run-pipeline — Trigger the full onboarding pipeline
// ---------------------------------------------------------------------------

router.post("/run-pipeline", async (req, res) => {
  try {
    const userId = req.user.userId;
    // Run async — respond immediately
    runOnboardingPipeline(userId).catch(err => {
      console.error(`[HEALTH_RECORDS] Pipeline failed for ${userId}:`, err);
    });
    res.json({ status: "pipeline_started" });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Pipeline trigger error:", err);
    res.status(500).json({ error: "Pipeline trigger failed" });
  }
});

// ---------------------------------------------------------------------------
// GET /api/health-records/pipeline-status — Check pipeline status for the user
// ---------------------------------------------------------------------------

router.get("/pipeline-status", async (req, res) => {
  try {
    const userId = req.user.userId;
    const [mem] = await db.select().from(patientMemory)
      .where(eq(patientMemory.userId, userId));

    if (!mem || !mem.tier2) {
      return res.json({ status: "none", events: [] });
    }

    const runs = mem.tier2.pipeline_runs || [];
    if (runs.length === 0) {
      return res.json({ status: "none", events: [] });
    }

    const latest = runs[runs.length - 1];
    const events = latest.events || [];
    const isComplete = events.some(e => e.step === "pipeline_complete");
    const hasError = events.some(e => e.status === "error" && !events.some(e2 => e2.step === "pipeline_complete"));

    // Latest active step label
    const lastEvent = events[events.length - 1];
    const statusLabel = isComplete ? "complete" : (hasError ? "error" : "running");

    res.json({
      status: statusLabel,
      currentStep: lastEvent?.step || null,
      currentDetail: lastEvent?.detail || null,
      eventCount: events.length,
      startedAt: latest.startedAt || null,
    });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Pipeline status error:", err);
    res.status(500).json({ error: "Failed to get pipeline status" });
  }
});

// ---------------------------------------------------------------------------
// POST /api/health-records/:id/reprocess — Retry processing a failed record
// ---------------------------------------------------------------------------

router.post("/:id/reprocess", async (req, res) => {
  try {
    const userId = req.user.userId;
    const recordId = req.params.id;
    const [record] = await db.select().from(healthRecords)
      .where(eq(healthRecords.id, recordId));

    if (!record) return res.status(404).json({ error: "Record not found" });
    if (record.userId !== userId) return res.status(403).json({ error: "Not your record" });

    console.log(`[HEALTH_RECORDS] Reprocess requested for ${recordId} (${record.filename}), status: ${record.status}`);

    // Check if file still exists on disk
    const uploadsDir = path.join(__dirname, "../../uploads");
    const filePath = path.join(uploadsDir, record.storageKey);
    const fileExists = fs.existsSync(filePath);
    console.log(`[HEALTH_RECORDS] File on disk: ${fileExists ? "YES" : "NO"} (${filePath})`);

    if (!fileExists) {
      return res.status(410).json({ error: "File no longer on disk — please re-upload" });
    }

    // Reset status and reprocess
    await db.update(healthRecords).set({ status: "pending", extractedData: null })
      .where(eq(healthRecords.id, recordId));

    processHealthRecord(recordId, userId)
      .then(() => console.log(`[HEALTH_RECORDS] Reprocess complete for ${recordId}`))
      .catch(err => console.error(`[HEALTH_RECORDS] Reprocess FAILED for ${recordId}:`, err.message));

    res.json({ status: "reprocessing" });
  } catch (err) {
    console.error("[HEALTH_RECORDS] Reprocess error:", err);
    res.status(500).json({ error: "Reprocess failed" });
  }
});

module.exports = router;
