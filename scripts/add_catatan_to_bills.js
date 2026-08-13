const db = require('../src/config/db');

async function migrate() {
    console.log("🚀 Running Migration: Adding 'catatan' column to public.bills table...");
    try {
        await db.query(`ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS catatan TEXT;`);
        console.log("✅ Successfully added 'catatan' column to public.bills table");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    }
}

migrate();
