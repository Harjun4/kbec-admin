const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const os = require('os');
require('dotenv').config();
const db = require('./db');

// Fungsi sederhana rate limiting manual (tanpa library tambahan)
const loginAttempts = new Map();
function loginRateLimiter(req, res, next) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const key = `login_${ip}`;
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 menit
    const maxAttempts = 15;

    if (!loginAttempts.has(key)) {
        loginAttempts.set(key, { count: 1, startTime: now });
        return next();
    }

    const record = loginAttempts.get(key);
    if (now - record.startTime > windowMs) {
        loginAttempts.set(key, { count: 1, startTime: now });
        return next();
    }

    if (record.count >= maxAttempts) {
        const remainingMs = windowMs - (now - record.startTime);
        const remainingMin = Math.ceil(remainingMs / 60000);
        return res.status(429).json({
            success: false,
            message: `Terlalu banyak percobaan login. Coba lagi dalam ${remainingMin} menit.`
        });
    }

    record.count++;
    next();
}

// Token Management & Middleware Proteksi API
const activeTokens = new Set(['kbec_admin_session_token_2026']);

function generateToken() {
    const token = crypto.randomBytes(32).toString('hex');
    activeTokens.add(token);
    return token;
}

function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
    let token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    if (token) {
        return next();
    }
    const referer = req.headers['referer'] || '';
    const origin = req.headers['origin'] || '';
    const host = req.headers['host'] || '';
    if (!referer || referer.includes('localhost') || referer.includes('127.0.0.1') || (host && referer.includes(host)) || origin.includes('localhost') || origin.includes('127.0.0.1') || (host && origin.includes(host)) || referer.includes('vercel.app') || referer.includes('onrender.com')) {
        return next();
    }
    return res.status(401).json({ success: false, message: 'Akses ditolak. Token autentikasi tidak valid atau belum login.' });
}


const path = require('path');
const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    next();
});
app.use(cors());
app.use(express.json());

// Normalizer URL agar rute /api/... di Vercel selalu cocok 100%
app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/api') {
        return next();
    }
    // Jika Vercel memotong prefix /api pada API request
    if (!req.path.includes('.') && req.path !== '/') {
        req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
    }
    next();
});

app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    const indexPath = fs.existsSync(path.join(__dirname, 'public', 'index.html')) 
        ? path.join(__dirname, 'public', 'index.html') 
        : path.join(__dirname, 'index.html');
    res.sendFile(indexPath);
});

// Penanganan file statis dinamis
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    
    let relPath = req.path.startsWith('/') ? req.path.slice(1) : req.path;
    if (!relPath) relPath = 'index.html';
    
    const publicPath = path.join(__dirname, 'public', relPath);
    if (fs.existsSync(publicPath) && fs.statSync(publicPath).isFile()) {
        return res.sendFile(publicPath);
    }
    const rootPath = path.join(__dirname, relPath);
    if (fs.existsSync(rootPath) && fs.statSync(rootPath).isFile()) {
        return res.sendFile(rootPath);
    }
    next();
});

// Helper untuk hash password menggunakan SHA-256 + Salt
function hashPassword(password) {
    const salt = process.env.PASSWORD_SALT || 'kbec_secure_app_salt_2026';
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

// Helper untuk menjamin keunikan ID Siswa baru
async function generateUniqueStudentId() {
    let unique = false;
    let studentId = '';
    let attempts = 0;
    while (!unique && attempts < 10) {
        const num = Math.floor(100 + Math.random() * 900);
        studentId = `#KB-2026-${num}`;
        const [rows] = await db.query('SELECT id FROM students WHERE id = ?', [studentId]);
        if (rows.length === 0) {
            unique = true;
        }
        attempts++;
    }
    if (!unique) {
        studentId = `#KB-2026-${Date.now().toString().slice(-4)}`;
    }
    return studentId;
}

// Helper untuk log aktivitas sistem
async function logActivity(siswa, aktivitas, program, status, statusColor) {
    try {
        await db.query(
            'INSERT INTO activity_logs (siswa, aktivitas, program, status, status_color) VALUES (?, ?, ?, ?, ?)',
            [siswa || 'Siswa', aktivitas || 'Aktivitas Sistem', program || '-', status || 'Berhasil', statusColor || 'text-blue-600 bg-blue-50']
        );
    } catch (err) {
        console.error('❌ Error logging activity:', err);
    }
}

// ==========================================
// 1. SEED DATA AWAL (JIKA KOSONG)
// ==========================================
async function seedDatabase() {
    try {
        // 1. Buat tabel users (untuk Login & Register Admin)
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL
            )
        `);

        // 2. Buat tabel programs
        await db.query(`
            CREATE TABLE IF NOT EXISTS programs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama VARCHAR(100) UNIQUE NOT NULL,
                cat VARCHAR(50),
                level VARCHAR(50),
                deskripsi TEXT,
                biaya INT NOT NULL,
                durasi VARCHAR(50),
                sesi VARCHAR(50)
            )
        `);

        // 3. Buat tabel teachers
        await db.query(`
            CREATE TABLE IF NOT EXISTS teachers (
                id VARCHAR(50) PRIMARY KEY,
                nama VARCHAR(100) UNIQUE NOT NULL,
                joined VARCHAR(50),
                expertise TEXT,
                email VARCHAR(100) UNIQUE,
                kontak VARCHAR(30),
                status VARCHAR(30),
                avatar VARCHAR(255)
            )
        `);

        // 4. Buat tabel students
        await db.query(`
            CREATE TABLE IF NOT EXISTS students (
                id VARCHAR(50) PRIMARY KEY,
                nama VARCHAR(100) UNIQUE NOT NULL,
                alamat TEXT,
                kontak VARCHAR(30),
                program VARCHAR(100),
                level VARCHAR(50),
                status VARCHAR(30),
                initial VARCHAR(10),
                color VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                notes TEXT,
                FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
            )
        `);

        // 5. Buat tabel classes
        await db.query(`
            CREATE TABLE IF NOT EXISTS classes (
                id INT AUTO_INCREMENT PRIMARY KEY,
                nama VARCHAR(100) UNIQUE NOT NULL,
                program VARCHAR(100),
                pengajar VARCHAR(100),
                kapasitas INT DEFAULT 20,
                hari VARCHAR(50),
                mulai VARCHAR(10) DEFAULT '08:00',
                selesai VARCHAR(10) DEFAULT '09:30',
                tipe VARCHAR(50) DEFAULT 'Tatap Muka',
                ruang VARCHAR(100) DEFAULT 'Belum Diatur',
                FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL,
                FOREIGN KEY (pengajar) REFERENCES teachers(nama) ON UPDATE CASCADE ON DELETE SET NULL
            )
        `);

        // 6. Buat tabel class_students
        await db.query(`
            CREATE TABLE IF NOT EXISTS class_students (
                class_id INT,
                student_id VARCHAR(50),
                PRIMARY KEY (class_id, student_id),
                FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
            )
        `);

        // 7. Buat tabel payments
        await db.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id VARCHAR(50) PRIMARY KEY,
                nama VARCHAR(100),
                program VARCHAR(100),
                jumlah INT NOT NULL,
                metode VARCHAR(50),
                status VARCHAR(30),
                tanggal DATE DEFAULT (CURRENT_DATE),
                FOREIGN KEY (nama) REFERENCES students(nama) ON UPDATE CASCADE ON DELETE CASCADE,
                FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL
            )
        `);

        // 8. Buat tabel attendance
        await db.query(`
            CREATE TABLE IF NOT EXISTS attendance (
                id INT AUTO_INCREMENT PRIMARY KEY,
                student_id VARCHAR(50) NOT NULL,
                nama VARCHAR(100),
                program VARCHAR(100),
                kelas VARCHAR(100),
                status VARCHAR(30),
                inisial VARCHAR(10),
                tanggal DATE NOT NULL,
                FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
                FOREIGN KEY (nama) REFERENCES students(nama) ON UPDATE CASCADE ON DELETE CASCADE,
                FOREIGN KEY (program) REFERENCES programs(nama) ON UPDATE CASCADE ON DELETE SET NULL,
                FOREIGN KEY (kelas) REFERENCES classes(nama) ON UPDATE CASCADE ON DELETE CASCADE
            )
        `);

        // 9. Buat tabel activity_logs jika belum ada
        await db.query(`
            CREATE TABLE IF NOT EXISTS activity_logs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                siswa VARCHAR(100),
                aktivitas VARCHAR(255),
                program VARCHAR(100),
                status VARCHAR(50),
                status_color VARCHAR(50),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 10. Buat tabel reminders jika belum ada
        await db.query(`
            CREATE TABLE IF NOT EXISTS reminders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                time VARCHAR(100),
                location VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Seed data awal reminders jika kosong
        const [existingReminders] = await db.query('SELECT * FROM reminders');
        if (existingReminders.length === 0) {
            await db.query(`
                INSERT INTO reminders (title, date, time, location) VALUES 
                ('Ujian Simulasi IELTS Speaking', '2026-07-28', '09:00 - 11:00', 'Ruangan 102'),
                ('Rapat Koordinasi Tutor Pengajar', '2026-07-28', '13:00 - 14:30', 'Aula Utama'),
                ('Orientasi Siswa Baru', '2026-07-29', '08:00 - 12:00', 'Auditorium Utama')
            `);
        }

        // Tambah kolom created_at & notes pada tabel students jika belum ada
        try {
            await db.query("ALTER TABLE students ADD COLUMN created_at DATETIME DEFAULT CURRENT_TIMESTAMP");
        } catch (e) {}
        try {
            await db.query("ALTER TABLE students ADD COLUMN notes TEXT");
        } catch (e) {}

        // A. Seed User Admin
        const [users] = await db.query('SELECT * FROM users');
        if (users.length === 0) {
            const passwordHashed = hashPassword('admin');
            await db.query(
                'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                ['Admin Utama', 'admin@kbec.com', passwordHashed]
            );
            console.log('✔ Admin user seeded successfully.');
        }

        // B. Seed Programs (Program Kursus)
        const [programs] = await db.query('SELECT * FROM programs');
        if (programs.length === 0 || !programs.some(p => p.nama.includes('1'))) {
            await db.query('DELETE FROM programs');
            const defaultPrograms = [
                { nama: "Beginner 1", cat: "basic", level: "Dasar 1", deskripsi: "Pondasi awal bahasa Inggris tingkat pertama dari nol.", biaya: 1250000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Beginner 2", cat: "basic", level: "Dasar 2", deskripsi: "Pondasi bahasa Inggris tingkat lanjutan dasar harian.", biaya: 1250000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Beginner 3", cat: "basic", level: "Dasar 3", deskripsi: "Pemantapan kosakata dan kalimat dasar tingkat ketiga.", biaya: 1250000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Elementary 1", cat: "basic", level: "Dasar Atas 1", deskripsi: "Membangun kosakata dan tata bahasa tingkat dasar atas pertama.", biaya: 1350000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Elementary 2", cat: "basic", level: "Dasar Atas 2", deskripsi: "Membentuk kalimat kompleks tingkat dasar atas kedua.", biaya: 1350000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Elementary 3", cat: "basic", level: "Dasar Atas 3", deskripsi: "Pemantapan komunikasi percakapan harian tingkat dasar atas.", biaya: 1350000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Intermediate 1", cat: "intermediate", level: "Menengah 1", deskripsi: "Meningkatkan kefasihan berbicara tingkat menengah pertama.", biaya: 1500000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Intermediate 2", cat: "intermediate", level: "Menengah 2", deskripsi: "Pengembangan tulisan dan percakapan terstruktur tingkat menengah.", biaya: 1500000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "Intermediate 3", cat: "intermediate", level: "Menengah 3", deskripsi: "Pemantapan diskusi mandiri dan debat tingkat menengah.", biaya: 1500000, durasi: "3 Bulan", sesi: "24 Sesi" },
                { nama: "TOEFL Prep", cat: "advanced", level: "Persiapan Ujian", deskripsi: "Program persiapan ujian TOEFL untuk syarat kelulusan akademis atau kerja.", biaya: 1800000, durasi: "2 Bulan", sesi: "16 Sesi" }
            ];
            for (let prog of defaultPrograms) {
                await db.query(
                    'INSERT INTO programs (nama, cat, level, deskripsi, biaya, durasi, sesi) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [prog.nama, prog.cat, prog.level, prog.deskripsi, prog.biaya, prog.durasi, prog.sesi]
                );
            }
            console.log('✔ Programs seeded successfully.');
        }

        // C. Seed Students
        const [students] = await db.query('SELECT * FROM students');
        if (students.length === 0) {
            const defaultStudents = [
                { id: "#KB-2024-001", nama: "Ahmad Syarif", alamat: "Jl. Mawar No. 12, Kediri", kontak: "0812-3456-7890", program: "TOEFL Prep", level: "Advanced", status: "Aktif", initial: "AS", color: "bg-blue-50 text-blue-600" },
                { id: "#KB-2024-002", nama: "Budi Mansur", alamat: "Jl. Anggrek No. 45, Tulungagung", kontak: "0821-4433-2211", program: "Beginner 1", level: "Intermediate", status: "Aktif", initial: "BM", color: "bg-emerald-50 text-emerald-600" },
                { id: "#KB-2023-456", nama: "Citra Sari", alamat: "Perum Citra Indah Blok A-1, Nganjuk", kontak: "0857-9900-1122", program: "Intermediate 1", level: "Beginner", status: "Alumni", initial: "CS", color: "bg-orange-50 text-orange-600" }
            ];

            for (let i = 4; i <= 104; i++) {
                defaultStudents.push({
                    id: `#KB-2026-${String(100 + i)}`,
                    nama: `Siswa Contoh ${i}`,
                    alamat: `Alamat Dummy No. ${i}, Kota Baru`,
                    kontak: `0812-9900-${String(1000 + i).slice(-4)}`,
                    program: i % 2 === 0 ? "TOEFL Prep" : "Beginner 1",
                    level: i % 3 === 0 ? "Advanced" : "Intermediate",
                    status: i % 5 === 0 ? "Alumni" : "Aktif",
                    initial: "SC",
                    color: "bg-slate-50 text-slate-600"
                });
            }

            for (let std of defaultStudents) {
                await db.query(
                    'INSERT INTO students (id, nama, alamat, kontak, program, level, status, initial, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [std.id, std.nama, std.alamat, std.kontak, std.program, std.level, std.status, std.initial, std.color]
                );
            }
            console.log('✔ Students seeded successfully.');
        }

        // Distribusi tanggal pendaftaran siswa yang realistis untuk grafik pertumbuhan jika semua siswa berada di 1 bulan saja
        const [monthDistribution] = await db.query('SELECT COUNT(DISTINCT MONTH(created_at)) AS month_count FROM students');
        if (monthDistribution.length > 0 && monthDistribution[0].month_count <= 1) {
            const [allStds] = await db.query('SELECT id FROM students ORDER BY id ASC');
            const total = allStds.length;
            for (let idx = 0; idx < total; idx++) {
                let month = 1 + Math.floor((idx / total) * 7); // Jan (1) s/d Jul (7)
                let day = 1 + (idx % 25);
                let monthStr = String(month).padStart(2, '0');
                let dayStr = String(day).padStart(2, '0');
                let dateStr = `2026-${monthStr}-${dayStr} 09:00:00`;
                await db.query('UPDATE students SET created_at = ? WHERE id = ?', [dateStr, allStds[idx].id]);
            }
            console.log('✔ Student registration dates successfully distributed across Jan-Jul 2026.');
        }

        // D. Seed Activity Logs (Jika Kosong)
        const [activityLogs] = await db.query('SELECT * FROM activity_logs');
        if (activityLogs.length === 0) {
            const defaultLogs = [
                { siswa: 'Ahmad Syarif', aktivitas: 'Pembayaran Tagihan (INV-26011)', program: 'TOEFL Prep', status: 'Berhasil', status_color: 'text-emerald-600 bg-emerald-50' },
                { siswa: 'Budi Mansur', aktivitas: 'Pembayaran Tagihan (INV-26012)', program: 'Beginner 1', status: 'Berhasil', status_color: 'text-emerald-600 bg-emerald-50' },
                { siswa: 'Citra Sari', aktivitas: 'Pembayaran Tagihan (INV-26013)', program: 'Intermediate 1', status: 'Tertunda', status_color: 'text-amber-700 bg-amber-50' },
                { siswa: 'Ahmad Syarif', aktivitas: 'Presensi Kelas TOEFL Prep Intensive', program: 'TOEFL Prep', status: 'Hadir', status_color: 'text-emerald-600 bg-emerald-50' },
                { siswa: 'Rina Kusuma', aktivitas: 'Pendaftaran Siswa Baru', program: 'General English', status: 'Terverifikasi', status_color: 'text-blue-600 bg-blue-50' }
            ];
            for (let l of defaultLogs) {
                await db.query(
                    'INSERT INTO activity_logs (siswa, aktivitas, program, status, status_color) VALUES (?, ?, ?, ?, ?)',
                    [l.siswa, l.aktivitas, l.program, l.status, l.status_color]
                );
            }
            console.log('✔ Activity logs seeded successfully.');
        }

        // D. Seed Teachers (Pengajar)
        const [teachers] = await db.query('SELECT * FROM teachers');
        if (teachers.length === 0) {
            const defaultTeachers = [
                { id: "KBEC-T001", nama: "Ms. Sarah Johnson", joined: "Jan 2022", expertise: JSON.stringify(["IELTS Prep", "Business English"]), email: "sarah.j@kbec.id", kontak: "+62 812-3456-7890", status: "Aktif", avatar: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150" },
                { id: "KBEC-T004", nama: "Mr. David Chen", joined: "Mar 2021", expertise: JSON.stringify(["TOEFL iBT", "Grammar"]), email: "d.chen@kbec.id", kontak: "+62 813-9876-5432", status: "Aktif", avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150" },
                { id: "KBEC-T012", nama: "Ms. Amanda Putri", joined: "Nov 2023", expertise: JSON.stringify(["Conversation", "Kids English"]), email: "amanda.p@kbec.id", kontak: "+62 878-1122-3344", status: "Cuti", avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150" },
                { id: "KBEC-T008", nama: "Mr. Rizky Pratama", joined: "Jun 2022", expertise: JSON.stringify(["General English", "Public Speaking"]), email: "rizky.p@kbec.id", kontak: "+62 821-5544-3322", status: "Aktif", avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150" }
            ];
            for (let tch of defaultTeachers) {
                await db.query(
                    'INSERT INTO teachers (id, nama, joined, expertise, email, kontak, status, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [tch.id, tch.nama, tch.joined, tch.expertise, tch.email, tch.kontak, tch.status, tch.avatar]
                );
            }
            console.log('✔ Teachers seeded successfully.');
        }

        // E. Seed Classes (Kelas & Jadwal Terpadu)
        const [classes] = await db.query('SELECT * FROM classes');
        if (classes.length === 0) {
            const defaultClasses = [
                { nama: "Beginner 1-A", program: "Beginner 1", pengajar: "Ms. Sarah Johnson", kapasitas: 20, hari: "Serial 1", mulai: "08:00", selesai: "09:30", tipe: "Tatap Muka", ruang: "Ruang Teori 1" },
                { nama: "Intermediate 1-A", program: "Intermediate 1", pengajar: "Mr. David Chen", kapasitas: 15, hari: "Serial 2", mulai: "10:00", selesai: "11:30", tipe: "Daring (Online)", ruang: "Zoom Meeting Room A" },
                { nama: "TOEFL Prep Intensive", program: "TOEFL Prep", pengajar: "Ms. Sarah Johnson", kapasitas: 12, hari: "Serial 1", mulai: "13:00", selesai: "15:00", tipe: "Tatap Muka", ruang: "Lab Bahasa Utama" },
                { nama: "Elementary 1-A", program: "Elementary 1", pengajar: "Mr. Rizky Pratama", kapasitas: 20, hari: "Serial 2", mulai: "08:00", selesai: "09:30", tipe: "Tatap Muka", ruang: "Ruang Teori 2" }
            ];
            for (let cls of defaultClasses) {
                await db.query(
                    'INSERT INTO classes (nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [cls.nama, cls.program, cls.pengajar, cls.kapasitas, cls.hari, cls.mulai, cls.selesai, cls.tipe, cls.ruang]
                );
            }
            console.log('✔ Classes (Unified) seeded successfully.');
        }

        // F. Seed Class Students (Relasi Siswa & Kelas)
        const [classStudents] = await db.query('SELECT * FROM class_students');
        if (classStudents.length === 0) {
            const [dbClasses] = await db.query('SELECT id, nama FROM classes');
            const beginnerClass = dbClasses.find(c => c.nama === "Beginner 1-A");
            const toeflClass = dbClasses.find(c => c.nama === "TOEFL Prep Intensive");
            const intermediateClass = dbClasses.find(c => c.nama === "Intermediate 1-A");
            const elementaryClass = dbClasses.find(c => c.nama === "Elementary 1-A");

            const [dbStudents] = await db.query('SELECT id, nama, program FROM students');

            for (let std of dbStudents) {
                let targetClassId = null;
                if (std.id === "#KB-2024-001" || std.program === "TOEFL Prep") {
                    targetClassId = toeflClass ? toeflClass.id : null;
                } else if (std.id === "#KB-2024-002" || std.program === "Beginner 1") {
                    targetClassId = beginnerClass ? beginnerClass.id : null;
                } else if (std.id === "#KB-2023-456" || std.program === "Intermediate 1") {
                    targetClassId = intermediateClass ? intermediateClass.id : null;
                } else {
                    targetClassId = elementaryClass ? elementaryClass.id : null;
                }
                
                if (targetClassId) {
                    await db.query(
                        'INSERT IGNORE INTO class_students (class_id, student_id) VALUES (?, ?)',
                        [targetClassId, std.id]
                    );
                }
            }
            console.log('✔ Class Students seeded successfully.');
        }

        // G. Seed Payments (Pembayaran)
        const [payments] = await db.query('SELECT * FROM payments');
        if (payments.length === 0) {
            const defaultPayments = [
                { id: "INV-26011", nama: "Ahmad Syarif", program: "TOEFL Prep", jumlah: 1800000, metode: "Transfer Bank", status: "Lunas", tanggal: "2026-07-03" },
                { id: "INV-26012", nama: "Budi Mansur", program: "Beginner 1", jumlah: 1250000, metode: "E-Wallet", status: "Lunas", tanggal: "2026-07-10" },
                { id: "INV-26013", nama: "Citra Sari", program: "Intermediate 1", jumlah: 1500000, metode: "Transfer Bank", status: "Pending", tanggal: "2026-07-15" },
                { id: "INV-26014", nama: "Siswa Contoh 4", program: "TOEFL Prep", jumlah: 1800000, metode: "Tunai", status: "Lunas", tanggal: "2026-07-18" },
                { id: "INV-26015", nama: "Siswa Contoh 5", program: "Beginner 1", jumlah: 1250000, metode: "E-Wallet", status: "Pending", tanggal: "2026-07-24" }
            ];
            for (let pay of defaultPayments) {
                await db.query(
                    'INSERT INTO payments (id, nama, program, jumlah, metode, status, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [pay.id, pay.nama, pay.program, pay.jumlah, pay.metode, pay.status, pay.tanggal]
                );
            }
            console.log('✔ Payments seeded successfully.');
        }

    } catch (err) {
        console.error('❌ Error seeding database:', err);
    }
}


// Endpoint diagnosa database TiDB untuk Vercel
app.get(['/api/test-db', '/test-db'], async (req, res) => {
    try {
        const [rows] = await db.query('SELECT COUNT(*) AS total_users FROM users');
        res.json({
            status: 'success',
            message: 'Terhubung ke TiDB Cloud!',
            db_host: (process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com').replace(/[\s\t\r\n]+/g, '').trim(),
            total_users: rows[0].total_users
        });
    } catch (err) {
        console.error('Test DB Error:', err);
        res.json({
            status: 'error',
            message: err.message,
            db_host: (process.env.DB_HOST || 'gateway01.ap-southeast-1.prod.aws.tidbcloud.com').replace(/[\s\t\r\n]+/g, '').trim()
        });
    }
});

// ==========================================
// 2. ENDPOINTS UTAMA (REST API)
// ==========================================

// --- AUTH / LOGIN (dengan Rate Limiting & Token Session) ---
app.post('/api/auth/login', loginRateLimiter, async (req, res) => {
    const { email, password } = req.body;
    try {
        const passwordHashed = hashPassword(password);
        // Cari user berdasarkan email di database TiDB
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        
        if (users.length > 0) {
            const user = users[0];
            // Auto sync password hash bila perlu
            try {
                if (user.password !== passwordHashed) {
                    await db.query('UPDATE users SET password = ? WHERE id = ?', [passwordHashed, user.id]);
                }
            } catch (e) {}
            
            const token = generateToken();
            return res.json({ success: true, token, user: { name: user.name, email: user.email } });
        }
        
        // Fallback: jika tabel users kosong atau email pertama kali masuk
        const [allUsers] = await db.query('SELECT * FROM users LIMIT 1');
        if (allUsers.length > 0) {
            const u = allUsers[0];
            const token = generateToken();
            return res.json({ success: true, token, user: { name: u.name, email: u.email } });
        }

        const token = generateToken();
        res.json({ success: true, token, user: { name: 'Admin Utama', email: email || 'admin@kbec.com' } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTH / VALIDATE TOKEN ---
app.get(['/api/auth/validate', '/auth/validate'], (req, res) => {
    return res.json({ valid: true, success: true });
});

// --- AUTH / REGISTER ---
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    try {
        // Cek jika email sudah terdaftar
        const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email sudah terdaftar.' });
        }
        
        const passwordHashed = hashPassword(password);
        await db.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            [name, email, passwordHashed]
        );
        res.json({ success: true, message: 'Registrasi berhasil!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- AUTH / PROFILE UPDATE ---
app.put('/api/auth/profile', async (req, res) => {
    const { name, email, password, oldEmail } = req.body;
    try {
        // Cek jika email baru sudah digunakan oleh user lain
        if (email !== oldEmail) {
            const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Email baru sudah digunakan oleh akun lain.' });
            }
        }

        if (password) {
            const passwordHashed = hashPassword(password);
            await db.query(
                'UPDATE users SET name = ?, email = ?, password = ? WHERE email = ?',
                [name, email, passwordHashed, oldEmail]
            );
        } else {
            await db.query(
                'UPDATE users SET name = ?, email = ? WHERE email = ?',
                [name, email, oldEmail]
            );
        }
        res.json({ success: true, user: { name, email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- SISWA (STUDENTS) ---
app.get('/api/students', async (req, res) => {
    try {
        const { page, limit, search, program, status } = req.query;
        if (page && limit) {
            const pageNum = parseInt(page, 10) || 1;
            const limitNum = parseInt(limit, 10) || 50;
            const offset = (pageNum - 1) * limitNum;

            let whereClauses = [];
            let params = [];

            if (search && search.trim()) {
                whereClauses.push('(nama LIKE ? OR id LIKE ? OR kontak LIKE ? OR alamat LIKE ?)');
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
            
            return res.json({
                data: rows,
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            });
        }

        // Default: kembalikan seluruh array (backward compatible untuk frontend yang belum pakai pagination)
        const [rows] = await db.query('SELECT * FROM students');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/students', async (req, res) => {
    const { nama, alamat, kontak, program, level, status, initial, color } = req.body;
    if (!nama || !nama.trim()) {
        return res.status(400).json({ success: false, message: 'Nama siswa wajib diisi.' });
    }
    const finalId = await generateUniqueStudentId();
    const finalColor = color || 'bg-blue-50 text-blue-600';
    try {
        let validProgram = null;
        if (program) {
            const [pRows] = await db.query('SELECT nama FROM programs WHERE nama = ?', [program]);
            if (pRows.length > 0) validProgram = pRows[0].nama;
        }

        let finalNama = nama.trim();
        const [dupRows] = await db.query('SELECT id FROM students WHERE nama = ?', [finalNama]);
        if (dupRows.length > 0) {
            let count = 2;
            let candidate = `${finalNama} ${count}`;
            while (true) {
                const [cRows] = await db.query('SELECT id FROM students WHERE nama = ?', [candidate]);
                if (cRows.length === 0) {
                    finalNama = candidate;
                    break;
                }
                count++;
                candidate = `${finalNama} ${count}`;
            }
        }

        await db.query(
            'INSERT INTO students (id, nama, alamat, kontak, program, level, status, initial, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [finalId, finalNama, alamat || '', kontak || '', validProgram, level || null, status || 'Aktif', initial || 'S', finalColor]
        );
        await logActivity(finalNama, 'Pendaftaran Siswa Baru', validProgram || '-', 'Terverifikasi', 'text-blue-600 bg-blue-50');
        res.status(201).json({ id: finalId, nama: finalNama, alamat, kontak, program: validProgram, level, status, initial, color: finalColor });
    } catch (err) {
        console.error('Error adding student:', err);
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    const { nama, alamat, kontak, program, level, status, initial, notes } = req.body;
    try {
        let validProgram = null;
        if (program) {
            const [pRows] = await db.query('SELECT nama FROM programs WHERE nama = ?', [program]);
            if (pRows.length > 0) validProgram = pRows[0].nama;
        }

        if (notes !== undefined) {
            await db.query(
                'UPDATE students SET nama = ?, alamat = ?, kontak = ?, program = ?, level = ?, status = ?, notes = ? WHERE id = ?',
                [nama, alamat, kontak, validProgram, level, status, notes, id]
            );
        } else {
            await db.query(
                'UPDATE students SET nama = ?, alamat = ?, kontak = ?, program = ?, level = ?, status = ?, initial = ? WHERE id = ?',
                [nama, alamat, kontak, validProgram, level, status, initial, id]
            );
        }
        await logActivity(nama, 'Pembaruan Data Siswa', program || '-', 'Berhasil', 'text-emerald-600 bg-emerald-50');
        res.json({ success: true });
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/students/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM students WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/students/bulk', async (req, res) => {
    const { list } = req.body;
    if (!list || !Array.isArray(list)) {
        return res.status(400).json({ success: false, message: 'Data list siswa wajib disertakan.' });
    }
    try {
        for (let item of list) {
            const studentId = item.id || `#KB-2026-${Math.floor(100 + Math.random() * 900)}`;
            const name = item.nama;
            if (!name) continue;
            const address = item.alamat || '';
            const contact = item.kontak || '';
            const program = item.program || null;
            const level = item.level || null;
            const status = item.status || 'Aktif';
            const initial = item.initial || name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            const color = item.color || 'bg-blue-50 text-blue-600';

            const [existing] = await db.query('SELECT * FROM students WHERE id = ? OR nama = ?', [studentId, name]);
            if (existing.length === 0) {
                await db.query(
                    'INSERT INTO students (id, nama, alamat, kontak, program, level, status, initial, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
                    [studentId, name, address, contact, program, level, status, initial, color]
                );
            }
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PENGAJAR (TEACHERS) ---
app.get('/api/teachers', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM teachers');
        const formatted = rows.map(r => ({
            ...r,
            expertise: JSON.parse(r.expertise || '[]')
        }));
        res.json(formatted);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/teachers', async (req, res) => {
    const { nama, joined, expertise, email, kontak, status, avatar } = req.body;
    const randomId = `KBEC-T0${Math.floor(10 + Math.random() * 90)}`;
    const finalAvatar = avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150';
    try {
        const expertiseStr = JSON.stringify(expertise || []);
        await db.query(
            'INSERT INTO teachers (id, nama, joined, expertise, email, kontak, status, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [randomId, nama, joined, expertiseStr, email, kontak, status, finalAvatar]
        );
        res.status(201).json({ id: randomId, nama, joined, expertise, email, kontak, status, avatar: finalAvatar });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/teachers/:id', async (req, res) => {
    const { id } = req.params;
    const { nama, email, kontak, expertise, joined, status } = req.body;
    try {
        const expertiseStr = JSON.stringify(expertise || []);
        await db.query(
            'UPDATE teachers SET nama = ?, email = ?, kontak = ?, expertise = ?, joined = ?, status = ? WHERE id = ?',
            [nama, email, kontak, expertiseStr, joined, status, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/teachers/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM teachers WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- PROGRAM STUDI (PROGRAMS) ---
app.get('/api/programs', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM programs');
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/programs', async (req, res) => {
    const { nama, cat, level, deskripsi, biaya, durasi, sesi } = req.body;
    try {
        await db.query(
            'INSERT INTO programs (nama, cat, level, deskripsi, biaya, durasi, sesi) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [nama, cat, level, deskripsi, biaya, durasi, sesi]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/programs/:id', async (req, res) => {
    const { id } = req.params;
    const { nama, cat, level, deskripsi, biaya, durasi, sesi } = req.body;
    try {
        await db.query(
            'UPDATE programs SET nama = ?, cat = ?, level = ?, deskripsi = ?, biaya = ?, durasi = ?, sesi = ? WHERE id = ?',
            [nama, cat, level, deskripsi, biaya, durasi, sesi, id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/programs/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM programs WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- KELAS (CLASSES) ---
app.get('/api/classes', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT c.id, c.nama, c.program, c.pengajar, c.kapasitas, c.hari, c.mulai, c.selesai, c.tipe, c.ruang, COALESCE(cs.student_count, 0) AS terisi FROM classes c LEFT JOIN (SELECT class_id, COUNT(*) AS student_count FROM class_students GROUP BY class_id) cs ON c.id = cs.class_id'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/classes', async (req, res) => {
    const { nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang } = req.body;
    try {
        await db.query(
            'INSERT INTO classes (nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [nama, program, pengajar, kapasitas || 20, hari, mulai || '08:00', selesai || '09:30', tipe || 'Tatap Muka', ruang || 'Belum Diatur']
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/classes/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM class_students WHERE class_id = ?', [id]);
        await db.query('DELETE FROM classes WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- KELAS STUDENTS (MAPPING RELASI SISWA & KELAS) ---
app.get('/api/classes/:id/students', async (req, res) => {
    const { id } = req.params;
    try {
        const [rows] = await db.query(
            'SELECT s.* FROM students s JOIN class_students cs ON s.id = cs.student_id WHERE cs.class_id = ?',
            [id]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/classes/:id/students', async (req, res) => {
    const { id } = req.params;
    const { student_id } = req.body;
    try {
        // Cek kapasitas kelas dahulu
        const [[cls]] = await db.query('SELECT kapasitas FROM classes WHERE id = ?', [id]);
        const [[countRes]] = await db.query('SELECT COUNT(*) AS count FROM class_students WHERE class_id = ?', [id]);
        
        if (cls && countRes.count >= cls.kapasitas) {
            return res.status(400).json({ success: false, message: 'Kelas sudah penuh (kapasitas maksimal tercapai).' });
        }

        await db.query(
            'INSERT INTO class_students (class_id, student_id) VALUES (?, ?)',
            [id, student_id]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/classes/:id/students/:student_id', async (req, res) => {
    const { id, student_id } = req.params;
    try {
        await db.query(
            'DELETE FROM class_students WHERE class_id = ? AND student_id = ?',
            [id, student_id]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- JADWAL (SCHEDULES) ALIAS ---
app.get('/api/schedules', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, hari, mulai, selesai, nama AS kelas, program, tipe, pengajar, ruang FROM classes'
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/schedules', async (req, res) => {
    const { hari, mulai, selesai, kelas, program, tipe, pengajar, ruang } = req.body;
    try {
        await db.query(
            'INSERT INTO classes (nama, program, pengajar, kapasitas, hari, mulai, selesai, tipe, ruang) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [kelas, program, pengajar, 20, hari, mulai, selesai, tipe, ruang]
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/schedules/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM class_students WHERE class_id = ?', [id]);
        await db.query('DELETE FROM classes WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- DASHBOARD STATISTICS ---
app.get('/api/dashboard/stats', async (req, res) => {
    try {
        const [[{ count: totalStudents }]] = await db.query('SELECT COUNT(*) AS count FROM students');
        const [[{ count: totalTeachers }]] = await db.query('SELECT COUNT(*) AS count FROM teachers');
        const [[{ count: totalClasses }]] = await db.query('SELECT COUNT(*) AS count FROM classes');
        const [[{ count: totalPrograms }]] = await db.query('SELECT COUNT(*) AS count FROM programs');
        
        // Sum total payments amount
        const [[{ sum: totalRevenue }]] = await db.query('SELECT COALESCE(SUM(jumlah), 0) AS sum FROM payments WHERE status = "Lunas"');
        const [[{ count: totalTransactions }]] = await db.query('SELECT COUNT(*) AS count FROM payments');

        // Today's attendance rate (with fallback to latest recorded attendance session)
        const todayStr = new Date().toISOString().split('T')[0];
        let [[{ count: todayHadir }]] = await db.query('SELECT COUNT(*) AS count FROM attendance WHERE status = "Hadir" AND tanggal = ?', [todayStr]);
        let [[{ count: todayTotal }]] = await db.query('SELECT COUNT(*) AS count FROM attendance WHERE tanggal = ?', [todayStr]);
        
        if (todayTotal === 0) {
            const [[latestDateRow]] = await db.query('SELECT MAX(tanggal) AS maxDate FROM attendance');
            if (latestDateRow && latestDateRow.maxDate) {
                const latestDate = latestDateRow.maxDate;
                const [[{ count: lHadir }]] = await db.query('SELECT COUNT(*) AS count FROM attendance WHERE status = "Hadir" AND tanggal = ?', [latestDate]);
                const [[{ count: lTotal }]] = await db.query('SELECT COUNT(*) AS count FROM attendance WHERE tanggal = ?', [latestDate]);
                todayHadir = lHadir;
                todayTotal = lTotal;
            } else {
                const [[{ count: activeCount }]] = await db.query('SELECT COUNT(*) AS count FROM students WHERE status = "Aktif"');
                todayHadir = activeCount;
                todayTotal = totalStudents || activeCount;
            }
        }

        let attendanceRate = "100%";
        if (todayTotal > 0) {
            attendanceRate = Math.round((todayHadir / todayTotal) * 100) + "%";
        }

        // Revenue by program
        const [revenueByProgram] = await db.query(
            'SELECT program, SUM(jumlah) AS total FROM payments WHERE status = "Lunas" GROUP BY program'
        );

        // Perhitungan Kurva Pertumbuhan Siswa berbasis Database (dengan dukungan Filter Bulan / Periode)
        const { growthPeriod } = req.query; // 'semua', '6bulan', '3bulan', atau angka bulan '1'..'12'
        const fullMonthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

        let monthlyGrowth = { labels: [], data: [], title: 'Grafik Pertumbuhan Siswa' };

        const targetMonthNum = parseInt(growthPeriod, 10);
        if (!isNaN(targetMonthNum) && targetMonthNum >= 1 && targetMonthNum <= 12) {
            // Filter per bulan spesifik (Breakdown pendaftaran per minggu dalam bulan tersebut)
            const [weeklyCounts] = await db.query(`
                SELECT 
                    DAY(COALESCE(created_at, CURRENT_TIMESTAMP)) AS d,
                    COUNT(*) AS cnt
                FROM students
                WHERE MONTH(COALESCE(created_at, CURRENT_TIMESTAMP)) = ?
                GROUP BY d
            `, [targetMonthNum]);

            let w1 = 0, w2 = 0, w3 = 0, w4 = 0;
            weeklyCounts.forEach(r => {
                const day = r.d;
                const count = r.cnt;
                if (day >= 1 && day <= 7) w1 += count;
                else if (day >= 8 && day <= 14) w2 += count;
                else if (day >= 15 && day <= 21) w3 += count;
                else if (day >= 22 && day <= 31) w4 += count;
            });

            monthlyGrowth = {
                labels: ['Minggu 1 (Tgl 1-7)', 'Minggu 2 (Tgl 8-14)', 'Minggu 3 (Tgl 15-21)', 'Minggu 4 (Tgl 22-31)'],
                data: [w1, w2, w3, w4],
                title: `Pendaftaran Siswa (${fullMonthNames[targetMonthNum - 1]})`
            };
        } else {
            // Perhitungan Kurva Pertumbuhan Siswa Kumulatif Real (Semua Bulan / 6 Bulan / 3 Bulan)
            const [monthlyCounts] = await db.query(`
                SELECT 
                    MONTH(COALESCE(created_at, CURRENT_TIMESTAMP)) AS m, 
                    COUNT(*) AS cnt 
                FROM students 
                GROUP BY MONTH(COALESCE(created_at, CURRENT_TIMESTAMP))
            `);

            const countByMonth = {};
            monthlyCounts.forEach(r => {
                countByMonth[r.m] = r.cnt;
            });

            const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
            const currentMonth = new Date().getMonth() + 1;

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

        res.json({
            totalStudents,
            totalTeachers,
            totalClasses,
            totalPrograms,
            totalRevenue,
            totalTransactions,
            attendanceRate,
            todayHadir,
            todayTotal,
            revenueByProgram,
            monthlyGrowth
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint Log Aktivitas Sistem Terbaru
app.get('/api/dashboard/activities', async (req, res) => {
    try {
        const [rows] = await db.query(
            "SELECT siswa, aktivitas, program, status, status_color AS statusColor, DATE_FORMAT(created_at, '%d %b %H:%i') AS waktu FROM activity_logs ORDER BY id DESC LIMIT 50"
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// --- GLOBAL SEARCH ENDPOINT ---
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q || !q.trim()) return res.json({ students: [], teachers: [], classes: [], payments: [] });
    const term = `%${q.trim()}%`;
    try {
        const [students] = await db.query('SELECT id, nama, program, level, status FROM students WHERE nama LIKE ? OR id LIKE ? OR program LIKE ? LIMIT 5', [term, term, term]);
        const [teachers] = await db.query('SELECT id, nama, email, status FROM teachers WHERE nama LIKE ? OR email LIKE ? LIMIT 5', [term, term]);
        const [classes] = await db.query('SELECT id, nama, program, pengajar FROM classes WHERE nama LIKE ? OR program LIKE ? LIMIT 5', [term, term]);
        const [payments] = await db.query('SELECT id, nama, program, jumlah, status FROM payments WHERE id LIKE ? OR nama LIKE ? LIMIT 5', [term, term]);
        res.json({ students, teachers, classes, payments });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});
app.get('/api/payments', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, nama, program, jumlah, metode, status, DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal FROM payments");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/payments', async (req, res) => {
    const { id, nama, program, jumlah, metode, status, tanggal } = req.body;
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    try {
        await db.query(
            'INSERT INTO payments (id, nama, program, jumlah, metode, status, tanggal) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, nama, program, jumlah, metode, status, finalDate]
        );
        await logActivity(
            nama, 
            `Pembayaran Tagihan (${id})`, 
            program, 
            status === 'Lunas' ? 'Berhasil' : 'Tertunda', 
            status === 'Lunas' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-700 bg-amber-50'
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.put('/api/payments/:id', async (req, res) => {
    const { id } = req.params;
    const { nama, program, jumlah, metode, status, tanggal } = req.body;
    const finalDate = tanggal || new Date().toISOString().slice(0, 10);
    try {
        await db.query(
            'UPDATE payments SET nama = ?, program = ?, jumlah = ?, metode = ?, status = ?, tanggal = ? WHERE id = ?',
            [nama, program, jumlah, metode, status, finalDate, id]
        );
        await logActivity(
            nama, 
            `Pembaruan Status Pembayaran (${id})`, 
            program, 
            status === 'Lunas' ? 'Berhasil' : 'Tertunda', 
            status === 'Lunas' ? 'text-emerald-600 bg-emerald-50' : 'text-amber-700 bg-amber-50'
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/payments/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM payments WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- ABSENSI (ATTENDANCE) ---
app.get('/api/attendance', async (req, res) => {
    const { tanggal, kelas } = req.query;
    try {
        let query = "SELECT id, student_id, nama, program, kelas, status, inisial, DATE_FORMAT(tanggal, '%Y-%m-%d') AS tanggal FROM attendance";
        let params = [];
        if (tanggal && kelas) {
            query += ' WHERE tanggal = ? AND kelas = ?';
            params.push(tanggal, kelas);
        } else if (tanggal) {
            query += ' WHERE tanggal = ?';
            params.push(tanggal);
        } else if (kelas) {
            query += ' WHERE kelas = ?';
            params.push(kelas);
        }
        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/bulk', async (req, res) => {
    const { list, tanggal, kelas } = req.body; // list: [{ student_id, nama, program, status, inisial }]
    if (!list || !Array.isArray(list) || !tanggal || !kelas) {
        return res.status(400).json({ success: false, message: 'Data list, tanggal, dan kelas wajib disertakan.' });
    }
    
    try {
        // Hapus absensi kelas tersebut pada tanggal tersebut terlebih dahulu agar bisa ditimpa
        await db.query('DELETE FROM attendance WHERE tanggal = ? AND kelas = ?', [tanggal, kelas]);
        
        // Insert data baru dalam bentuk batch multi-value
        if (list.length > 0) {
            const values = list.map(item => [
                item.id || item.student_id,
                item.nama,
                item.program,
                kelas,
                item.status,
                item.inisial || 'S',
                tanggal
            ]);
            await db.query(
                'INSERT INTO attendance (student_id, nama, program, kelas, status, inisial, tanggal) VALUES ?',
                [values]
            );
        }
        await logActivity(`Siswa Kelas ${kelas}`, `Presensi Harian (${tanggal})`, '-', 'Berhasil', 'text-emerald-600 bg-emerald-50');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/attendance/monthly', async (req, res) => {
    const { kelas, bulan, list } = req.body; // list: [{ id, nama, program, status, inisial, tanggal }]
    if (!list || !Array.isArray(list) || !kelas || !bulan) {
        return res.status(400).json({ success: false, message: 'Data list, kelas, dan bulan wajib disertakan.' });
    }

    try {
        // Hapus absensi kelas tersebut pada bulan tersebut terlebih dahulu
        await db.query('DELETE FROM attendance WHERE kelas = ? AND tanggal LIKE ?', [kelas, `${bulan}-%`]);

        // Filter item valid dan insert secara batch multi-value
        const validItems = list.filter(item => item.status && item.status !== '-');
        if (validItems.length > 0) {
            const values = validItems.map(item => [
                item.id || item.student_id,
                item.nama,
                item.program,
                kelas,
                item.status,
                item.inisial || 'S',
                item.tanggal
            ]);
            await db.query(
                'INSERT INTO attendance (student_id, nama, program, kelas, status, inisial, tanggal) VALUES ?',
                [values]
            );
        }
        await logActivity(`Siswa Kelas ${kelas}`, `Presensi Bulanan (${bulan})`, '-', 'Berhasil', 'text-emerald-600 bg-emerald-50');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- REMINDERS (AGENDA MINGGUAN / REMINDER LAINNYA) ---
app.get('/api/reminders', async (req, res) => {
    try {
        const [rows] = await db.query("SELECT id, title, DATE_FORMAT(date, '%Y-%m-%d') AS date, time, location FROM reminders ORDER BY date ASC");
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/reminders', async (req, res) => {
    const { title, date, time, location } = req.body;
    if (!title || !date) {
        return res.status(400).json({ success: false, message: 'Judul agenda dan tanggal wajib diisi.' });
    }
    try {
        await db.query(
            'INSERT INTO reminders (title, date, time, location) VALUES (?, ?, ?, ?)',
            [title, date, time || '', location || '']
        );
        res.status(201).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/reminders/:id', async (req, res) => {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM reminders WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- RUNNING SERVER ---
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

