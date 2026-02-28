const express = require("express");
const { eq, and, gte } = require("drizzle-orm");
const { db } = require("../db");
const { pushTokens, userProfiles, medicationLogs, medications, vitals, scheduledActions } = require("../db/schema");

const router = express.Router();

// POST /api/push/register — register APNs device token
router.post("/register", async (req, res) => {
  try {
    const { deviceToken, platform, timezone } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ error: "deviceToken required" });
    }

    // Upsert: deactivate old tokens for this user/device combo, then insert
    const existing = await db.select().from(pushTokens)
      .where(and(
        eq(pushTokens.userId, req.user.userId),
        eq(pushTokens.deviceToken, deviceToken),
      ));

    if (existing.length > 0) {
      await db.update(pushTokens)
        .set({ isActive: true, updatedAt: new Date() })
        .where(and(
          eq(pushTokens.userId, req.user.userId),
          eq(pushTokens.deviceToken, deviceToken),
        ));
    } else {
      await db.insert(pushTokens).values({
        userId: req.user.userId,
        deviceToken,
        platform: platform || "ios",
      });
    }

    // Store user timezone if provided
    if (timezone) {
      await db.update(userProfiles)
        .set({ timezone, updatedAt: new Date() })
        .where(eq(userProfiles.userId, req.user.userId));
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Push register error:", err);
    res.status(500).json({ error: "Failed to register push token" });
  }
});

// GET /api/push/status — check APNs configuration and token status
router.get("/status", async (req, res) => {
  try {
    const tokens = await db.select().from(pushTokens)
      .where(and(
        eq(pushTokens.userId, req.user.userId),
        eq(pushTokens.isActive, true),
      ));

    const apnsConfigured = !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_AUTH_KEY);
    const environment = process.env.APNS_ENVIRONMENT || "sandbox";

    res.json({
      apnsConfigured,
      environment,
      activeTokens: tokens.length,
      tokens: tokens.map(t => ({
        id: t.id,
        tokenPrefix: t.deviceToken.substring(0, 12) + "...",
        platform: t.platform,
        createdAt: t.createdAt,
      })),
      envVars: {
        APNS_KEY_ID: process.env.APNS_KEY_ID ? "set" : "MISSING",
        APNS_TEAM_ID: process.env.APNS_TEAM_ID ? "set" : "MISSING",
        APNS_AUTH_KEY: process.env.APNS_AUTH_KEY ? "set" : "MISSING",
        APNS_BUNDLE_ID: process.env.APNS_BUNDLE_ID || "com.carecompanion.ios (default)",
        APNS_ENVIRONMENT: environment,
      },
    });
  } catch (err) {
    console.error("Push status error:", err);
    res.status(500).json({ error: "Failed to check push status" });
  }
});

// POST /api/push/test — send a test push notification to current user
router.post("/test", async (req, res) => {
  try {
    const { sendPush } = require("../services/pushService");
    const title = req.body.title || "Test Notification";
    const body = req.body.body || "Push notifications are working!";
    const result = await sendPush(req.user.userId, {
      title,
      body,
      data: { route: "messages" },
    });

    if (result?.error) {
      return res.json({ success: false, message: result.error, details: result });
    }
    if (result?.sent === 0 && result?.tokensFound === 0) {
      return res.json({ success: false, message: "No device tokens registered. Open the app on your iPhone first.", details: result });
    }
    res.json({ success: true, message: `Push sent to ${result?.sent || 0} device(s)`, details: result });
  } catch (err) {
    console.error("Push test error:", err);
    res.status(500).json({ error: "Push test failed", details: err.message });
  }
});

// POST /api/push/action — handle interactive notification actions from iOS
router.post("/action", async (req, res) => {
  try {
    const { actionIdentifier, category, medicationId } = req.body;
    const userId = req.user.userId;
    console.log(`[Push Action] ${category}/${actionIdentifier} from user ${userId}, medId=${medicationId || "none"}`);

    switch (category) {
      case "MEDICATION_REMINDER": {
        if (actionIdentifier === "MED_TAKEN") {
          // Find medication to confirm
          let medId = medicationId;
          if (!medId) {
            const meds = await db.select().from(medications)
              .where(and(eq(medications.patientId, userId), eq(medications.isActive, true)));
            medId = (meds.find(m => m.isGlp1) || meds[0])?.id;
          }
          if (medId) {
            await db.insert(medicationLogs).values({
              medicationId: medId,
              patientId: userId,
              scheduledAt: new Date(),
              takenAt: new Date(),
              status: "taken",
            });
            console.log(`[Push Action] Med confirmed: ${medId}`);
          }
        } else if (actionIdentifier === "MED_REMIND_LATER") {
          // Schedule push 60 min from now
          await scheduleDelayedPush(userId, "med_reminder", 60);
          console.log(`[Push Action] Med reminder rescheduled +60min`);
        }
        break;
      }

      case "HYDRATION_NUDGE": {
        const oz = actionIdentifier === "HYDRATION_16OZ" ? 16 : actionIdentifier === "HYDRATION_8OZ" ? 8 : 0;
        if (oz > 0) {
          await db.insert(vitals).values({
            patientId: userId,
            vitalType: "hydration",
            value: oz,
            unit: "oz",
            source: "notification_action",
            recordedAt: new Date(),
          });
          console.log(`[Push Action] Logged ${oz}oz hydration`);
        }
        break;
      }

      case "CALL_REQUEST": {
        if (actionIdentifier === "CALL_LATER") {
          await scheduleDelayedPush(userId, "daily_call", 60);
          console.log(`[Push Action] Call rescheduled +60min`);
        }
        // CALL_NOW handled on iOS (foreground), CALL_NOT_TODAY is a no-op
        break;
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[Push Action] Error:", err);
    res.json({ success: true }); // Always 200 so iOS doesn't retry
  }
});

// Helper: schedule a one-time push N minutes from now
async function scheduleDelayedPush(userId, actionType, delayMinutes) {
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
  const tz = profile?.timezone || "America/New_York";
  const target = new Date(Date.now() + delayMinutes * 60 * 1000);
  const targetStr = target.toLocaleString("en-US", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" });
  // Parse "HH:MM" from locale string (format: "HH:MM:SS" or "H:MM:SS")
  const parts = targetStr.match(/(\d{1,2}):(\d{2})/);
  const hhmm = parts ? `${parts[1].padStart(2, "0")}:${parts[2]}` : "10:00";

  await db.insert(scheduledActions).values({
    userId,
    actionType,
    label: actionType === "daily_call" ? "Rescheduled check-in call" : "Rescheduled medication reminder",
    scheduledTime: hhmm,
    recurrence: "once",
    createdVia: "notification_action",
  });
}

// POST /api/push/unregister — deactivate token
router.post("/unregister", async (req, res) => {
  try {
    const { deviceToken } = req.body;
    if (!deviceToken) {
      return res.status(400).json({ error: "deviceToken required" });
    }

    await db.update(pushTokens)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(
        eq(pushTokens.userId, req.user.userId),
        eq(pushTokens.deviceToken, deviceToken),
      ));

    res.json({ success: true });
  } catch (err) {
    console.error("Push unregister error:", err);
    res.status(500).json({ error: "Failed to unregister push token" });
  }
});

module.exports = router;
