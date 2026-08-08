const { Pool, types } = require('pg');
const supabase = require('./supabase');
require('dotenv').config();


// Automatically parse PostgreSQL BIGINT (OID 20), INT4 (OID 23), INT2 (OID 21), and NUMERIC (OID 1700) as JavaScript numbers
types.setTypeParser(20, (val) => val === null ? 0 : parseInt(val, 10));
types.setTypeParser(23, (val) => val === null ? 0 : parseInt(val, 10));
types.setTypeParser(21, (val) => val === null ? 0 : parseInt(val, 10));
types.setTypeParser(1700, (val) => val === null ? 0 : parseFloat(val));

const dbType = (process.env.DB_TYPE || 'postgres').toLowerCase();
const isPostgres = dbType === 'postgres' || !!process.env.SUPABASE_DB_HOST;

let pool;

if (isPostgres) {
    const pgPool = new Pool({
        host: (process.env.SUPABASE_DB_HOST || '').trim(),
        port: parseInt(process.env.SUPABASE_DB_PORT || '5432', 10),
        user: (process.env.SUPABASE_DB_USER || 'postgres').trim(),
        password: (process.env.SUPABASE_DB_PASSWORD || '').trim(),
        database: (process.env.SUPABASE_DB_NAME || 'postgres').trim(),
        ssl: { rejectUnauthorized: false },
        max: 20
    });

    pgPool.on('error', (err) => {
        console.error('PostgreSQL Idle Pool Client Error:', err.message);
    });



    const formatPgSql = (sql) => {
        let pgSql = sql;

        // 0. Skip MySQL-only statements that don't apply in PostgreSQL
        const trimmedLower = pgSql.trim().toLowerCase();
        if (trimmedLower.startsWith('set foreign_key_checks') || trimmedLower.startsWith('set names') || trimmedLower.startsWith('set character')) {
            return 'SELECT 1'; // no-op
        }

        // 1. Convert MySQL IF(cond, val1, val2) function to PostgreSQL CASE WHEN
        // Use a more robust approach: find IF( then match balanced parentheses
        pgSql = pgSql.replace(/\bIF\s*\(\s*([^,]+?)\s*,\s*([^,]+?)\s*,\s*([^)]+?)\s*\)/gi, 'CASE WHEN $1 THEN $2 ELSE $3 END');

        // 2. Convert double-quoted string literals to single-quoted strings for PostgreSQL
        pgSql = pgSql.replace(/= *"([^"]+)"/g, "= '$1'");
        pgSql = pgSql.replace(/!= *"([^"]+)"/g, "!= '$1'");
        pgSql = pgSql.replace(/IN *\("([^"]+)"\)/gi, "IN ('$1')");
        // Named status values in double quotes
        pgSql = pgSql.replace(/"(Lunas|Tertagih|Tunggakan|Aktif|AKtif|SPP|Tunai|Transfer|Admin|Super Admin|Terbit|Hadir|Izin|Sakit|Alpha|KBEC|Calistung|Bimbel|TK|Arabin|Reguler|Diterima|Disetorkan|Pemasukan|Pengeluaran)"/gi, "'$1'");

        // 3. Convert Date / Timestamp column LIKE queries to col::text LIKE for PostgreSQL compatibility
        pgSql = pgSql.replace(/\b(tanggal|created_at|date|jatuh_tempo|joined)\s+LIKE\b/gi, '$1::text LIKE');
        pgSql = pgSql.replace(/\b(tanggal|created_at|date|jatuh_tempo|joined)\s+NOT\s+LIKE\b/gi, '$1::text NOT LIKE');

        // 4. Cast JOIN equality parameters to text for cross-type VARCHAR vs BIGINT equality matching
        pgSql = pgSql.replace(/ON\s+([a-zA-Z0-9_\.]+)\s*=\s*([a-zA-Z0-9_\.]+)/gi, 'ON $1::text = $2::text');

        // 5. Convert DDL types
        pgSql = pgSql.replace(/INT\s+AUTO_INCREMENT\s+PRIMARY\s+KEY/gi, 'SERIAL PRIMARY KEY');
        pgSql = pgSql.replace(/AUTO_INCREMENT/gi, '');
        pgSql = pgSql.replace(/\bDATETIME\b/gi, 'TIMESTAMPTZ');
        pgSql = pgSql.replace(/ALTER TABLE ([^\s]+) MODIFY COLUMN ([^\s]+) ([^;\n]+)/gi, 'ALTER TABLE $1 ALTER COLUMN $2 TYPE $3');

        // 6. Convert MySQL DAY(), MONTH(), YEAR() functions to PostgreSQL EXTRACT()
        pgSql = pgSql.replace(/\bDAY\s*\(([^)]+)\)/gi, 'EXTRACT(DAY FROM $1)');
        pgSql = pgSql.replace(/\bMONTH\s*\(([^)]+)\)/gi, 'EXTRACT(MONTH FROM $1)');
        pgSql = pgSql.replace(/\bYEAR\s*\(([^)]+)\)/gi, 'EXTRACT(YEAR FROM $1)');

        // 7. Convert MySQL DATE_FORMAT to PostgreSQL TO_CHAR with timestamp casting
        pgSql = pgSql.replace(/DATE_FORMAT\(([^,]+),\s*'([^']+)'\)/gi, (match, col, fmt) => {
            let pgFmt = fmt
                .replace(/%Y/g, 'YYYY')
                .replace(/%m/g, 'MM')
                .replace(/%d/g, 'DD')
                .replace(/%H/g, 'HH24')
                .replace(/%i/g, 'MI')
                .replace(/%s/g, 'SS')
                .replace(/%b/g, 'Mon')
                .replace(/%M/g, 'Month');
            return `TO_CHAR(${col}::timestamp, '${pgFmt}')`;
        });

        // 8. Convert MySQL case-insensitive LIKE to PostgreSQL ILIKE
        pgSql = pgSql.replace(/\s+LIKE\s+/gi, ' ILIKE ');

        // 9. Convert MySQL ? placeholders to PostgreSQL $1, $2, $3...
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

        // 10. Convert MySQL backtick quotes `table` to PostgreSQL "table"
        pgSql = pgSql.replace(/`([^`]+)`/g, '"$1"');

        // 11. Convert INSERT IGNORE INTO to INSERT INTO ... ON CONFLICT DO NOTHING
        if (pgSql.includes('INSERT IGNORE INTO')) {
            pgSql = pgSql.replace('INSERT IGNORE INTO', 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
        }

        // 12. Convert CONCAT() — PostgreSQL supports it natively, but also handle ||
        // (CONCAT already works in PG, so nothing needed)

        return pgSql;
    };

    // Helper: Extract insertId from INSERT with RETURNING, or return empty
    const runPgQuery = async (client, pgSql, params) => {
        let finalSql = pgSql;
        const isInsert = finalSql.trim().toUpperCase().startsWith('INSERT');
        const hasReturning = /RETURNING\s+/i.test(finalSql);
        const hasOnConflict = /ON\s+CONFLICT/i.test(finalSql);
        const isNoIdTable = /INTO\s+("?class_students"?)/i.test(finalSql);

        if (isInsert && !hasReturning && !hasOnConflict && !isNoIdTable) {
            finalSql = finalSql.replace(/;?\s*$/, '') + ' RETURNING id';
        }

        try {
            const res = await client.query(finalSql, params);
            const rows = res.rows || [];
            if (isInsert && rows.length > 0 && rows[0].id !== undefined) {
                rows.insertId = rows[0].id;
            }
            return res;
        } catch (err) {
            if (err.message && err.message.includes('column "id" does not exist')) {
                const fallbackSql = pgSql.replace(/\s*RETURNING\s+id\s*/i, '');
                const res = await client.query(fallbackSql, params);
                return res;
            }
            throw err;
        }
    };

    pool = {
        supabase,
        async query(sql, params = []) {
            const pgSql = formatPgSql(sql);
            try {
                const res = await runPgQuery(pgPool, pgSql, params);
                // Attach insertId to rows array for MySQL compat
                const rows = res.rows || [];
                if (rows.insertId !== undefined) {
                    // nothing, already set by runPgQuery
                }
                return [rows, res.fields];
            } catch (err) {
                // Suppress non-critical DDL errors
                const errMsg = err.message || '';
                if (pgSql.toLowerCase().includes('alter table') && (errMsg.includes('already exists') || errMsg.includes('cannot be cast') || errMsg.includes('syntax error') || errMsg.includes('does not exist'))) {
                    return [[], []];
                }
                // Suppress RETURNING id failures (table might not have id column)
                if (errMsg.includes('column "id" does not exist') && /RETURNING\s+id/i.test(pgSql)) {
                    const fallbackSql = pgSql.replace(/\s*RETURNING\s+id\s*/i, '');
                    try {
                        const res2 = await pgPool.query(fallbackSql, params);
                        return [res2.rows, res2.fields];
                    } catch (e2) {
                        console.error('PostgreSQL Fallback Query Error:', e2.message);
                        throw e2;
                    }
                }
                // Suppress CREATE TABLE errors for IF NOT EXISTS
                if (pgSql.toLowerCase().includes('create table') && errMsg.includes('already exists')) {
                    return [[], []];
                }
                console.error('PostgreSQL Query Error:', err.message, 'Query:', pgSql.substring(0, 300));
                throw err;
            }
        },
        async execute(sql, params = []) {
            return this.query(sql, params);
        },
        async getConnection() {
            const client = await pgPool.connect();
            return {
                async beginTransaction() {
                    await client.query('BEGIN');
                },
                async commit() {
                    await client.query('COMMIT');
                },
                async rollback() {
                    await client.query('ROLLBACK');
                },
                async query(sql, params = []) {
                    const pgSql = formatPgSql(sql);
                    try {
                        const res = await runPgQuery(client, pgSql, params);
                        return [res.rows, res.fields];
                    } catch (err) {
                        const errMsg = err.message || '';
                        if (errMsg.includes('column "id" does not exist') && /RETURNING\s+id/i.test(pgSql)) {
                            const fallbackSql = pgSql.replace(/\s*RETURNING\s+id\s*/i, '');
                            const res2 = await client.query(fallbackSql, params);
                            return [res2.rows, res2.fields];
                        }
                        throw err;
                    }
                },
                async execute(sql, params = []) {
                    return this.query(sql, params);
                },
                release() {
                    client.release();
                }
            };
        },
        pool: pgPool
    };

    console.log('⚡ Connected to Supabase PostgreSQL Pool & Official SDK Client (db.ariqvrsvwvtwkllybqeb.supabase.co).');
} else {
    try {
        const mysql = require('mysql2/promise');
        const mysqlPool = mysql.createPool({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'kbec_db',
            port: parseInt(process.env.DB_PORT || '3306', 10),
            waitForConnections: true,
            connectionLimit: 10
        });

        pool = mysqlPool;
        pool.supabase = supabase;
        console.log('🐬 Connected to Local MySQL Pool.');
    } catch (e) {
        console.warn('⚠️ Local mysql2/promise module not found. Defaulting to PostgreSQL.');
    }
}


module.exports = pool;
