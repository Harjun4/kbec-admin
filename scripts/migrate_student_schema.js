/**
 * MIGRASI: Penyelarasan database Siswa ⇄ Program ⇄ Kelas (KBEC Admin)
 *
 * Aman dijalankan berulang (idempotent) dan SELURUHNYA berjalan dalam satu transaksi.
 *
 *   node scripts/migrate_student_schema.js            -> DRY-RUN: jalankan semua langkah lalu ROLLBACK
 *                                                        (hanya menampilkan laporan, tidak mengubah DB)
 *   node scripts/migrate_student_schema.js --apply    -> backup JSON lalu COMMIT
 *
 * Perubahan:
 *  1. students : + agama, nama_ibu, nama_ayah, tempat_tanggal_lahir, program_id (FK -> programs.id)
 *  2. classes  : + program_id (FK -> programs.id)
 *  3. Backfill : unit (Unit Yayasan) & program (tingkatan) dipisahkan; level = alias program;
 *                status dinormalisasi (Aktif / Nonaktif / Alumni)
 *  4. Constraint: CHECK unit/status, FK student_grades -> students (bila tidak ada data yatim)
 *  5. Index    : unit, status, program_id, LOWER(nama), class_students(student_id)
 */
const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');
const {
    UNITS,
    normalizeUnit,
    normalizeStudentStatus,
    resolveStudentUnit,
    matchProgramMaster
} = require('../src/utils/helpers');

const APPLY = process.argv.includes('--apply');

const log = (...a) => console.log(...a);
const sqlList = (arr) => arr.map(v => `'${v}'`).join(', ');

async function constraintExists(client, table, name) {
    const r = await client.query(
        `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
        [name, table]
    );
    return r.rowCount > 0;
}

async function addConstraintOnce(client, table, name, ddl, report) {
    if (await constraintExists(client, table, name)) {
        report.push(`= ${table}.${name} sudah ada`);
        return;
    }
    await client.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} ${ddl}`);
    report.push(`+ ${table}.${name} dibuat`);
}

async function main() {
    const pool = db.pool;
    if (!pool) throw new Error('Migrasi ini hanya untuk PostgreSQL/Supabase (db.pool tidak tersedia).');

    const client = await pool.connect();
    const report = [];
    const changes = { students: [], classes: [] };

    try {
        // ---------- Backup (hanya saat --apply) ----------
        if (APPLY) {
            const snap = {};
            for (const t of ['students', 'classes', 'class_students']) {
                snap[t] = (await client.query(`SELECT * FROM ${t}`)).rows;
            }
            const dir = path.join(__dirname, '..', 'scratch');
            fs.mkdirSync(dir, { recursive: true });
            const file = path.join(dir, `backup_before_student_migration_${Date.now()}.json`);
            fs.writeFileSync(file, JSON.stringify(snap, null, 2));
            log(`💾 Backup tersimpan: ${file}`);
        }

        await client.query('BEGIN');
        log('… transaksi dimulai');

        // ---------- 1 & 2. Kolom baru ----------
        await client.query(`
            ALTER TABLE students
                ADD COLUMN IF NOT EXISTS agama VARCHAR(50),
                ADD COLUMN IF NOT EXISTS nama_ibu VARCHAR(150),
                ADD COLUMN IF NOT EXISTS nama_ayah VARCHAR(150),
                ADD COLUMN IF NOT EXISTS tempat_tanggal_lahir VARCHAR(150),
                ADD COLUMN IF NOT EXISTS program_id INTEGER
        `);
        await client.query(`ALTER TABLE classes ADD COLUMN IF NOT EXISTS program_id INTEGER`);
        report.push('✔ Kolom baru students & classes dipastikan ada');
        log('… kolom baru OK');

        // Pastikan program master Bimbel (SD-SMP) ada di master programs
        await client.query(`
            INSERT INTO programs (nama, cat, level, deskripsi, biaya, durasi, sesi)
            VALUES ('Bimbel (SD-SMP)', 'Bimbel', 'SD-SMP', 'Bimbingan Belajar Tingkat SD & SMP', 1000000, '1 Bulan', '8 Sesi')
            ON CONFLICT (nama) DO UPDATE SET cat = 'Bimbel', level = 'SD-SMP'
        `);

        // Normalisasi program master dengan cat 'basic' yang usang
        await client.query(`UPDATE programs SET cat = 'KBEC' WHERE cat = 'basic' AND nama = 'KBEC'`);
        await client.query(`UPDATE programs SET cat = 'Calistung' WHERE cat = 'basic' AND nama = 'Calistung'`);

        // ---------- 3a. Backfill siswa ----------
        const programs = (await client.query('SELECT id, nama, cat, level FROM programs')).rows;
        const students = (await client.query('SELECT * FROM students ORDER BY id')).rows;

        for (const s of students) {
            const legacyUnitFromProgram = normalizeUnit(s.program);
            // Bila s.program adalah nama Unit (mis. "KBEC", "Calistung", "TK", "Bimbel", "Arabin")
            // dan s.level berisi nama Program (mis. "Beginner 1", "Calistung 1A", "KB", "TOEFL Preperation"),
            // ambil s.level sebagai nama program kursus sesungguhnya!
            const levelIsJustUnit = s.level && ['kbec', 'tk', 'bimbel', 'calistung', 'arabin'].includes(String(s.level).toLowerCase().trim());
            const programText = (legacyUnitFromProgram && s.level && !levelIsJustUnit)
                ? s.level
                : (s.program || s.level);

            const hintUnit = normalizeUnit(s.unit) || legacyUnitFromProgram || resolveStudentUnit(s.id, programText || '', s.level || '');
            const match = programText
                ? (matchProgramMaster(programs, hintUnit, programText) || matchProgramMaster(programs, null, programText))
                : null;

            const programName = match ? match.nama : (programText ? String(programText).trim() : null);
            const unit = (match ? normalizeUnit(match.cat) : null)
                || hintUnit
                || resolveStudentUnit(s.id, programText || '', s.level || '');
            const status = normalizeStudentStatus(s.status, 'Aktif') || 'Aktif';
            const programId = match ? match.id : null;

            const next = { unit, program: programName, level: programName, status, program_id: programId };
            const diff = Object.keys(next).filter(k => (s[k] ?? null) !== (next[k] ?? null));
            if (diff.length) {
                await client.query(
                    'UPDATE students SET unit = $1, program = $2, level = $3, status = $4, program_id = $5 WHERE id = $6',
                    [next.unit, next.program, next.level, next.status, next.program_id, s.id]
                );
                changes.students.push(`${s.id} | ${s.nama} | ${diff.map(k => `${k}: ${s[k] ?? '∅'} → ${next[k] ?? '∅'}`).join('; ')}`);
            }
        }
        report.push(`✔ Backfill siswa: ${changes.students.length} dari ${students.length} baris diperbarui`);

        // ---------- 3b. Backfill kelas ----------
        const classes = (await client.query('SELECT id, nama, program, unit, program_id FROM classes ORDER BY id')).rows;
        for (const c of classes) {
            const hint = normalizeUnit(c.unit);
            const match = c.program
                ? (matchProgramMaster(programs, hint, c.program) || matchProgramMaster(programs, null, c.program))
                : null;
            const unit = hint
                || (match ? normalizeUnit(match.cat) : null)
                || normalizeUnit(c.program)
                || resolveStudentUnit('', c.program || '', '');
            const programId = match ? match.id : null;

            if ((c.unit ?? null) !== unit || (c.program_id ?? null) !== programId) {
                await client.query('UPDATE classes SET unit = $1, program_id = $2 WHERE id = $3', [unit, programId, c.id]);
                changes.classes.push(`${c.id} | ${c.nama} | unit: ${c.unit ?? '∅'} → ${unit}; program_id: ${c.program_id ?? '∅'} → ${programId ?? '∅'}`);
            }
        }
        report.push(`✔ Backfill kelas: ${changes.classes.length} dari ${classes.length} baris diperbarui`);

        // ---------- 4. Constraint ----------
        await addConstraintOnce(client, 'students', 'fk_students_program',
            'FOREIGN KEY (program_id) REFERENCES programs(id) ON UPDATE CASCADE ON DELETE SET NULL', report);
        await addConstraintOnce(client, 'classes', 'fk_classes_program',
            'FOREIGN KEY (program_id) REFERENCES programs(id) ON UPDATE CASCADE ON DELETE SET NULL', report);
        await addConstraintOnce(client, 'students', 'chk_students_unit',
            `CHECK (unit IS NULL OR unit IN (${sqlList(UNITS)}))`, report);
        await addConstraintOnce(client, 'students', 'chk_students_status',
            `CHECK (status IS NULL OR status IN ('Aktif', 'Nonaktif', 'Alumni', 'Cuti'))`, report);
        await addConstraintOnce(client, 'classes', 'chk_classes_unit',
            `CHECK (unit IS NULL OR unit IN (${sqlList(UNITS)}))`, report);

        // student_grades -> students (belum punya FK; hanya dibuat bila tidak ada data yatim)
        const orphanGrades = (await client.query(
            `SELECT COUNT(*)::int AS n FROM student_grades g
              WHERE NOT EXISTS (SELECT 1 FROM students s WHERE s.id = g.student_id)`
        )).rows[0].n;
        if (orphanGrades === 0) {
            await addConstraintOnce(client, 'student_grades', 'fk_sg_student',
                'FOREIGN KEY (student_id) REFERENCES students(id) ON UPDATE CASCADE ON DELETE CASCADE', report);
        } else {
            report.push(`⚠ fk_sg_student DILEWATI: ${orphanGrades} nilai siswa (student_grades) tidak punya siswa induk`);
        }

        // ---------- 5. Index ----------
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_students_unit ON students (unit)',
            'CREATE INDEX IF NOT EXISTS idx_students_status ON students (status)',
            'CREATE INDEX IF NOT EXISTS idx_students_program_id ON students (program_id)',
            'CREATE INDEX IF NOT EXISTS idx_students_nama_lower ON students (LOWER(nama))',
            'CREATE INDEX IF NOT EXISTS idx_classes_unit ON classes (unit)',
            'CREATE INDEX IF NOT EXISTS idx_classes_program_id ON classes (program_id)',
            'CREATE INDEX IF NOT EXISTS idx_class_students_student ON class_students (student_id)'
        ];
        for (const ddl of indexes) await client.query(ddl);
        report.push(`✔ ${indexes.length} index dipastikan ada`);

        // ---------- Audit integritas (hanya laporan) ----------
        const audit = {};
        audit.class_students_tanpa_kelas = (await client.query(
            `SELECT COUNT(*)::int AS n FROM class_students cs
              WHERE NOT EXISTS (SELECT 1 FROM classes c WHERE c.id::text = cs.class_id::text)`
        )).rows[0].n;
        audit.siswa_tanpa_unit = (await client.query('SELECT COUNT(*)::int AS n FROM students WHERE unit IS NULL')).rows[0].n;
        audit.siswa_program_belum_terhubung = (await client.query(
            'SELECT COUNT(*)::int AS n FROM students WHERE program IS NOT NULL AND program_id IS NULL'
        )).rows[0].n;
        audit.program_tak_terhubung = (await client.query(
            `SELECT program, unit, COUNT(*)::int AS n FROM students
              WHERE program IS NOT NULL AND program_id IS NULL GROUP BY program, unit ORDER BY n DESC`
        )).rows;
        audit.kelas_tanpa_program_id = (await client.query('SELECT COUNT(*)::int AS n FROM classes WHERE program_id IS NULL')).rows[0].n;
        audit.program_master_tidak_valid = (await client.query(
            `SELECT id, nama, cat FROM programs WHERE LOWER(cat) NOT IN ('kbec','tk','bimbel','calistung','arabin') OR cat IS NULL`
        )).rows;
        audit.nama_siswa_ganda = (await client.query(
            `SELECT LOWER(nama) AS nama, COUNT(*)::int AS n FROM students GROUP BY LOWER(nama) HAVING COUNT(*) > 1`
        )).rows;

        // ---------- Laporan ----------
        log('\n================ LAPORAN MIGRASI ================');
        report.forEach(r => log(r));
        if (changes.students.length) { log('\n-- Perubahan siswa:'); changes.students.forEach(x => log('  ' + x)); }
        if (changes.classes.length) { log('\n-- Perubahan kelas:'); changes.classes.forEach(x => log('  ' + x)); }
        log('\n-- Audit integritas:');
        log(JSON.stringify(audit, null, 2));

        if (APPLY) {
            await client.query('COMMIT');
            log('\n✅ APPLIED: perubahan di-COMMIT.');
        } else {
            await client.query('ROLLBACK');
            log('\nℹ️  DRY-RUN: semua perubahan di-ROLLBACK. Jalankan dengan --apply untuk menerapkan.');
        }
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch (e) { /* abaikan */ }
        console.error('\n❌ MIGRASI GAGAL, semua perubahan di-ROLLBACK:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
