const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const KEY_HEX = process.env.ENCRYPTION_KEY; // 64 hex chars = 32 bytes

function getKey() {
  if (!KEY_HEX) return null;
  return Buffer.from(KEY_HEX, "hex");
}

function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  if (!key) return plaintext; // passthrough if no key (dev mode)

  const str = typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(str, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${tag}:${encrypted}`;
}

function decrypt(encrypted) {
  if (!encrypted) return encrypted;
  const key = getKey();
  if (!key) return encrypted;

  // Check if it's actually encrypted (iv:tag:ciphertext format)
  const parts = typeof encrypted === "string" ? encrypted.split(":") : null;
  if (!parts || parts.length !== 3 || parts[0].length !== 24) return encrypted; // not encrypted, return as-is

  try {
    const [ivHex, tagHex, ciphertextHex] = parts;
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("[Encryption] Decrypt failed:", err.message);
    return encrypted; // return raw on failure
  }
}

// For JSONB fields — encrypt the JSON string, decrypt back to parsed object
function encryptJson(obj) {
  if (!obj) return obj;
  return encrypt(JSON.stringify(obj));
}

function decryptJson(encrypted) {
  if (!encrypted) return encrypted;
  const str = decrypt(encrypted);
  try { return JSON.parse(str); } catch { return str; }
}

module.exports = { encrypt, decrypt, encryptJson, decryptJson };
