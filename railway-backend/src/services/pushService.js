const http2 = require("http2");
const crypto = require("crypto");
const { eq, and } = require("drizzle-orm");
const { db } = require("../db");
const { pushTokens } = require("../db/schema");

const APNS_HOST = process.env.NODE_ENV === "production"
  ? "api.push.apple.com"
  : "api.sandbox.push.apple.com";

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

  const sign = crypto.createSign("SHA256");
  sign.update(signingInput);
  const signature = sign.sign(key);

  // Convert DER signature to raw r||s (64 bytes)
  const r = signature.subarray(4, 4 + signature[3]);
  const sOffset = 4 + signature[3] + 2;
  const s = signature.subarray(sOffset, sOffset + signature[sOffset - 1]);
  const rawSig = Buffer.alloc(64);
  r.copy(rawSig, 32 - r.length);
  s.copy(rawSig, 64 - s.length);

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
  const jwt = getApnsJwt();
  if (!jwt) {
    console.log("[Push] APNs not configured (missing key/team/key_id)");
    return;
  }

  const bundleId = process.env.APNS_BUNDLE_ID || "com.carecompanion.ios";

  const tokens = await db.select().from(pushTokens)
    .where(and(
      eq(pushTokens.userId, userId),
      eq(pushTokens.isActive, true),
    ));

  if (tokens.length === 0) {
    console.log(`[Push] No active tokens for user ${userId}`);
    return;
  }

  const apnsPayload = JSON.stringify({
    aps: {
      alert: { title, body },
      sound: "default",
      badge: 1,
    },
    ...(data || {}),
  });

  for (const tokenRow of tokens) {
    try {
      await sendToDevice(tokenRow.deviceToken, apnsPayload, bundleId, jwt);
      console.log(`[Push] Sent to ${tokenRow.deviceToken.substring(0, 8)}...`);
    } catch (err) {
      console.error(`[Push] Failed for token ${tokenRow.deviceToken.substring(0, 8)}:`, err.message);
      // Deactivate invalid tokens
      if (err.statusCode === 410 || err.reason === "Unregistered") {
        await db.update(pushTokens)
          .set({ isActive: false })
          .where(eq(pushTokens.id, tokenRow.id));
      }
    }
  }
}

function sendToDevice(deviceToken, payload, bundleId, jwt) {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${APNS_HOST}`);

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
