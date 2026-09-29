const db = require('../src/config/db');

async function migrate() {
    console.log("🚀 Running Migration: Adding attendance tracking columns to teacher_checkins...");
    try {
        await db.query(`
            ALTER TABLE teacher_checkins ADD COLUMN IF NOT EXISTS attendance_type VARCHAR(50) DEFAULT 'checkin_harian';
            ALTER TABLE teacher_checkins ADD COLUMN IF NOT EXISTS proof_image TEXT;
            ALTER TABLE teacher_checkins ADD COLUMN IF NOT EXISTS topic_material TEXT;
            ALTER TABLE teacher_checkins ADD COLUMN IF NOT EXISTS notes TEXT;
            ALTER TABLE teacher_checkins ADD COLUMN IF NOT EXISTS check_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;
        `);
        console.log("✅ Successfully added attendance columns to teacher_checkins table");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    }
}

migrate();
