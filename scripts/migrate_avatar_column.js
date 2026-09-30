const db = require('../src/config/db');

async function migrate() {
    try {
        console.log('Migrating avatar and phone columns on Supabase...');
        await db.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar TEXT;`);
        await db.query(`ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone VARCHAR(255);`);
        await db.query(`ALTER TABLE public.teachers ADD COLUMN IF NOT EXISTS avatar TEXT;`);
        console.log('Migration completed successfully!');

        // Verify columns
        const [pubUserCols] = await db.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users'");
        const colNames = pubUserCols.map(c => c.column_name);
        console.log('Public users columns now:', colNames);
        console.log('Has avatar:', colNames.includes('avatar'));
        console.log('Has phone:', colNames.includes('phone'));

        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
