const db = require('../config/db');
const { escapeHTML } = require('../utils/helpers');

async function resolveValidProgramName(programInput) {
    if (!programInput || !String(programInput).trim()) return 'KBEC';
    const pTrim = String(programInput).trim();
    try {
        const [[progExact]] = await db.query('SELECT nama FROM programs WHERE nama = ? LIMIT 1', [pTrim]);
        if (progExact) return progExact.nama;
        
        const [[progCat]] = await db.query('SELECT nama FROM programs WHERE cat = ? OR nama ILIKE ? OR cat ILIKE ? LIMIT 1', [pTrim, `%${pTrim}%`, `%${pTrim}%`]);
        if (progCat) return progCat.nama;
        
        return pTrim;
    } catch (e) {
        return pTrim;
    }
}

async function resolveTeacherId(pengajarInput) {
    if (!pengajarInput || pengajarInput === '-') return null;
    try {
        const [[tRow]] = await db.query('SELECT id FROM teachers WHERE id = ? OR LOWER(nama) = LOWER(?) LIMIT 1', [pengajarInput, String(pengajarInput).trim()]);
        return tRow ? tRow.id : null;
    } catch (e) {
        return null;
    }
}

async function getClasses(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').trim();
        const isTeacher = userRole.toLowerCase().includes('pengajar') || userRole.toLowerCase().includes('guru') || userRole.toLowerCase().includes('teacher');
        
        let sql = 'SELECT c.id, c.nama, c.program, c.pengajar, c.teacher_id, c.kapasitas, c.hari, c.mulai, c.selesai, c.tipe, c.ruang, COALESCE(cs.student_count, 0) AS terisi FROM classes c LEFT JOIN (SELECT class_id, COUNT(*) AS student_count FROM class_students GROUP BY class_id) cs ON c.id::text = cs.class_id::text';
        let params = [];

        if (isTeacher && req.user) {
            const uId = req.user.id || '';
            const tId = req.user.teacher_id || '';
            const tEmail = (req.user.email || '').trim().toLowerCase();
            const tName = (req.user.name || '').trim();

            sql += ' WHERE (c.teacher_id IS NOT NULL AND c.teacher_id != \'\' AND c.teacher_id = (SELECT teacher_id FROM users WHERE id = ? OR nis = ? LIMIT 1))' +
                   ' OR (c.teacher_id IS NOT NULL AND c.teacher_id = ?)' +
                   ' OR (c.teacher_id IS NOT NULL AND c.teacher_id IN (SELECT id FROM teachers WHERE LOWER(email) = LOWER(?)))' +
                   ' OR (LOWER(c.pengajar) = LOWER(?))' +
                   ' OR (c.pengajar ILIKE ?)';
            params.push(uId, uId, tId, tEmail, tName, `%${tName}%`);
        }

        sql += ' ORDER BY c.id ASC';
        const [rows] = await db.query(sql, params);
        res.json(rows || []);
    } catch (err) {
        next(err);
    }
}

async function createClass(req, res, next) {
    const { nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang } = req.body;
    try {
        const validProgram = await resolveValidProgramName(program);
        const resolvedTeacherId = await resolveTeacherId(pengajar);

        const [allClasses] = await db.query('SELECT id FROM classes');
        let maxNum = 0;
        allClasses.forEach(c => {
            const num = parseInt(String(c.id).replace(/[^0-9]/g, ''), 10);
            if (!isNaN(num) && num > maxNum) maxNum = num;
        });
        const nextId = String(maxNum + 1);

        await db.query(
            'INSERT INTO classes (id, nama, program, pengajar, teacher_id, kapasitas, hari, mulai, selesai, tipe, ruang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nextId, escapeHTML(nama || 'Kelas Baru'), validProgram, escapeHTML(pengajar || '-'), resolvedTeacherId, kapasitas || 20, escapeHTML(hari || 'Senin'), escapeHTML(mulai || '08:00'), escapeHTML(selesai || '09:30'), escapeHTML(tipe || 'Reguler'), escapeHTML(ruang || 'Ruang 1')]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Tambah Kelas Baru (${nama || 'Kelas Baru'})`,
                program: validProgram || 'KBEC',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({ success: true, id: nextId });
    } catch (err) {
        next(err);
    }
}

async function updateClass(req, res, next) {
    const { id } = req.params;
    const { nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang } = req.body;
    try {
        const validProgram = await resolveValidProgramName(program);
        const resolvedTeacherId = await resolveTeacherId(pengajar);

        await db.query(
            'UPDATE classes SET nama = ?, program = ?, pengajar = ?, teacher_id = ?, kapasitas = ?, hari = ?, mulai = ?, selesai = ?, tipe = ?, ruang = ? WHERE id = ?',
            [escapeHTML(nama), validProgram, escapeHTML(pengajar), resolvedTeacherId, kapasitas, escapeHTML(hari), escapeHTML(mulai), escapeHTML(selesai), escapeHTML(tipe), escapeHTML(ruang), id]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Update Data Kelas (${nama || id})`,
                program: validProgram || 'KBEC',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deleteClass(req, res, next) {
    const { id } = req.params;
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        await conn.query('DELETE FROM class_students WHERE class_id = ?', [id]);
        await conn.query('DELETE FROM classes WHERE id = ?', [id]);
        await conn.commit();

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Hapus Kelas (ID: ${id})`,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
        next(err);
    } finally {
        conn.release();
    }
}

async function getClassStudents(req, res, next) {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            'SELECT s.* FROM students s JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ?',
            [id]
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function addStudentToClass(req, res, next) {
    const { id } = req.params;
    const { student_id } = req.body;
    try {
        const [[cls]] = await db.query('SELECT kapasitas FROM classes WHERE id = ?', [id]);
        const [[countRes]] = await db.query('SELECT COUNT(*) AS count FROM class_students WHERE class_id = ?', [id]);

        if (cls && countRes.count >= cls.kapasitas) {
            return res.status(400).json({ success: false, message: 'Kelas sudah penuh (kapasitas maksimal tercapai).' });
        }

        // Pastikan satu siswa hanya bisa masuk ke dalam satu kelas
        await db.query('DELETE FROM class_students WHERE student_id = ?', [student_id]);

        await db.query(
            'INSERT INTO class_students (class_id, student_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
            [id, student_id]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function removeStudentFromClass(req, res, next) {
    const { id, student_id } = req.params;
    try {
        await db.query(
            'DELETE FROM class_students WHERE class_id = ? AND student_id = ?',
            [id, student_id]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function getSchedules(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').trim();
        const isTeacher = userRole.toLowerCase().includes('pengajar') || userRole.toLowerCase().includes('guru') || userRole.toLowerCase().includes('teacher');

        if (!isTeacher) {
            // A. Super Admin & Admin: Return ALL classes/schedules without teacher filter
            const [rows] = await db.query(
                'SELECT id, nama AS kelas, nama, program, unit, pengajar, teacher_id, COALESCE(ruangan, ruang, \'-\') AS ruangan, ruang, kapasitas, terisi, status, hari, mulai, selesai, jam, tipe, created_at FROM classes ORDER BY created_at DESC, id ASC'
            );
            // console.log(`[SCHEDULES DEBUG] User: ${req.user ? req.user.name : 'Admin'} | Role: ${userRole} | Total rows returned: ${rows.length}`);
            return res.json(rows || []);
        }

        // B. Pengajar: Filter ONLY classes assigned to this teacher
        const uId = req.user ? req.user.id : '';
        const tId = req.user ? (req.user.teacher_id || '') : '';
        const tEmail = req.user ? (req.user.email || '').trim() : '';
        const tName = req.user ? (req.user.name || '').trim() : '';

        const sql = `
            SELECT 
                c.id,
                c.nama AS kelas,
                c.nama,
                c.program,
                c.unit,
                COALESCE(c.tipe, 'Tatap Muka') AS tipe,
                c.pengajar,
                c.teacher_id,
                COALESCE(c.ruangan, c.ruang, '-') AS ruangan,
                c.ruang,
                c.hari,
                c.mulai,
                c.selesai,
                c.jam,
                c.status,
                c.created_at
            FROM classes c
            WHERE (c.teacher_id IS NOT NULL AND c.teacher_id != '' AND c.teacher_id = (SELECT teacher_id FROM users WHERE id = ? OR nis = ? LIMIT 1))
               OR (c.teacher_id IS NOT NULL AND c.teacher_id != '' AND c.teacher_id = ?)
               OR (c.teacher_id IS NOT NULL AND c.teacher_id != '' AND c.teacher_id IN (SELECT id FROM teachers WHERE LOWER(email) = LOWER(?)))
               OR (LOWER(TRIM(c.pengajar)) = LOWER(TRIM(?)))
               OR (c.pengajar ILIKE ?)
            ORDER BY c.created_at DESC, c.id ASC
        `;

        const [rows] = await db.query(sql, [uId, uId, tId, tEmail, tName, `%${tName}%`]);
        // console.log(`[SCHEDULES DEBUG] User: ${tName} (${tEmail}) | Role: ${userRole} | Rows found: ${rows.length}`);
        // if (rows.length === 0) {
        //     console.log(`[SCHEDULES DEBUG] WARNING: Tidak ada data di tabel 'classes' yang cocok dengan pengajar '${tName}'.`);
        // }
        res.json(rows || []);
    } catch (err) {
        console.error('[SCHEDULES DEBUG] Error fetching schedules:', err);
        res.json([]);
    }
}

module.exports = {
    getClasses,
    createClass,
    updateClass,
    deleteClass,
    getClassStudents,
    addStudentToClass,
    removeStudentFromClass,
    getSchedules
};
