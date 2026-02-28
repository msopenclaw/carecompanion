const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { eq, desc } = require("drizzle-orm");
const { db } = require("../db");
const { healthRecords } = require("../db/schema");
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

    const [record] = await db.insert(healthRecords).values({
      userId,
      filename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      storageKey: file.filename, // just the filename in uploads/
      status: "pending",
    }).returning();

    // Process async — don't block the response
    processHealthRecord(record.id, userId).catch(err => {
      console.error(`[HEALTH_RECORDS] Async processing failed for ${record.id}:`, err);
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

module.exports = router;
