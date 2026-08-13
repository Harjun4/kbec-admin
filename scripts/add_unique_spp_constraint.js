const db = require('../src/config/db');

async function runMigration() {
    console.log('🚀 Running Database Migration: Unique Student SPP Period Constraint...');
    try {
        const alterSql = `
            ALTER TABLE public.bills 
            ADD CONSTRAINT unique_student_spp_period UNIQUE (student_id, bulan_tagihan, kategori);
        `;
        
        console.log('📦 Adding unique_student_spp_period constraint to bills table...');
        await db.query(alterSql);
        console.log('✅ Constraint unique_student_spp_period successfully applied!');
    } catch (error) {
        if (error.message && (error.message.includes('already exists') || error.message.includes('duplicate constraint'))) {
            console.log('ℹ️ Constraint unique_student_spp_period already exists. Skipping.');
        } else {
            console.error('⚠️ Migration notice/error:', error.message);
        }
    } finally {
        process.exit(0);
    }
}

runMigration();
