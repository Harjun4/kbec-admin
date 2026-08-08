const db = require('../config/db');

async function getReminders(req, res, next) {
    try {
        const [rows] = await db.query("SELECT id, title, TO_CHAR(date::timestamp, 'YYYY-MM-DD') AS date, time, location FROM reminders ORDER BY date ASC");
        res.json(rows);
    } catch (err) {
        next(err);
    }
}

async function createReminder(req, res, next) {
    const { title, date, time, location } = req.body;
    if (!title || !date) {
        return res.status(400).json({ success: false, message: 'Judul agenda dan tanggal wajib diisi.' });
    }
    try {
        const [[maxRow]] = await db.query('SELECT COALESCE(MAX(id), 0) AS maxId FROM reminders');
        const nextId = (maxRow ? (maxRow.maxid || maxRow.maxId || 0) : 0) + 1;

        await db.query(
            'INSERT INTO reminders (id, title, date, time, location) VALUES (?, ?, ?, ?, ?)',
            [nextId, title.trim(), date, time || '', location || '']
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Admin',
                action: `Tambah Agenda (${title.trim()})`,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({ success: true, id: nextId });
    } catch (err) {
        next(err);
    }
}

async function deleteReminder(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM reminders WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getReminders,
    createReminder,
    deleteReminder
};
