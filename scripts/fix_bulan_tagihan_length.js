const db = require('../src/config/db');

async function migrate() {
    console.log("🚀 Running Migration: Altering bills.bulan_tagihan & kategori column length to VARCHAR(50)...");
    try {
        await db.query(`ALTER TABLE public.bills ALTER COLUMN bulan_tagihan TYPE VARCHAR(50);`);
        await db.query(`ALTER TABLE public.bills ALTER COLUMN kategori TYPE VARCHAR(50);`);
        console.log("✅ Successfully altered bills.bulan_tagihan and kategori column to VARCHAR(50)");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    }
}

migrate();
