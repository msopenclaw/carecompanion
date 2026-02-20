require("dotenv").config();
const { neon } = require("@neondatabase/serverless");

const sql = neon(process.env.DATABASE_URL);

async function migrate() {
  // Add mood to vital_type enum
  console.log("[MIGRATE] Adding 'mood' to vital_type enum...");
  try {
    await sql`ALTER TYPE vital_type ADD VALUE IF NOT EXISTS 'mood'`;
    console.log("[MIGRATE] Done — mood added.");
  } catch (err) {
    if (err.message?.includes("already exists")) {
      console.log("[MIGRATE] 'mood' already exists in enum, skipping.");
    } else {
      console.error("[MIGRATE] Error:", err.message);
    }
  }
}

migrate();
