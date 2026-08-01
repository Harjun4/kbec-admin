const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const os = require('os');
const path = require('path');
require('dotenv').config();

const db = require('./src/config/db');
const helmet = require('helmet');
const errorHandler = require('./src/middlewares/error.middleware');
const { globalRateLimiter, authRateLimiter } = require('./src/middlewares/rateLimiter.middleware');
const { requireAuth, requireRole, requireCsrf, generateToken } = require('./src/middlewares/auth.middleware');
const { hashPassword, verifyPassword } = require('./src/controllers/auth.controller');
const { generateUniqueUserId } = require('./src/utils/helpers');

// Import modular routes
const authRoutes = require('./src/routes/auth.routes');
const studentRoutes = require('./src/routes/student.routes');
const teacherRoutes = require('./src/routes/teacher.routes');
const classRoutes = require('./src/routes/class.routes');
const programRoutes = require('./src/routes/program.routes');
const financeRoutes = require('./src/routes/finance.routes');
const attendanceRoutes = require('./src/routes/attendance.routes');
const inventoryRoutes = require('./src/routes/inventory.routes');

const app = express();
const PORT = process.env.PORT || 3000;

// Essential Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(globalRateLimiter);
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
}));
app.use(express.json());

// CSRF Protection
app.use('/api', requireCsrf);

// URL Normalizer for Vercel
app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/api') {
        return next();
    }
    if (!req.path.includes('.') && req.path !== '/' && req.headers.accept && req.headers.accept.includes('application/json')) {
        req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    next();
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));

// Root Route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount Modular API Routes
app.use('/api/auth', authRoutes);
app.use('/auth', authRoutes);

app.use('/api/students', studentRoutes);
app.use('/students', studentRoutes);

app.use('/api/teachers', teacherRoutes);
app.use('/teachers', teacherRoutes);

app.use('/api/classes', classRoutes);
app.use('/classes', classRoutes);

app.use('/api/programs', programRoutes);
app.use('/programs', programRoutes);

const { getStudentBillsSummary } = require('./src/controllers/finance.controller');
app.get(['/api/finance/bills/per-student', '/finance/bills/per-student', '/api/bills/per-student', '/bills/per-student'], requireAuth, getStudentBillsSummary);

app.use('/api/finance', financeRoutes);
app.use('/finance', financeRoutes);
app.use('/api/bills', (req, res, next) => { req.url = '/bills' + req.url; financeRoutes(req, res, next); });
app.use('/bills', (req, res, next) => { req.url = '/bills' + req.url; financeRoutes(req, res, next); });
app.use('/api/payments', (req, res, next) => { req.url = '/payments' + req.url; financeRoutes(req, res, next); });
app.use('/payments', (req, res, next) => { req.url = '/payments' + req.url; financeRoutes(req, res, next); });

app.use('/api/attendance', attendanceRoutes);
app.use('/attendance', attendanceRoutes);

app.use('/api/inventory', inventoryRoutes);
app.use('/inventory', inventoryRoutes);

// --- AUTH & USER MANAGEMENT EXTRA ENDPOINTS ---

// Register User Endpoint (Secure Default Role)
app.post('/api/auth/register', authRateLimiter, async (req, res, next) => {
    const { name, email, password, nis } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    }
    try {
        const cleanEmail = email.trim();
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [cleanEmail]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email sudah terdaftar.' });
        }

        const selectedRole = 'Admin';
        const finalNis = (nis && nis.trim()) ? nis.trim() : await generateUniqueUserId(db, selectedRole);
        const passwordHashed = await hashPassword(password);
        await db.query(
            'INSERT INTO users (id, nis, name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
            [finalNis, finalNis, name.trim(), cleanEmail, passwordHashed, selectedRole]
        );
        res.status(201).json({ success: true, message: 'Registrasi berhasil!', nis: finalNis });
    } catch (err) {
        next(err);
    }
});

// Profile Update Endpoint (Authenticated & Isolated)
app.put(['/api/auth/profile', '/auth/profile'], requireAuth, async (req, res, next) => {
    const { name, email, password } = req.body;
    const targetEmail = req.user.email;
    try {
        if (!targetEmail) {
            return res.status(400).json({ success: false, message: 'Pengguna tidak terautentikasi.' });
        }

        const newEmail = (email && email.trim()) ? email.trim() : targetEmail;

        if (newEmail !== targetEmail) {
            const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [newEmail]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Email baru sudah digunakan oleh akun lain.' });
            }
        }

        if (password && password.trim()) {
            const passwordHashed = await hashPassword(password.trim());
            await db.query(
                'UPDATE users SET name = ?, email = ?, password = ? WHERE email = ?',
                [name ? name.trim() : 'User KBEC', newEmail, passwordHashed, targetEmail]
            );
        } else {
            await db.query(
                'UPDATE users SET name = ?, email = ? WHERE email = ?',
                [name ? name.trim() : 'User KBEC', newEmail, targetEmail]
            );
        }
        res.json({ success: true, user: { name: name || 'User KBEC', email: newEmail } });
    } catch (err) {
        next(err);
    }
});

// Users Management (Super Admin)
app.get(['/api/users/next-id', '/users/next-id'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    try {
        const { role } = req.query;
        const nextId = await generateUniqueUserId(db, role || 'Admin');
        res.json({ success: true, nextId });
    } catch (err) {
        next(err);
    }
});

app.get(['/api/users', '/users'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT id, nis, name, email, role, created_at FROM users ORDER BY id ASC');
        const formatted = rows.map(r => ({
            ...r,
            nis: r.nis || r.id
        }));
        res.json(formatted);
    } catch (err) {
        next(err);
    }
});

app.post(['/api/users', '/users'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    const { id, nis, name, email, password, role } = req.body;
    if (!name || !name.trim() || !email || !email.trim()) {
        return res.status(400).json({ success: false, message: 'Nama dan email wajib diisi.' });
    }
    const selectedRole = role || 'Admin';
    const finalNis = (nis && nis.trim()) ? nis.trim() : ((id && id.trim()) ? id.trim() : await generateUniqueUserId(db, selectedRole));
    const finalId = finalNis;
    const cleanEmail = email.trim();
    const passwordHashed = await hashPassword(password || '123456');

    try {
        const [existing] = await db.query('SELECT * FROM users WHERE email = ? OR id = ? OR nis = ?', [cleanEmail, finalId, finalNis]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email atau NIS sudah terdaftar dalam sistem.' });
        }

        await db.query(
            'INSERT INTO users (id, nis, name, email, password, role) VALUES (?, ?, ?, ?, ?, ?)',
            [finalId, finalNis, name.trim(), cleanEmail, passwordHashed, selectedRole]
        );
        res.status(201).json({ success: true, id: finalId, nis: finalNis, name: name.trim(), email: cleanEmail, role: selectedRole });
    } catch (err) {
        next(err);
    }
});

app.put(['/api/users/:id', '/users/:id'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    const { id } = req.params;
    const { nis, name, email, role, password } = req.body;
    try {
        const cleanName = name ? name.trim() : '';
        const cleanEmail = email ? email.trim() : '';
        const selectedRole = role || 'Admin';
        const finalNis = nis ? nis.trim() : id;

        if (password && password.trim()) {
            const passwordHashed = await hashPassword(password.trim());
            await db.query(
                'UPDATE users SET nis = ?, name = ?, email = ?, role = ?, password = ? WHERE id = ? OR nis = ?',
                [finalNis, cleanName, cleanEmail, selectedRole, passwordHashed, id, id]
            );
        } else {
            await db.query(
                'UPDATE users SET nis = ?, name = ?, email = ?, role = ? WHERE id = ? OR nis = ?',
                [finalNis, cleanName, cleanEmail, selectedRole, id, id]
            );
        }
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

app.delete(['/api/users/:id', '/users/:id'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM users WHERE id = ? OR nis = ?', [id, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// --- DASHBOARD & GLOBAL SEARCH ENDPOINTS ---

app.get(['/api/dashboard/stats', '/dashboard/stats', '/api/stats', '/stats'], requireAuth, async (req, res, next) => {
    try {
        const { growthPeriod, month, year } = req.query;

        const [[{ count: totalStudents }]] = await db.query('SELECT COUNT(*) AS count FROM students');
        const [[{ count: activeStudents }]] = await db.query('SELECT COUNT(*) AS count FROM students WHERE status = \'Aktif\'');
        const [[{ count: totalTeachers }]] = await db.query('SELECT COUNT(*) AS count FROM teachers');
        const [[{ count: totalClasses }]] = await db.query('SELECT COUNT(*) AS count FROM classes');
        const [[{ count: totalPrograms }]] = await db.query('SELECT COUNT(*) AS count FROM programs');

        const reqMonth = req.query.month || req.query.bulan || req.query.filterMonth;
        const reqYear = req.query.year || req.query.tahun || new Date().getFullYear();

        const now = new Date();
        const currentYear = parseInt(reqYear, 10) || now.getFullYear();
        const fullMonthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        let filterMonth = null; // null means 'semua'
        if (reqMonth === 'current' || (!reqMonth && growthPeriod !== 'semua' && growthPeriod !== '3bulan' && growthPeriod !== '6bulan')) {
            filterMonth = now.getMonth() + 1;
        } else if (reqMonth && reqMonth !== 'semua' && reqMonth !== 'all' && reqMonth !== 'null' && reqMonth !== 'undefined') {
            const parsedM = parseInt(reqMonth, 10);
            if (!isNaN(parsedM) && parsedM >= 1 && parsedM <= 12) {
                filterMonth = parsedM;
            }
        }

        let totalRevenue = 0;
        let todayPayments = 0;
        let pendingPaymentsCount = 0;
        let revenueByProgram = [];

        const todayStr = now.toISOString().split('T')[0];

        if (filterMonth !== null) {
            const mStr = String(filterMonth).padStart(2, '0');
            const mName = fullMonthNames[filterMonth - 1];
            const targetYM = `${currentYear}-${mStr}`;

            // 1. Revenue for selected month & year
            const [[{ sum: revSum }]] = await db.query(
                `SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM') = ?`,
                [targetYM]
            );
            totalRevenue = revSum;

            // 2. Pembayaran Hari Ini
            const [[{ sum: todaySum }]] = await db.query(
                `SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
                [todayStr]
            );
            todayPayments = todaySum;

            // 4. Revenue by Program for selected month
            const [revProg] = await db.query(
                `SELECT program, SUM(jumlah) AS total FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM') = ?
                 GROUP BY program`,
                [targetYM]
            );
            revenueByProgram = revProg;
        } else {
            // All-time aggregation
            const [[{ sum: revSum }]] = await db.query('SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = \'Lunas\'');
            totalRevenue = revSum;

            const [[{ sum: todaySum }]] = await db.query(
                `SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments 
                 WHERE status = 'Lunas' 
                   AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
                [todayStr]
            );
            todayPayments = todaySum;

            const [revProg] = await db.query('SELECT program, SUM(jumlah) AS total FROM payments WHERE status = \'Lunas\' GROUP BY program');
            revenueByProgram = revProg;
        }

        // 3. Tagihan Belum Lunas / Transaksi Tertagih
        if (filterMonth === null) {
            // Filter 'Semua Bulan': Hitung Total Lembar Dokumen Invoice Tertagih di Database (COUNT(*))
            const [[{ count: pendingCount }]] = await db.query(`
                SELECT COUNT(*) AS count 
                FROM bills b
                WHERE (b.status = 'Tertagih' OR b.status = 'Tunggakan' OR b.status = 'Partial' OR b.status = 'Ada Tunggakan' OR b.status != 'Lunas')
                  AND (b.nominal - COALESCE(b.terbayar, 0)) > 0
            `);
            pendingPaymentsCount = parseInt(pendingCount || 0, 10);
        } else {
            // Filter 'Bulan Spesifik': Hitung Jumlah Siswa Unik yang Menunggak s/d Periode Tersebut (COUNT(DISTINCT))
            const mStr = String(filterMonth).padStart(2, '0');
            const targetYM = `${currentYear}-${mStr}`;
            const [[{ count: pendingCount }]] = await db.query(`
                SELECT COUNT(DISTINCT COALESCE(s.id, b.student_id, b.nama)) AS count 
                FROM students s
                JOIN bills b ON (b.student_id = s.id OR (b.nama IS NOT NULL AND LOWER(TRIM(b.nama)) = LOWER(TRIM(s.nama))))
                WHERE (s.status IS NULL OR s.status ILIKE 'Aktif' OR s.status = '')
                  AND (b.status = 'Tertagih' OR b.status = 'Tunggakan' OR b.status = 'Partial' OR b.status = 'Ada Tunggakan' OR b.status != 'Lunas')
                  AND (b.nominal - COALESCE(b.terbayar, 0)) > 0
                  AND (
                      b.bulan_tagihan <= ? 
                      OR (
                          (b.bulan_tagihan IS NULL OR b.bulan_tagihan = '') 
                          AND TO_CHAR(COALESCE(b.created_at::timestamp, b.jatuh_tempo::timestamp), 'YYYY-MM') <= ?
                      )
                  )
            `, [targetYM, targetYM]);
            pendingPaymentsCount = parseInt(pendingCount || 0, 10);
        }

        // 5. Kehadiran Hari Ini (Sinkron dengan siswa yang terdaftar di kelas & data presensi)
        const [[{ count: classStudentsCount }]] = await db.query('SELECT COUNT(*) AS count FROM class_students');
        const enrolledStudentsCount = parseInt(classStudentsCount, 10) || parseInt(activeStudents, 10) || parseInt(totalStudents, 10) || 1;

        let [[{ count: todayHadir }]] = await db.query(
            `SELECT COUNT(*) AS count FROM attendance 
             WHERE (status ILIKE '%Hadir%' OR status = 'Hadir') 
               AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
            [todayStr]
        );
        let [[{ count: recordedTotal }]] = await db.query(
            `SELECT COUNT(*) AS count FROM attendance 
             WHERE TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
            [todayStr]
        );

        if (recordedTotal === 0) {
            const [[latestDateRow]] = await db.query(
                `SELECT MAX(TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD')) AS maxdate 
                 FROM attendance`
            );
            if (latestDateRow && latestDateRow.maxdate) {
                const latestDate = latestDateRow.maxdate;
                const [[{ count: lHadir }]] = await db.query(
                    `SELECT COUNT(*) AS count FROM attendance 
                     WHERE (status ILIKE '%Hadir%' OR status = 'Hadir') 
                       AND TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
                    [latestDate]
                );
                const [[{ count: lTotal }]] = await db.query(
                    `SELECT COUNT(*) AS count FROM attendance 
                     WHERE TO_CHAR(COALESCE(tanggal::timestamp, created_at::timestamp), 'YYYY-MM-DD') = ?`,
                    [latestDate]
                );
                todayHadir = lHadir;
                recordedTotal = lTotal;
            }
        }

        let todayTotal = Math.max(recordedTotal, enrolledStudentsCount);
        if (todayHadir > todayTotal) todayHadir = todayTotal;

        let attendanceRate = "100%";
        if (todayTotal > 0) {
            attendanceRate = Math.round((todayHadir / todayTotal) * 100) + "%";
        }

        // Determine growth graph target month (either growthPeriod or filterMonth)
        const effectiveGrowthMonth = filterMonth !== null ? filterMonth : parseInt(growthPeriod, 10);
        let monthlyGrowth = { labels: [], data: [], title: 'Grafik Pertumbuhan Siswa' };

        if (!isNaN(effectiveGrowthMonth) && effectiveGrowthMonth >= 1 && effectiveGrowthMonth <= 12) {
            const [weeklyCounts] = await db.query(`
                SELECT 
                    EXTRACT(DAY FROM COALESCE(created_at, CURRENT_TIMESTAMP)) AS d,
                    COUNT(*) AS cnt
                FROM students
                WHERE EXTRACT(MONTH FROM COALESCE(created_at, CURRENT_TIMESTAMP)) = ?
                GROUP BY d
            `, [effectiveGrowthMonth]);

            let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
            weeklyCounts.forEach(r => {
                const day = parseInt(r.d, 10);
                const count = parseInt(r.cnt, 10);
                if (day >= 1 && day <= 7) w1 += count;
                else if (day >= 8 && day <= 14) w2 += count;
                else if (day >= 15 && day <= 21) w3 += count;
                else if (day >= 22 && day <= 31) w4 += count;
            });

            monthlyGrowth = {
                labels: ['Minggu 1 (Tgl 1-7)', 'Minggu 2 (Tgl 8-14)', 'Minggu 3 (Tgl 15-21)', 'Minggu 4 (Tgl 22-31)'],
                data: [w1, w2, w3, w4],
                title: `Pendaftaran Siswa (${fullMonthNames[effectiveGrowthMonth - 1]})`
            };
        } else {
            const [monthlyCounts] = await db.query(`
                SELECT 
                    EXTRACT(MONTH FROM COALESCE(created_at, CURRENT_TIMESTAMP)) AS m, 
                    COUNT(*) AS cnt 
                FROM students 
                GROUP BY m
            `);

            const countByMonth = {};
            monthlyCounts.forEach(r => {
                countByMonth[parseInt(r.m, 10)] = parseInt(r.cnt, 10);
            });

            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const currentMonth = now.getMonth() + 1;

            let growthLabels = [];
            let growthData = [];
            let runningTotal = 0;

            const maxMonth = Math.max(currentMonth, 6);
            for (let m = 1; m <= maxMonth; m++) {
                growthLabels.push(monthNames[m - 1]);
                runningTotal += (countByMonth[m] || 0);
                growthData.push(runningTotal);
            }

            if (growthPeriod === '6bulan') {
                growthLabels = growthLabels.slice(-6);
                growthData = growthData.slice(-6);
            } else if (growthPeriod === '3bulan') {
                growthLabels = growthLabels.slice(-3);
                growthData = growthData.slice(-3);
            }

            monthlyGrowth = {
                labels: growthLabels,
                data: growthData,
                title: 'Data Pendaftaran Siswa'
            };
        }

        const [[{ count: totalTransactions }]] = await db.query('SELECT COUNT(*) AS count FROM payments');

        res.json({
            selectedMonth: filterMonth,
            monthName: filterMonth ? fullMonthNames[filterMonth - 1] : 'Semua Bulan',
            totalStudents: Number(totalStudents || 0),
            activeStudents: Number(activeStudents || 0),
            totalTeachers: Number(totalTeachers || 0),
            totalClasses: Number(totalClasses || 0),
            totalPrograms: Number(totalPrograms || 0),
            totalRevenue: Number(totalRevenue || 0),
            todayPayments: Number(todayPayments || 0),
            pendingPaymentsCount: Number(pendingPaymentsCount || 0),
            totalTransactions: Number(totalTransactions || 0),
            attendanceRate,
            todayHadir: Number(todayHadir || 0),
            todayTotal: Number(todayTotal || 0),
            revenueByProgram,
            monthlyGrowth
        });
    } catch (err) {
        next(err);
    }
});

app.get(['/api/dashboard/activities', '/dashboard/activities', '/api/activities', '/activities'], requireAuth, async (req, res, next) => {
    try {
        const [rows] = await db.query(
            "SELECT siswa, aktivitas, program, status, status_color AS statusColor, TO_CHAR(created_at::timestamp, 'DD Mon HH24:MI') AS waktu FROM activity_logs ORDER BY id DESC LIMIT 50"
        );
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.get('/api/search', requireAuth, async (req, res, next) => {
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
});

app.get(['/api/reminders', '/reminders'], requireAuth, async (req, res, next) => {
    try {
        const [rows] = await db.query("SELECT id, title, TO_CHAR(date::timestamp, 'YYYY-MM-DD') AS date, time, location FROM reminders ORDER BY date ASC");
        res.json(rows);
    } catch (err) {
        next(err);
    }
});

app.post(['/api/reminders', '/reminders'], requireAuth, requireRole('Super Admin', 'Admin'), async (req, res, next) => {
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
        res.status(201).json({ success: true, id: nextId });
    } catch (err) {
        next(err);
    }
});

app.delete(['/api/reminders/:id', '/reminders/:id'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM reminders WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
});

// Endpoint diagnosa database aman
app.get(['/api/test-db', '/test-db'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    try {
        const [rows] = await db.query('SELECT COUNT(*) AS total_users FROM users');
        res.json({
            status: 'success',
            message: 'Terhubung ke Database!',
            total_users: rows[0].total_users
        });
    } catch (err) {
        next(err);
    }
});

// Helper Sync Sequences
async function syncPostgresSequences() {
    const isPostgres = (process.env.DB_TYPE || 'postgres').toLowerCase() === 'postgres' || !!process.env.SUPABASE_DB_HOST;
    if (!isPostgres) return;

    const tables = [
        'activity_logs', 'programs', 'classes', 'attendance',
        'reminders', 'teacher_checkins', 'student_grades',
        'deposits', 'petty_cash', 'inventory', 'inventory_mutations'
    ];

    for (const table of tables) {
        try {
            await db.query(`SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE(MAX(id::integer), 1)) FROM ${table}`);
        } catch (e) {
            // skip if sequence doesn't exist
        }
    }
    console.log('✔ PostgreSQL SERIAL sequences synchronized.');
}

// Optional Startup Seeder
if (process.env.SEED_ON_STARTUP === 'true') {
    const { seedDatabase } = require('./scripts/seed');
    seedDatabase().then(async () => {
        await syncPostgresSequences();
        console.log('🚀 Database initial seeding finished.');
    }).catch(err => {
        console.error('❌ Failed seeding database:', err);
    });
}

// Global Error Handler
app.use(errorHandler);

// Server Listener
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        const localIp = getLocalIpAddress();
        console.log(`🚀 Server berjalan di:`);
        console.log(`   - Local:   http://localhost:${PORT}`);
        console.log(`   - Network: http://${localIp}:${PORT}`);
    });
}

module.exports = app;
