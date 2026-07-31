const db = require('../config/db');

async function getPrograms(req, res, next) {
    try {
        const [rows] = await db.query('SELECT * FROM programs ORDER BY id ASC');
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function createProgram(req, res, next) {
    const { nama, cat, level, deskripsi, biaya, durasi, sesi } = req.body;
    if (!nama || !nama.trim()) {
        return res.status(400).json({ success: false, message: 'Nama program wajib diisi.' });
    }
    try {
        const [[maxRow]] = await db.query('SELECT COALESCE(MAX(id), 0) AS max_id FROM programs');
        const nextId = parseInt(maxRow ? (maxRow.max_id || 0) : 0, 10) + 1;
        const cleanBiaya = parseInt(String(biaya || 0).replace(/[^0-9]/g, ''), 10) || 0;

        await db.query(
            'INSERT INTO programs (id, nama, cat, level, deskripsi, biaya, durasi, sesi) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [nextId, nama.trim(), cat || 'KBEC', level || 'Dasar 1', deskripsi || '', cleanBiaya, durasi || '3 Bulan', sesi || '24 Sesi']
        );
        res.status(201).json({ success: true, id: nextId, nama: nama.trim() });
    } catch (err) {
        next(err);
    }
}

async function updateProgram(req, res, next) {
    const { id } = req.params;
    const { nama, cat, level, deskripsi, biaya, durasi, sesi } = req.body;
    try {
        const cleanBiaya = parseInt(String(biaya || 0).replace(/[^0-9]/g, ''), 10) || 0;
        await db.query(
            'UPDATE programs SET nama = ?, cat = ?, level = ?, deskripsi = ?, biaya = ?, durasi = ?, sesi = ? WHERE id = ?',
            [nama, cat || 'KBEC', level || 'Dasar 1', deskripsi || '', cleanBiaya, durasi || '3 Bulan', sesi || '24 Sesi', id]
        );
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deleteProgram(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM programs WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getPrograms,
    createProgram,
    updateProgram,
    deleteProgram
};
