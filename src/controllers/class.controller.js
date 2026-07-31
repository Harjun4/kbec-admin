const db = require('../config/db');

async function resolveValidProgramName(programInput) {
    if (!programInput) return null;
    const pTrim = String(programInput).trim();
    try {
        const [[progExact]] = await db.query('SELECT nama FROM programs WHERE nama = ? LIMIT 1', [pTrim]);
        if (progExact) return progExact.nama;
        
        const [[progCat]] = await db.query('SELECT nama FROM programs WHERE cat = ? OR nama ILIKE ? OR cat ILIKE ? LIMIT 1', [pTrim, `%${pTrim}%`, `%${pTrim}%`]);
        if (progCat) return progCat.nama;
        
        return null;
    } catch (e) {
        return null;
    }
}

async function getClasses(req, res, next) {
    try {
        const [rows] = await db.query(
            'SELECT c.id, c.nama, c.program, c.pengajar, c.kapasitas, c.hari, c.mulai, c.selesai, c.tipe, c.ruang, COALESCE(cs.student_count, 0) AS terisi FROM classes c LEFT JOIN (SELECT class_id, COUNT(*) AS student_count FROM class_students GROUP BY class_id) cs ON c.id = cs.class_id ORDER BY c.id ASC'
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function createClass(req, res, next) {
    const { nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang } = req.body;
    try {
        const validProgram = await resolveValidProgramName(program);
        const [[maxRow]] = await db.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM classes');
        const nextId = parseInt(maxRow ? (maxRow.max_id || 0) : 0, 10) + 1;

        await db.query(
            'INSERT INTO classes (id, nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nextId, nama || 'Kelas Baru', validProgram, pengajar || '-', kapasitas || 20, hari || 'Senin', mulai || '08:00', selesai || '09:30', tipe || 'Reguler', ruang || 'Ruang 1']
        );
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
        await db.query(
            'UPDATE classes SET nama = ?, program = ?, pengajar = ?, kapasitas = ?, hari = ?, mulai = ?, selesai = ?, tipe = ?, ruang = ? WHERE id = ?',
            [nama, validProgram, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang, id]
        );
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
        const [rows] = await db.query(
            'SELECT id, hari, mulai, selesai, nama AS kelas, program, tipe, pengajar, ruang FROM classes ORDER BY id ASC'
        );
        res.json(rows);
    } catch (err) {
        next(err);
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
