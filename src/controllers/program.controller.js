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
        const cleanBiaya = parseInt(String(biaya || 0).replace(/[^0-9]/g, ''), 10) || 0;

        const [result] = await db.query(
            'INSERT INTO programs (nama, cat, level, deskripsi, biaya, durasi, sesi) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nama.trim(), cat || 'KBEC', level || 'Dasar 1', deskripsi || '', cleanBiaya, durasi || '3 Bulan', sesi || '24 Sesi']
        );
        const newId = (result && result.length > 0 && result[0].id) ? result[0].id : (result.insertId || null);
        res.status(201).json({ success: true, id: newId, nama: nama.trim() });
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
