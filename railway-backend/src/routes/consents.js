const express = require("express");
const { db } = require("../db");
const { consents } = require("../db/schema");

const router = express.Router();

// POST /api/consents — log consent acceptance
router.post("/", async (req, res) => {
  try {
    const { consentType, consentVersion, accepted } = req.body;
    if (!consentType || accepted === undefined) {
      return res.status(400).json({ error: "consentType and accepted required" });
    }

    const [consent] = await db.insert(consents).values({
      userId: req.user?.userId || null,
      consentType,
      consentVersion: consentVersion || "1.0",
      accepted,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    }).returning();

    res.status(201).json(consent);
  } catch (err) {
    console.error("Consent log error:", err);
    res.status(500).json({ error: "Failed to log consent" });
  }
});

module.exports = router;
