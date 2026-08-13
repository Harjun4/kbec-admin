const db = require('../src/config/db');

async function migrate() {
    console.log("🚀 Running Migration: Creating vouchers table and adding voucher columns to bills and payments...");
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS public.vouchers (
                id VARCHAR(50) PRIMARY KEY,
                code VARCHAR(50) UNIQUE NOT NULL,
                description TEXT,
                discount_type VARCHAR(20) NOT NULL DEFAULT 'nominal',
                discount_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
                max_usage INT DEFAULT 100,
                usage_count INT DEFAULT 0,
                valid_until DATE,
                status VARCHAR(20) DEFAULT 'Aktif',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS description TEXT;`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS discount_type VARCHAR(20) DEFAULT 'nominal';`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS discount_value NUMERIC(12, 2) DEFAULT 0;`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS max_usage INT DEFAULT 100;`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS usage_count INT DEFAULT 0;`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS valid_until DATE;`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'Aktif';`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);
        await db.query(`ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`);

        await db.query(`ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS voucher_id VARCHAR(50);`);
        await db.query(`ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;`);
        await db.query(`ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS voucher_id VARCHAR(50);`);
        await db.query(`ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12, 2) DEFAULT 0;`);
        
        console.log("✅ Successfully created vouchers table and altered bills/payments/vouchers tables!");
        process.exit(0);
    } catch (err) {
        console.error("❌ Migration failed:", err.message);
        process.exit(1);
    }
}

migrate();
