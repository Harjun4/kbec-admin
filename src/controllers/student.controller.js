const db = require('../config/db');
const { resolveStudentUnit, generateUniqueStudentId } = require('../utils/helpers');

async function getStudents(req, res, next) {
    try {
        const { page, limit, search, program, status } = req.query;
        if (page && limit) {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 50;
            const offset = (pageNum - 1) * limitNum;

            let whereClauses = [];
            let params = [];

            if (search && search.trim()) {
                whereClauses.push('(nama ILIKE ? OR id ILIKE ? OR kontak ILIKE ? OR alamat ILIKE ?)');
                const term = `%${search.trim()}%`;
                params.push(term, term, term, term);
            }
            if (program && program !== 'Semua Program') {
                whereClauses.push('program = ?');
                params.push(program);
            }
            if (status && status !== 'Semua Status') {
                whereClauses.push('status = ?');
                params.push(status);
            }

            const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
            const [[{ total }]] = await db.query(`SELECT COUNT(*) AS total FROM students ${whereSql}`, params);

            const queryParams = [...params, limitNum, offset];
            const [rows] = await db.query(`SELECT * FROM students ${whereSql} ORDER BY id ASC LIMIT ? OFFSET ?`, queryParams);

            const formatted = rows.map(s => ({
                ...s,
                unit: resolveStudentUnit(s.id, s.program, s.level)
            }));

            return res.json({
                data: formatted,
                total: parseInt(total || 0, 10),
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil((parseInt(total || 0, 10)) / limitNum)
            });
        }

        const [rows] = await db.query('SELECT * FROM students ORDER BY id ASC');
        const formatted = rows.map(s => ({
            ...s,
            unit: resolveStudentUnit(s.id, s.program, s.level)
        }));
        res.json(formatted);
    } catch (err) {
        next(err);
    }
}

async function getNextStudentId(req, res, next) {
    try {
        const { program, unit } = req.query;
        const nextId = await generateUniqueStudentId(db, program || unit || 'KBEC');
        res.json({ success: true, nextId });
    } catch (err) {
        next(err);
    }
}

async function createStudent(req, res, next) {
    const { id, nama, alamat, kontak, program, unit, level, status, initial, color } = req.body;
    if (!nama || !nama.trim()) {
        return res.status(400).json({ success: false, message: 'Nama siswa wajib diisi.' });
    }

    const selectedProgramOrUnit = (program || unit || 'KBEC').trim();
    const finalId = (id && id.trim()) ? id.trim() : await generateUniqueStudentId(db, selectedProgramOrUnit);
    const finalColor = color || 'bg-blue-50 text-blue-600';
    const finalNama = nama.trim();

    try {
        let validProgram = selectedProgramOrUnit;
        if (selectedProgramOrUnit) {
            const [pRows] = await db.query('SELECT nama FROM programs WHERE nama = ?', [selectedProgramOrUnit]);
            if (pRows.length > 0) {
                validProgram = pRows[0].nama;
            } else {
                try {
                    await db.query('INSERT IGNORE INTO programs (nama, cat, level, deskripsi, biaya, durasi, sesi) VALUES (?, ?, ?, ?, ?, ?, ?)',
                        [selectedProgramOrUnit, 'basic', 'Reguler', `Program ${selectedProgramOrUnit}`, 1000000, '3 Bulan', '24 Sesi']);
                    validProgram = selectedProgramOrUnit;
                } catch (e) { }
            }
        }

        await db.query(
            'INSERT INTO students (id, nama, alamat, kontak, program, level, status, initial, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [finalId, finalNama, alamat || '', kontak || '', validProgram, level || 'Beginner', status || 'Aktif', initial || 'S', finalColor]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Pendaftaran Siswa Baru (${finalNama})`,
                program: validProgram || 'KBEC',
                status: 'Terverifikasi'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({
            success: true,
            id: finalId,
            nama: finalNama,
            alamat,
            kontak,
            program: validProgram,
            level,
            status,
            initial,
            color: finalColor
        });
    } catch (err) {
        next(err);
    }
}

async function updateStudent(req, res, next) {
    const { id: oldId } = req.params;
    const { id: newId, nama, alamat, kontak, program, level, status, initial, notes } = req.body;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        let validProgram = program ? program.trim() : null;
        if (program && program.trim()) {
            const [pRows] = await conn.query('SELECT nama FROM programs WHERE nama = ?', [program.trim()]);
            if (pRows.length > 0) {
                validProgram = pRows[0].nama;
            }
        }

        const targetId = (newId && newId.trim()) ? newId.trim() : oldId;

        if (notes !== undefined && notes !== null) {
            await conn.query(
                'UPDATE students SET id = ?, nama = ?, alamat = ?, kontak = ?, program = ?, level = ?, status = ?, notes = ? WHERE id = ?',
                [targetId, nama, alamat, kontak, validProgram, level, status, notes, oldId]
            );
        } else {
            await conn.query(
                'UPDATE students SET id = ?, nama = ?, alamat = ?, kontak = ?, program = ?, level = ?, status = ?, initial = ? WHERE id = ?',
                [targetId, nama, alamat, kontak, validProgram, level, status, initial || 'S', oldId]
            );
        }

        if (targetId !== oldId) {
            await conn.query('UPDATE class_students SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
            await conn.query('UPDATE attendance SET student_id = ? WHERE student_id = ?', [targetId, oldId]);
        }

        await conn.commit();

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Pembaruan Data Siswa (${nama || oldId})`,
                program: validProgram || '-',
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true, id: targetId });
    } catch (err) {
        await conn.rollback();
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
        } catch (lErr) {}

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function bulkCreateStudents(req, res, next) {
    const { list } = req.body;
    if (!list || !Array.isArray(list)) {
        return res.status(400).json({ success: false, message: 'Data list siswa wajib disertakan.' });
    }
    if (list.length > 100) {
        return res.status(400).json({ success: false, message: 'Maksimal 100 data siswa per bulk insert.' });
    }

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        for (let item of list) {
            const name = item.nama;
            if (!name || !name.trim()) continue;

            const studentId = item.id || await generateUniqueStudentId(conn, item.program || item.unit || 'KBEC');
            const address = item.alamat || '';
            const contact = item.kontak || '';
            const program = item.program || null;
            const level = item.level || null;
            const status = item.status || 'Aktif';
            const initial = item.initial || name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const color = item.color || 'bg-blue-50 text-blue-600';

            const [existing] = await conn.query('SELECT id FROM students WHERE id = ? OR nama = ?', [studentId, name.trim()]);
            if (existing.length === 0) {
                await conn.query(
                    'INSERT INTO students (id, nama, alamat, kontak, program, level, status, initial, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [studentId, name.trim(), address, contact, program, level, status, initial, color]
                );
            }
        }

        await conn.commit();
        res.json({ success: true });
    } catch (err) {
        await conn.rollback();
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
    bulkCreateStudents
};
