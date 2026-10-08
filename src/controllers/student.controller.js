const db = require('../config/db');
const {
    resolveStudentUnit,
    generateUniqueStudentId,
    normalizeUnit,
    normalizeStudentStatus,
    cleanText,
    matchProgramMaster
} = require('../utils/helpers');

/** Batas panjang kolom tabel `students` (harus sinkron dengan DB). */
const LIMITS = {
    id: 100,
    nama: 150,
    kontak: 100,
    unit: 100,
    program: 150,
    level: 100,
    agama: 50,
    nama_ibu: 150,
    nama_ayah: 150,
    tempat_tanggal_lahir: 150
};

const NIS_PATTERN = /^[A-Za-z0-9._\-\/]+$/;

async function loadPrograms(conn) {
    const [rows] = await conn.query('SELECT id, nama, cat, level FROM programs');
    return rows || [];
}

function buildInitial(nama) {
    return String(nama || '')
        .split(' ')
        .filter(Boolean)
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase() || 'S';
}

/** "ISLAM" / "islam" -> "Islam" */
function normalizeAgama(value) {
    const s = cleanText(value);
    if (!s) return null;
    return s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
}

/**
 * Validasi + normalisasi satu payload siswa (form, API, maupun baris impor).
 *
 * @param {object} raw
 * @param {Array}  programs  isi tabel programs
 * @param {object} opts
 *        partial: true  -> hanya field yang dikirim yang diproses (UPDATE)
 *        fallbackUnit   -> unit siswa saat ini (dipakai saat UPDATE tanpa unit)
 * @returns {{error?:string, data?:object, warnings?:string[]}}
 */
function normalizeStudentInput(raw, programs, opts = {}) {
    const partial = !!opts.partial;
    const has = (k) => Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined;
    const data = {};
    const warnings = [];

    // --- nama
    if (has('nama') || !partial) {
        const nama = cleanText(raw.nama);
        if (!nama || nama.length < 2) return { error: 'Nama siswa wajib diisi (minimal 2 karakter).' };
        data.nama = nama;
    }

    // --- NIS
    if (has('id')) {
        const id = cleanText(raw.id);
        if (id) {
            if (!NIS_PATTERN.test(id)) return { error: `NIS "${id}" mengandung karakter/spasi yang tidak diizinkan.` };
            data.id = id;
        }
    }

    // --- unit & program (dengan kompatibilitas klien lama: program=unit, level=program)
    let unitIn = has('unit') ? cleanText(raw.unit) : null;
    let progIn = has('program') ? cleanText(raw.program) : null;

    if (!unitIn && progIn && normalizeUnit(progIn) && !matchProgramMaster(programs, null, progIn)) {
        unitIn = progIn;
        progIn = has('level') ? cleanText(raw.level) : null;
    }

    let unit = null;
    if (unitIn) {
        unit = normalizeUnit(unitIn);
        if (!unit) return { error: `Unit Yayasan "${unitIn}" tidak dikenali (pilih: KBEC, TK, Bimbel, Calistung, Arabin).` };
    }

    const programProvided = has('program') || (has('level') && !has('program')) || !!progIn;
    if (programProvided) {
        if (!progIn && has('level')) progIn = cleanText(raw.level);
        let canonical = null;
        let programId = null;

        if (progIn) {
            const scopeUnit = unit || (partial ? opts.fallbackUnit : null) || null;
            let match = matchProgramMaster(programs, scopeUnit, progIn);
            if (!match && scopeUnit) {
                const other = matchProgramMaster(programs, null, progIn);
                if (other) {
                    return { error: `Program "${other.nama}" milik unit ${other.cat}, bukan unit ${scopeUnit}.` };
                }
            }
            if (!match && !scopeUnit) match = matchProgramMaster(programs, null, progIn);

            if (match) {
                canonical = match.nama;
                programId = match.id;
                if (!unit) unit = normalizeUnit(match.cat);
            } else {
                canonical = progIn;
                warnings.push(`Program "${progIn}" belum terdaftar di master Program (disimpan sebagai teks).`);
            }
        }

        data.program = canonical;
        data.program_id = programId;
        data.level = canonical; // alias lama: modul keuangan masih membaca students.level sebagai nama program
    }

    // --- unit fallback
    if (!unit && !partial) {
        unit = resolveStudentUnit(data.id || '', data.program || '', data.level || '');
    }
    if (unit) data.unit = unit;

    // --- status
    if (has('status') || !partial) {
        const st = normalizeStudentStatus(has('status') ? raw.status : null, 'Aktif');
        if (st === null) return { error: `Status "${raw.status}" tidak valid (Aktif / Nonaktif / Alumni / Cuti).` };
        data.status = st;
    }

    // --- teks opsional
    if (has('kontak')) data.kontak = cleanText(raw.kontak);
    if (has('alamat')) data.alamat = cleanText(raw.alamat);
    if (has('agama')) data.agama = normalizeAgama(raw.agama);
    if (has('nama_ibu')) data.nama_ibu = cleanText(raw.nama_ibu);
    if (has('nama_ayah')) data.nama_ayah = cleanText(raw.nama_ayah);
    if (has('tempat_tanggal_lahir')) data.tempat_tanggal_lahir = cleanText(raw.tempat_tanggal_lahir);
    if (has('notes')) data.notes = raw.notes === null ? null : String(raw.notes);

    // --- batas panjang
    for (const [key, max] of Object.entries(LIMITS)) {
        if (typeof data[key] === 'string' && data[key].length > max) {
            return { error: `Kolom ${key} maksimal ${max} karakter.` };
        }
    }

    return { data, warnings };
}

/** Jalankan statement opsional di dalam transaksi tanpa membatalkan transaksi bila gagal. */
async function savepointExec(conn, sql, params) {
    await conn.query('SAVEPOINT sp_student_cascade');
    try {
        await conn.query(sql, params);
        await conn.query('RELEASE SAVEPOINT sp_student_cascade');
    } catch (e) {
        await conn.query('ROLLBACK TO SAVEPOINT sp_student_cascade');
    }
}

function formatStudent(s) {
    return {
        ...s,
        unit: s.unit || resolveStudentUnit(s.id, s.program, s.level)
    };
}

async function getStudents(req, res, next) {
    try {
        const { page, limit, search, program, unit, status } = req.query;
        if (page && limit) {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 50;
            const offset = (pageNum - 1) * limitNum;

            let whereClauses = [];
            let params = [];

            if (search && search.trim()) {
                whereClauses.push('(nama ILIKE ? OR id ILIKE ? OR kontak ILIKE ? OR alamat ILIKE ? OR nama_ibu ILIKE ? OR nama_ayah ILIKE ?)');
                const term = `%${search.trim()}%`;
                params.push(term, term, term, term, term, term);
            }
            if (program && program !== 'Semua Program') {
                whereClauses.push('program = ?');
                params.push(program);
            }
            const unitFilter = normalizeUnit(unit);
            if (unitFilter) {
                whereClauses.push('unit = ?');
                params.push(unitFilter);
            }
            if (status && status !== 'Semua Status') {
                whereClauses.push('status = ?');
                params.push(normalizeStudentStatus(status, status));
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
            const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM students ${whereSql}`, params);

            const queryParams = [...params, limitNum, offset];
            const [rows] = await db.query(`SELECT * FROM students ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, queryParams);

            return res.json({
                data: rows.map(formatStudent),
                total: parseInt(total || 0, 10),
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil((parseInt(total || 0, 10)) / limitNum)
            });
        }

        const [rows] = await db.query('SELECT * FROM students ORDER BY id ASC');
        res.json(rows.map(formatStudent));
    } catch (err) {
        next(err);
    }
}

async function getNextStudentId(req, res, next) {
    try {
        const { program, unit } = req.query;
        const nextId = await generateUniqueStudentId(db, unit || program || 'KBEC');
        res.json({ success: true, nextId });
    } catch (err) {
        next(err);
    }
}

async function createStudent(req, res, next) {
    try {
        const programs = await loadPrograms(db);
        const { error, data, warnings } = normalizeStudentInput(req.body || {}, programs);
        if (error) {
            return res.status(400).json({ success: false, message: error });
        }

        const finalId = data.id || await generateUniqueStudentId(db, data.unit);

        const [dup] = await db.query('SELECT id FROM students WHERE id = ?', [finalId]);
        if (dup.length > 0) {
            return res.status(409).json({ success: false, message: `NIS ${finalId} sudah terdaftar.` });
        }

        const initial = cleanText(req.body.initial) || buildInitial(data.nama);
        const color = cleanText(req.body.color) || 'bg-blue-50 text-blue-600';

        await db.query(
            `INSERT INTO students
                (id, nama, alamat, kontak, unit, program, program_id, level, status, agama, nama_ibu, nama_ayah, tempat_tanggal_lahir, initial, color)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                finalId, data.nama, data.alamat || null, data.kontak || null, data.unit,
                data.program || null, data.program_id || null, data.level || null, data.status,
                data.agama || null, data.nama_ibu || null, data.nama_ayah || null, data.tempat_tanggal_lahir || null,
                initial, color
            ]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Pendaftaran Siswa Baru (${data.nama})`,
                program: data.program || data.unit || 'KBEC',
                status: 'Terverifikasi'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) { }

        res.status(201).json({
            success: true,
            id: finalId,
            nama: data.nama,
            unit: data.unit,
            program: data.program || null,
            level: data.level || null,
            status: data.status,
            initial,
            color,
            warnings
        });
    } catch (err) {
        next(err);
    }
}

const UPDATABLE_COLUMNS = [
    'nama', 'alamat', 'kontak', 'unit', 'program', 'program_id', 'level', 'status',
    'agama', 'nama_ibu', 'nama_ayah', 'tempat_tanggal_lahir', 'notes'
];

async function updateStudent(req, res, next) {
    const { id: oldId } = req.params;
    const body = req.body || {};

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [existingRows] = await conn.query('SELECT * FROM students WHERE id = ?', [oldId]);
        if (existingRows.length === 0) {
            await conn.rollback();
            return res.status(404).json({ success: false, message: 'Siswa tidak ditemukan.' });
        }
        const existing = existingRows[0];

        const programs = await loadPrograms(conn);
        const { error, data } = normalizeStudentInput(body, programs, {
            partial: true,
            fallbackUnit: normalizeUnit(existing.unit) || resolveStudentUnit(existing.id, existing.program, existing.level)
        });
        if (error) {
            await conn.rollback();
            return res.status(400).json({ success: false, message: error });
        }

        const targetId = data.id || oldId;
        if (targetId !== oldId) {
            const [dup] = await conn.query('SELECT id FROM students WHERE id = ?', [targetId]);
            if (dup.length > 0) {
                await conn.rollback();
                return res.status(409).json({ success: false, message: `NIS ${targetId} sudah dipakai siswa lain.` });
            }
        }

        const sets = [];
        const params = [];
        for (const col of UPDATABLE_COLUMNS) {
            if (Object.prototype.hasOwnProperty.call(data, col)) {
                sets.push(`${col} = ?`);
                params.push(data[col]);
            }
        }
        if (data.nama) {
            sets.push('initial = ?');
            params.push(cleanText(body.initial) || buildInitial(data.nama));
        }
        if (targetId !== oldId) {
            sets.push('id = ?');
            params.push(targetId);
        }

        if (sets.length > 0) {
            params.push(oldId);
            await conn.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, params);
        }

        if (targetId !== oldId) {
            // Foreign key ON UPDATE CASCADE sudah menangani tabel berrelasi; baris di bawah
            // menjamin konsistensi pada tabel yang belum punya FK (mis. student_grades).
            await savepointExec(conn, 'UPDATE class_students SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
            await savepointExec(conn, 'UPDATE attendance SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
            await savepointExec(conn, 'UPDATE bills SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
            await savepointExec(conn, 'UPDATE payments SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
            await savepointExec(conn, 'UPDATE student_grades SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
        }

        await conn.commit();

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Pembaruan Data Siswa (${data.nama || existing.nama || oldId})`,
                program: data.program || existing.program || '-',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) { }

        res.json({ success: true, id: targetId });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { }
        next(err);
    } finally {
        conn.release();
    }
}

async function deleteStudent(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM students WHERE id = ?', [id]);

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Penghapusan/Nonaktif Siswa (${id})`,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) { }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

const MAX_BULK = 100;

/**
 * Impor massal siswa (CSV/Excel dari halaman Data Siswa).
 * - NIS sudah ada  -> diperbarui (mode 'upsert', default) atau dilewati (mode 'skip')
 * - NIS kosong     -> dibuat otomatis sesuai format unit
 * - Setiap baris diproses dengan SAVEPOINT: baris gagal tidak menggagalkan baris lain.
 */
async function bulkCreateStudents(req, res, next) {
    const { list, mode } = req.body || {};
    if (!list || !Array.isArray(list)) {
        return res.status(400).json({ success: false, message: 'Data list siswa wajib disertakan.' });
    }
    if (list.length > MAX_BULK) {
        return res.status(400).json({ success: false, message: `Maksimal ${MAX_BULK} data siswa per bulk insert.` });
    }
    const skipExisting = mode === 'skip';

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const programs = await loadPrograms(conn);

        const report = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [], warnings: [] };

        for (let i = 0; i < list.length; i++) {
            const item = list[i] || {};
            const rowNo = item._row || (i + 1);

            if (!cleanText(item.nama)) {
                // baris kosong dilewati tanpa dihitung gagal
                report.skipped++;
                continue;
            }

            const { error, data, warnings } = normalizeStudentInput(item, programs);
            if (error) {
                report.failed++;
                report.errors.push({ row: rowNo, nis: item.id || null, nama: item.nama, message: error });
                continue;
            }
            (warnings || []).forEach(w => {
                if (report.warnings.length < 100) report.warnings.push({ row: rowNo, message: w });
            });

            await conn.query('SAVEPOINT sp_bulk_row');
            try {
                const nis = data.id || await generateUniqueStudentId(conn, data.unit);
                const [existing] = await conn.query('SELECT id FROM students WHERE id = ?', [nis]);

                if (existing.length > 0) {
                    if (skipExisting) {
                        report.skipped++;
                    } else {
                        const sets = ['nama = ?', 'unit = ?', 'program = ?', 'program_id = ?', 'level = ?', 'status = ?'];
                        const params = [data.nama, data.unit, data.program || null, data.program_id || null, data.level || null, data.status];
                        // Kolom opsional: sel kosong di Excel tidak boleh menghapus data lama
                        ['kontak', 'alamat', 'agama', 'nama_ibu', 'nama_ayah', 'tempat_tanggal_lahir'].forEach(col => {
                            if (data[col]) { sets.push(`${col} = ?`); params.push(data[col]); }
                        });
                        params.push(nis);
                        await conn.query(`UPDATE students SET ${sets.join(', ')} WHERE id = ?`, params);
                        report.updated++;
                    }
                } else {
                    await conn.query(
                        `INSERT INTO students
                            (id, nama, alamat, kontak, unit, program, program_id, level, status, agama, nama_ibu, nama_ayah, tempat_tanggal_lahir, initial, color)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            nis, data.nama, data.alamat || null, data.kontak || null, data.unit,
                            data.program || null, data.program_id || null, data.level || null, data.status,
                            data.agama || null, data.nama_ibu || null, data.nama_ayah || null, data.tempat_tanggal_lahir || null,
                            cleanText(item.initial) || buildInitial(data.nama), cleanText(item.color) || 'bg-blue-50 text-blue-600'
                        ]
                    );
                    report.inserted++;
                }
                await conn.query('RELEASE SAVEPOINT sp_bulk_row');
            } catch (rowErr) {
                await conn.query('ROLLBACK TO SAVEPOINT sp_bulk_row');
                report.failed++;
                report.errors.push({ row: rowNo, nis: data.id || null, nama: data.nama, message: rowErr.message });
            }
        }

        await conn.commit();

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Impor Data Siswa (${report.inserted} baru, ${report.updated} diperbarui, ${report.failed} gagal)`,
                program: 'KBEC',
                status: report.failed > 0 ? 'Sebagian Berhasil' : 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) { }

        res.json({
            success: true,
            count: report.inserted + report.updated,
            total: report.inserted + report.updated,
            ...report
        });
    } catch (err) {
        try { await conn.rollback(); } catch (e) { }
        next(err);
    } finally {
        conn.release();
    }
}

module.exports = {
    getStudents,
    getNextStudentId,
    createStudent,
    updateStudent,
    deleteStudent,
    bulkCreateStudents,
    // diekspor untuk pengujian
    normalizeStudentInput
};
