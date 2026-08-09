const db = require('../config/db');

async function globalSearch(req, res, next) {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ students: [], teachers: [], classes: [], payments: [] });
    const term = `%${q.trim()}%`;
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('guru') || userRole.includes('teacher');

        if (isTeacher && req.user) {
            return res.json({ students: [], teachers: [], classes: [], payments: [] });
        }

        const [students] = await db.query('SELECT id, nama, program, level, status FROM students WHERE nama ILIKE $1 OR id ILIKE $2 OR program ILIKE $3 LIMIT 5', [term, term, term]);
        const [teachers] = await db.query('SELECT id, nama, email, status FROM teachers WHERE nama ILIKE $1 OR email ILIKE $2 LIMIT 5', [term, term]);
        const [classes] = await db.query('SELECT id, nama, program, pengajar FROM classes WHERE nama ILIKE $1 OR program ILIKE $2 LIMIT 5', [term, term]);
        const [payments] = await db.query('SELECT id, nama, program, jumlah, status FROM payments WHERE id ILIKE $1 OR nama ILIKE $2 LIMIT 5', [term, term]);
        res.json({ students, teachers, classes, payments });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    globalSearch
};
