const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { eq, and } = require("drizzle-orm");
const { db } = require("../db");
const { users, userProfiles, patients, mealLogs, dailyTips, medicationLogs, medications, vitals, messages, voiceSessions, scheduledActions, pushTokens, userPreferences, userCoordinator, consents } = require("../db/schema");
const { authMiddleware } = require("../middleware/auth");
const { decrypt, decryptJson } = require("../services/encryption");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";

function generateTokens(user) {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "365d" },
  );
  const refreshToken = jwt.sign(
    { userId: user.id, type: "refresh" },
    JWT_REFRESH_SECRET,
    { expiresIn: "365d" },
  );
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post("/register", async (req, res) => {
  try {
    const { email, password, firstName, lastName, dateOfBirth, gender, phone } = req.body;

    if (!email || !password || !firstName || !lastName || !dateOfBirth) {
      return res.status(400).json({ error: "Missing required fields: email, password, firstName, lastName, dateOfBirth" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    // Check existing
    const existing = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    if (existing.length > 0) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      passwordHash,
      role: "patient",
    }).returning();

    // Compute age bracket
    const dob = new Date(dateOfBirth);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    let ageBracket = "25-39";
    if (age >= 65) ageBracket = "65+";
    else if (age >= 55) ageBracket = "55-64";
    else if (age >= 40) ageBracket = "40-54";

    await db.insert(userProfiles).values({
      userId: newUser.id,
      firstName,
      lastName,
      dateOfBirth,
      gender: gender || null,
      phone: phone || null,
      ageBracket,
    });

    // Create patients row (needed for FK on vitals, medications, messages)
    try {
      await db.insert(patients).values({
        id: newUser.id,
        firstName,
        lastName,
        dateOfBirth,
        gender: gender || "prefer_not_to_say",
      });
    } catch (e) {
      console.log("[Auth] patients row may already exist:", e.message);
    }

    const tokens = generateTokens(newUser);

    res.status(201).json({
      user: { id: newUser.id, email: newUser.email, role: newUser.role },
      ...tokens,
    });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password required" });
    }

    // Allow short username aliases for console login
    const loginAliases = { ms: "manish.openclaw@gmail.com" };
    const lookupEmail = (loginAliases[email.toLowerCase()] || email).toLowerCase();

    const [user] = await db.select().from(users).where(eq(users.email, lookupEmail));
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const tokens = generateTokens(user);

    // Get profile if exists
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));

    // Decrypt PII fields so iOS can decode the response
    if (profile) {
      profile.firstName = decrypt(profile.firstName);
      profile.lastName = decrypt(profile.lastName);
      if (profile.phone) profile.phone = decrypt(profile.phone);
      if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
      if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: profile || null,
      },
      ...tokens,
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// POST /api/auth/apple
router.post("/apple", async (req, res) => {
  try {
    const { identityToken, fullName, email } = req.body;
    if (!identityToken) {
      return res.status(400).json({ error: "Identity token required" });
    }

    // Decode the Apple identity token (JWT) to get the subject (user ID)
    const decoded = jwt.decode(identityToken);
    if (!decoded || !decoded.sub) {
      return res.status(400).json({ error: "Invalid identity token" });
    }

    const appleUserId = decoded.sub;
    const userEmail = email || decoded.email || `${appleUserId}@privaterelay.appleid.com`;
    console.log(`[Auth] Apple Sign In: sub=${appleUserId}, email=${email || 'none'}, tokenEmail=${decoded.email || 'none'}, resolved=${userEmail}`);

    // 1. Check if user exists by Apple user ID (most reliable)
    let [user] = await db.select().from(users).where(eq(users.appleUserId, appleUserId));

    // Skip inactive accounts (deactivated duplicates)
    if (user && !user.isActive) {
      console.log(`[Auth] Found inactive account ${user.id} by appleUserId, skipping`);
      user = null;
    }

    // 2. Fallback: check by email (try all possible emails Apple might use)
    if (!user) {
      const emailsToTry = new Set([userEmail.toLowerCase()]);
      if (decoded.email) emailsToTry.add(decoded.email.toLowerCase());
      if (email) emailsToTry.add(email.toLowerCase());

      for (const tryEmail of emailsToTry) {
        const [found] = await db.select().from(users).where(and(eq(users.email, tryEmail), eq(users.isActive, true)));
        if (found) {
          user = found;
          await db.update(users).set({ appleUserId }).where(eq(users.id, user.id));
          console.log(`[Auth] Linked Apple ID to existing user ${user.id} via email ${tryEmail}`);
          break;
        }
      }
    }

    if (!user) {
      // Create new user (no password for Apple Sign In)
      const dummyHash = await bcrypt.hash(appleUserId, 12);
      [user] = await db.insert(users).values({
        email: userEmail.toLowerCase(),
        passwordHash: dummyHash,
        role: "patient",
        appleUserId,
      }).returning();

      // Create profile from Apple-provided name
      const nameParts = fullName ? fullName.split(" ") : [];
      const firstName = nameParts[0] || "User";
      const lastName = nameParts.slice(1).join(" ") || "";

      await db.insert(userProfiles).values({
        userId: user.id,
        firstName,
        lastName,
        ageBracket: "25-39",
      });

      // Create patients row (needed for FK on vitals, medications, messages)
      try {
        await db.insert(patients).values({
          id: user.id,
          firstName,
          lastName,
          dateOfBirth: "2000-01-01",
          gender: "prefer_not_to_say",
        });
      } catch (e) {
        console.log("[Auth] patients row may already exist:", e.message);
      }
    }

    console.log(`[Auth] Apple auth result: userId=${user.id}, email=${user.email}, appleUserId=${user.appleUserId || appleUserId}`);
    const tokens = generateTokens(user);
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));

    // Decrypt PII fields so iOS can decode the response
    if (profile) {
      profile.firstName = decrypt(profile.firstName);
      profile.lastName = decrypt(profile.lastName);
      if (profile.phone) profile.phone = decrypt(profile.phone);
      if (profile.conditions) profile.conditions = decryptJson(profile.conditions);
      if (profile.currentSideEffects) profile.currentSideEffects = decryptJson(profile.currentSideEffects);
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        profile: profile || null,
      },
      ...tokens,
    });
  } catch (err) {
    console.error("Apple auth error:", err);
    res.status(500).json({ error: "Apple sign in failed" });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ error: "Refresh token required" });
    }

    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    const [user] = await db.select().from(users).where(eq(users.id, decoded.userId));
    if (!user || !user.isActive) {
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    const tokens = generateTokens(user);
    res.json(tokens);
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired refresh token" });
  }
});

// DELETE /api/auth/account — cascade delete user and all data
router.delete("/account", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log(`[Auth] Deleting account for user ${userId}`);

    // Cascade delete in FK-safe order
    await db.delete(mealLogs).where(eq(mealLogs.userId, userId));
    await db.delete(dailyTips).where(eq(dailyTips.userId, userId));
    await db.delete(medicationLogs).where(eq(medicationLogs.patientId, userId));
    await db.delete(medications).where(eq(medications.patientId, userId));
    await db.delete(vitals).where(eq(vitals.patientId, userId));
    await db.delete(messages).where(eq(messages.userId, userId));
    await db.delete(voiceSessions).where(eq(voiceSessions.userId, userId));
    await db.delete(scheduledActions).where(eq(scheduledActions.userId, userId));
    await db.delete(pushTokens).where(eq(pushTokens.userId, userId));
    await db.delete(userPreferences).where(eq(userPreferences.userId, userId));
    await db.delete(userCoordinator).where(eq(userCoordinator.userId, userId));
    await db.delete(consents).where(eq(consents.userId, userId));
    await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    console.log(`[Auth] Account deleted for user ${userId}`);
    res.json({ success: true, message: "Account and all data deleted" });
  } catch (err) {
    console.error("[Auth] Account deletion failed:", err.message);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
