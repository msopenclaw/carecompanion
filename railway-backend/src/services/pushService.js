const http2 = require("http2");
const crypto = require("crypto");
const { eq, and } = require("drizzle-orm");
const { db } = require("../db");
const { pushTokens } = require("../db/schema");

// Try both environments — sandbox first, then production as fallback
const APNS_SANDBOX = "api.sandbox.push.apple.com";
const APNS_PRODUCTION = "api.push.apple.com";

// Primary environment from config
const primaryHost = process.env.APNS_ENVIRONMENT === "production"
  ? APNS_PRODUCTION
  : APNS_SANDBOX;

let cachedJwt = null;
let cachedJwtExpiry = 0;

function getApnsJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwtExpiry > now) return cachedJwt;

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const authKey = process.env.APNS_AUTH_KEY;

  if (!keyId || !teamId || !authKey) return null;

  const key = Buffer.from(authKey, "base64").toString("utf8");

  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: keyId })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: now })).toString("base64url");
  const signingInput = `${header}.${claims}`;

  // Use ieee-p1363 encoding to get raw r||s directly (avoids DER parsing bugs)
  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  const rawSig = sign.sign({ key, dsaEncoding: "ieee-p1363" });

  cachedJwt = `${signingInput}.${rawSig.toString("base64url")}`;
  cachedJwtExpiry = now + 3500; // refresh before 1h expiry
  return cachedJwt;
}

/**
 * Send push notification to a user's devices
 * @param {string} userId
 * @param {{ title: string, body: string, data?: object }} payload
 */
async function sendPush(userId, { title, body, data }) {
  console.log(`[Push] ── sendPush called ──`);
  console.log(`[Push] userId: ${userId}`);
  console.log(`[Push] title: "${title}", body: "${body}"`);

  const jwt = getApnsJwt();
  if (!jwt) {
    console.error("[Push] APNs NOT configured — missing APNS_KEY_ID/APNS_TEAM_ID/APNS_AUTH_KEY");
    console.log(`[Push] APNS_KEY_ID=${process.env.APNS_KEY_ID ? "set" : "MISSING"}, APNS_TEAM_ID=${process.env.APNS_TEAM_ID ? "set" : "MISSING"}, APNS_AUTH_KEY=${process.env.APNS_AUTH_KEY ? `set (${process.env.APNS_AUTH_KEY.length} chars)` : "MISSING"}`);
    return { sent: 0, error: "APNs not configured" };
  }
  console.log(`[Push] JWT generated OK, env=${process.env.APNS_ENVIRONMENT || "development"}, host=${primaryHost}`);

  const bundleId = process.env.APNS_BUNDLE_ID || "com.carecompanion.ios";

  const tokens = await db.select().from(pushTokens)
    .where(and(
      eq(pushTokens.userId, userId),
      eq(pushTokens.isActive, true),
    ));

  console.log(`[Push] Found ${tokens.length} active token(s) for user`);
  if (tokens.length === 0) {
    return { sent: 0, tokensFound: 0, error: "No active device tokens registered" };
  }

  for (const t of tokens) {
    console.log(`[Push] Token: ${t.deviceToken.substring(0, 12)}... (platform=${t.platform}, active=${t.isActive})`);
  }

  // Extract category into aps dict so iOS matches registered UNNotificationCategory
  const { category, ...customData } = data || {};
  const apnsPayload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
      ...(category ? { category } : {}),
    },
    ...customData,
  });

  let sentCount = 0;
  const errors = [];

  for (const tokenRow of tokens) {
    try {
      await sendToDevice(tokenRow.deviceToken, apnsPayload, bundleId, jwt, primaryHost);
      console.log(`[Push] Sent to ${tokenRow.deviceToken.substring(0, 8)}... via ${primaryHost}`);
      sentCount++;
    } catch (err) {
      // If BadEnvironmentKeyInToken, try the other environment
      if (err.reason === "BadDeviceToken" || err.reason === "BadEnvironmentKeyInToken") {
        const fallbackHost = primaryHost === APNS_SANDBOX ? APNS_PRODUCTION : APNS_SANDBOX;
        try {
          await sendToDevice(tokenRow.deviceToken, apnsPayload, bundleId, jwt, fallbackHost);
          console.log(`[Push] Sent to ${tokenRow.deviceToken.substring(0, 8)}... via ${fallbackHost} (fallback)`);
          sentCount++;
          continue;
        } catch (fallbackErr) {
          console.error(`[Push] Failed on both environments for ${tokenRow.deviceToken.substring(0, 8)}:`, err.message, "/", fallbackErr.message);
          errors.push({ token: tokenRow.deviceToken.substring(0, 8), error: `${err.message} / fallback: ${fallbackErr.message}`, statusCode: err.statusCode });
        }
      } else {
        console.error(`[Push] Failed for token ${tokenRow.deviceToken.substring(0, 8)}:`, err.message);
        errors.push({ token: tokenRow.deviceToken.substring(0, 8), error: err.message, statusCode: err.statusCode });
      }
      // Deactivate invalid tokens
      if (err.statusCode === 410 || err.reason === "Unregistered") {
        await db.update(pushTokens)
          .set({ isActive: false })
          .where(eq(pushTokens.id, tokenRow.id));
      }
    }
  }

  console.log(`[Push] ── Result: sent=${sentCount}/${tokens.length}, errors=${errors.length} ──`);
  if (errors.length > 0) {
    for (const e of errors) {
      console.error(`[Push] Error for ${e.token}: ${e.error} (status ${e.statusCode})`);
    }
  }
  return { sent: sentCount, tokensFound: tokens.length, errors: errors.length > 0 ? errors : undefined };
}

function sendToDevice(deviceToken, payload, bundleId, jwt, host) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);

    client.on("error", (err) => {
      client.close();
      reject(err);
    });

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      "authorization": `bearer ${jwt}`,
      "apns-topic": bundleId,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });

    let responseData = "";
    let statusCode;

    req.on("response", (headers) => {
      statusCode = headers[":status"];
    });

    req.on("data", (chunk) => {
      responseData += chunk;
    });

    req.on("end", () => {
      client.close();
      if (statusCode === 200) {
        resolve();
      } else {
        const parsed = responseData ? JSON.parse(responseData) : {};
        const err = new Error(parsed.reason || `APNs error ${statusCode}`);
        err.statusCode = statusCode;
        err.reason = parsed.reason;
        reject(err);
      }
    });

    req.write(payload);
    req.end();
  });
}

module.exports = { sendPush };
