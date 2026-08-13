const db = require('../src/config/db');

async function runMigration() {
    console.log('🚀 Starting Phase 1: Finance Database Migration...');
    try {
        // Create vouchers table
        const createVouchersSql = `
            CREATE TABLE IF NOT EXISTS public.vouchers (
                id VARCHAR(100) PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                discount_type VARCHAR(20) DEFAULT 'fixed',
                discount_value NUMERIC(12,2) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        `;
        
        console.log('📦 Creating vouchers table if it does not exist...');
        await db.query(createVouchersSql);
        console.log('✅ vouchers table ready.');

        // Alter payments table
        const alterPaymentsSql = `
            ALTER TABLE public.payments
            ADD COLUMN IF NOT EXISTS original_amount NUMERIC(12,2),
            ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0,
            ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(50),
            ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20),
            ADD COLUMN IF NOT EXISTS notes TEXT;
        `;
        
        console.log('📦 Altering payments table to add new columns...');
        await db.query(alterPaymentsSql);
        console.log('✅ payments table updated.');

        console.log('🎉 Migration completed successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        process.exit(0);
    }
}

runMigration();
