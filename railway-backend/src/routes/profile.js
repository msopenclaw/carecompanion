const express = require("express");
const { eq, and } = require("drizzle-orm");
const { db } = require("../db");
const { userProfiles, userCoordinator, careCoordinators, medications } = require("../db/schema");

const router = express.Router();

// GET /api/profile
router.get("/", async (req, res) => {
  try {
    const [profile] = await db.select().from(userProfiles)
      .where(eq(userProfiles.userId, req.user.userId));

    if (!profile) {
      return res.status(404).json({ error: "Profile not found" });
    }

    // Get coordinator
    const [uc] = await db.select().from(userCoordinator)
      .where(eq(userCoordinator.userId, req.user.userId));

    let coordinator = null;
    if (uc) {
      const [coord] = await db.select().from(careCoordinators)
        .where(eq(careCoordinators.id, uc.coordinatorId));
      coordinator = coord;
    }

    res.json({ ...profile, coordinator });
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// PUT /api/profile
router.put("/", async (req, res) => {
  try {
    const {
      firstName, lastName, dateOfBirth, gender, phone, heightInches,
      startingWeight, conditions, activityLevel, glp1Medication,
      glp1Dosage, glp1StartDate, injectionDay, otherMedications,
      currentSideEffects, goals,
    } = req.body;

    const updates = {};
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (dateOfBirth !== undefined) {
      updates.dateOfBirth = dateOfBirth;
      // Recompute age bracket
      const dob = new Date(dateOfBirth);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      if (age >= 65) updates.ageBracket = "65+";
      else if (age >= 55) updates.ageBracket = "55-64";
      else if (age >= 40) updates.ageBracket = "40-54";
      else updates.ageBracket = "25-39";
    }
    if (gender !== undefined) updates.gender = gender;
    if (phone !== undefined) updates.phone = phone;
    if (heightInches !== undefined) updates.heightInches = heightInches;
    if (startingWeight !== undefined) updates.startingWeight = startingWeight;
    if (conditions !== undefined) updates.conditions = conditions;
    if (activityLevel !== undefined) updates.activityLevel = activityLevel;
    if (glp1Medication !== undefined) updates.glp1Medication = glp1Medication;
    if (glp1Dosage !== undefined) updates.glp1Dosage = glp1Dosage;
    if (glp1StartDate !== undefined) updates.glp1StartDate = glp1StartDate;
    if (injectionDay !== undefined) updates.injectionDay = injectionDay;
    if (otherMedications !== undefined) updates.otherMedications = otherMedications;
    if (currentSideEffects !== undefined) updates.currentSideEffects = currentSideEffects;
    if (goals !== undefined) updates.goals = goals;

    updates.updatedAt = new Date();

    const [updated] = await db.update(userProfiles)
      .set(updates)
      .where(eq(userProfiles.userId, req.user.userId))
      .returning();

    // Auto-create medication records from GLP-1 info
    if (glp1Medication) {
      const existingGlp1 = await db.select().from(medications)
        .where(and(eq(medications.patientId, req.user.userId), eq(medications.isGlp1, true)));

      if (existingGlp1.length === 0) {
        await db.insert(medications).values({
          patientId: req.user.userId,
          name: glp1Medication,
          dosage: glp1Dosage || "",
          frequency: "weekly",
          isGlp1: true,
          isActive: true,
          startDate: glp1StartDate || null,
        });
        console.log(`[Profile] Created GLP-1 medication: ${glp1Medication} for ${req.user.userId}`);
      } else {
        // Update existing GLP-1 med
        await db.update(medications)
          .set({ name: glp1Medication, dosage: glp1Dosage || "", updatedAt: new Date() })
          .where(and(eq(medications.patientId, req.user.userId), eq(medications.isGlp1, true)));
      }
    }

    res.json(updated);
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).json({ error: "Failed to update profile" });
  }
});

module.exports = router;
