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

// Enable Trust Proxy for Vercel & Reverse Proxies
app.set('trust proxy', 1);

// Handle favicon.ico requests quickly
app.get('/favicon.ico', (req, res) => res.status(204).end());

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
app.get(['/api/health', '/health'], async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
    } catch (error) {
        console.error('Health check failed:', error.message);
        res.status(500).json({ status: 'error', database: 'disconnected', timestamp: new Date().toISOString() });
    }
});



// Mount Modular API Routes
app.use('/api/auth', authRoutes);

app.use('/api/students', studentRoutes);

app.use('/api/teachers', teacherRoutes);

const { getSchedules } = require('./src/controllers/class.controller');
app.get(['/api/schedules', '/api/classes/schedules', '/api/classes/schedule'], requireAuth, getSchedules);

app.use('/api/classes', classRoutes);

app.use('/api/programs', programRoutes);

const { getStudentBillsSummary } = require('./src/controllers/finance.controller');
app.get(['/api/finance/bills/per-student', '/api/bills/per-student'], requireAuth, getStudentBillsSummary);

app.use('/api/finance', financeRoutes);
app.use('/api/bills', (req, res, next) => { req.url = '/bills' + req.url; financeRoutes(req, res, next); });
app.use('/api/payments', (req, res, next) => { req.url = '/payments' + req.url; financeRoutes(req, res, next); });

app.use('/api/attendance', attendanceRoutes);

app.use('/api/inventory', inventoryRoutes);

const reportRoutes = require('./src/routes/report.routes');
app.use('/api/reports', reportRoutes);


// Import modular routes for extracted modules
const dashboardRoutes = require('./src/routes/dashboard.routes');
const userRoutes = require('./src/routes/user.routes');
const searchRoutes = require('./src/routes/search.routes');
const reminderRoutes = require('./src/routes/reminder.routes');
const logRoutes = require('./src/routes/log.routes');
const { ensureTeacherProfile, approveUser } = require('./src/controllers/user.controller');

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/reminders', reminderRoutes);
app.use('/api/logs', logRoutes);

// Retain the specific admin approval route for backward compatibility with frontend
app.put(['/api/admin/users/:id/approval', '/admin/users/:id/approval'], requireAuth, requireRole('Super Admin'), approveUser);

// Users Management - List Unlinked Teachers for Admin Linking
app.get(['/api/admin/unlinked-teachers', '/admin/unlinked-teachers'], requireAuth, requireRole('Super Admin'), async (req, res, next) => {
    try {
        const [teachers] = await db.query(`
            SELECT t.id, t.nama, t.email, t.kontak, t.status 
            FROM teachers t 
            WHERE t.id NOT IN (SELECT teacher_id FROM users WHERE teacher_id IS NOT NULL AND teacher_id != '')
            ORDER BY t.nama ASC
        `);
        res.json(teachers);
    } catch (err) {
        next(err);
    }
});

// Startup Database Schema Migrations for FK & Approval Status (Only in standalone mode)
if (require.main === module && !process.env.VERCEL) {
    (async function initSchemaMigrations() {
        try {
            await db.query(`
                ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(255) DEFAULT 'Pending';
                ALTER TABLE users ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(255);
                ALTER TABLE classes ADD COLUMN IF NOT EXISTS teacher_id VARCHAR(255);
            `);

            // Synchronize & backfill existing approved teacher users into teachers table
            const [approvedUsers] = await db.query(`
                SELECT id, nis, name, email, role, status 
                FROM users 
                WHERE (LOWER(role) LIKE '%pengajar%' OR LOWER(role) LIKE '%guru%')
                  AND (LOWER(status) = 'approved' OR status IS NULL OR status = '')
            `);

            for (const u of approvedUsers) {
                await ensureTeacherProfile(u.id, 'Pengajar', 'Approved', u.email, u.name);
            }

            // Auto-link classes.teacher_id to teachers.id if unlinked
            try {
                await db.query(`
                    UPDATE classes
                    SET teacher_id = teachers.id
                    FROM teachers
                    WHERE (LOWER(TRIM(classes.pengajar)) = LOWER(TRIM(teachers.nama)) OR classes.pengajar ILIKE '%' || teachers.nama || '%')
                      AND (classes.teacher_id IS NULL OR classes.teacher_id = '')
                `);
            } catch (linkErr) {
                console.warn('Auto-link classes teacher_id note:', linkErr.message);
            }
        } catch (e) {
            console.warn('Schema migration note:', e.message);
        }
    })();
}


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

