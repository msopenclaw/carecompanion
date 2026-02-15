const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { eq } = require("drizzle-orm");
const { db } = require("../db");
const { users, userProfiles } = require("../db/schema");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";

function generateTokens(user) {
  const accessToken = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
  const refreshToken = jwt.sign(
    { userId: user.id, type: "refresh" },
    JWT_REFRESH_SECRET,
    { expiresIn: "7d" },
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

    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
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

    // Check if user exists by email
    let [user] = await db.select().from(users).where(eq(users.email, userEmail.toLowerCase()));

    if (!user) {
      // Create new user (no password for Apple Sign In)
      const dummyHash = await bcrypt.hash(appleUserId, 12);
      [user] = await db.insert(users).values({
        email: userEmail.toLowerCase(),
        passwordHash: dummyHash,
        role: "patient",
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
    }

    const tokens = generateTokens(user);
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));

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

module.exports = router;
