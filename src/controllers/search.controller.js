const db = require('../config/db');

async function globalSearch(req, res, next) {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ students: [], teachers: [], classes: [], payments: [] });
    const term = `%${q.trim()}%`;
    try {
        const [students] = await db.query('SELECT id, nama, program, level, status FROM students WHERE nama ILIKE ? OR id ILIKE ? OR program ILIKE ? LIMIT 5', [term, term, term]);
        const [teachers] = await db.query('SELECT id, nama, email, status FROM teachers WHERE nama ILIKE ? OR email ILIKE ? LIMIT 5', [term, term]);
        const [classes] = await db.query('SELECT id, nama, program, pengajar FROM classes WHERE nama ILIKE ? OR program ILIKE ? LIMIT 5', [term, term]);
        const [payments] = await db.query('SELECT id, nama, program, jumlah, status FROM payments WHERE id ILIKE ? OR nama ILIKE ? LIMIT 5', [term, term]);
        res.json({ students, teachers, classes, payments });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    globalSearch
};
