const assert = require('assert');
const { generateToken } = require('../src/middlewares/auth.middleware');
const teacherController = require('../src/controllers/teacher.controller');
const db = require('../src/config/db');

console.log('🧪 Testing Teacher Audit & Performance Monitoring Controller (Super Admin Only)...');

function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

async function runTests() {
    try {
        // =========================================================================
        // Test 1: RBAC - Non-Super Admin MUST be blocked (403 Forbidden)
        // =========================================================================
        console.log('Testing Test 1: Access Control - Role selain Super Admin harus ditolak (403)...');
        
        const reqAdminBiasa = {
            user: { id: 'ADM-001', name: 'Admin Keuangan', role: 'Admin' },
            query: {}
        };
        let resAdmin = createMockRes();
        let nextCalled = false;
        
        // We will test requireRole('Super Admin') middleware directly
        const { requireRole } = require('../src/middlewares/auth.middleware');
        const superAdminOnlyGuard = requireRole('Super Admin');
        
        superAdminOnlyGuard(reqAdminBiasa, resAdmin, () => { nextCalled = true; });
        assert.strictEqual(resAdmin.statusCode, 403, 'Admin biasa harus ditolak 403');
        assert.strictEqual(resAdmin.body.success, false);
        assert.strictEqual(nextCalled, false, 'Next tidak boleh dipanggil untuk Admin biasa');
        console.log('✅ Test 1.1 Passed: Admin biasa berhasil diblokir (403).');

        const reqStaff = {
            user: { id: 'STF-001', name: 'Staff Akademik', role: 'Staff' },
            query: {}
        };
        let resStaff = createMockRes();
        nextCalled = false;
        superAdminOnlyGuard(reqStaff, resStaff, () => { nextCalled = true; });
        assert.strictEqual(resStaff.statusCode, 403, 'Staff harus ditolak 403');
        console.log('✅ Test 1.2 Passed: Staff berhasil diblokir (403).');

        const reqPengajar = {
            user: { id: 'TCH-001', name: 'Ms. Sarah', role: 'Pengajar' },
            query: {}
        };
        let resPengajar = createMockRes();
        nextCalled = false;
        superAdminOnlyGuard(reqPengajar, resPengajar, () => { nextCalled = true; });
        assert.strictEqual(resPengajar.statusCode, 403, 'Pengajar harus ditolak 403');
        console.log('✅ Test 1.3 Passed: Pengajar berhasil diblokir (403).');

        const reqSuperAdmin = {
            user: { id: 'SA-001', name: 'Super Administrator', role: 'Super Admin' },
            query: {}
        };
        let resSuperAdmin = createMockRes();
        nextCalled = false;
        superAdminOnlyGuard(reqSuperAdmin, resSuperAdmin, () => { nextCalled = true; });
        assert.strictEqual(nextCalled, true, 'Super Admin harus lolos middleware (next dipanggil)');
        console.log('✅ Test 1.4 Passed: Super Admin berhasil lolos middleware otorisasi.');

        // =========================================================================
        // Test 2: Punctuality calculation logic with 10-15 minute tolerance
        // =========================================================================
        console.log('\nTesting Test 2: Logika Ketepatan Waktu dengan Toleransi 10-15 Menit...');
        const { calculatePunctuality } = require('../src/controllers/teacher.controller');
        
        assert(typeof calculatePunctuality === 'function', 'calculatePunctuality harus berupa fungsi');

        // Kasus A: Mulai 08:00, Check-in 08:05 (Telat 5 menit -> Tepat Waktu)
        const onTimeRes = calculatePunctuality('08:00', '08:05');
        assert.strictEqual(onTimeRes.is_late, false);
        assert.strictEqual(onTimeRes.badge, 'green');
        assert.strictEqual(onTimeRes.status, 'Tepat Waktu');

        // Kasus B: Mulai 08:00, Check-in 08:10 (Telat 10 menit -> Tepat Waktu / Batas Maksimum Toleransi Aman)
        const exact10Res = calculatePunctuality('08:00', '08:10');
        assert.strictEqual(exact10Res.is_late, false);
        assert.strictEqual(exact10Res.badge, 'green');

        // Kasus C: Mulai 08:00, Check-in 08:14 (Telat 14 menit -> Toleransi Kuning)
        const toleranceRes = calculatePunctuality('08:00', '08:14');
        assert.strictEqual(toleranceRes.is_late, false);
        assert.strictEqual(toleranceRes.badge, 'amber');
        assert.ok(toleranceRes.status.includes('Toleransi'), 'Harus berstatus Toleransi');

        // Kasus D: Mulai 08:00, Check-in 08:25 (Telat 25 menit -> Terlambat Merah)
        const lateRes = calculatePunctuality('08:00', '08:25');
        assert.strictEqual(lateRes.is_late, true);
        assert.strictEqual(lateRes.badge, 'rose');
        assert.strictEqual(lateRes.late_minutes, 25);
        assert.ok(lateRes.status.includes('Telat 25 Menit'), 'Pesan harus menunjukkan Telat 25 Menit');
        console.log('✅ Test 2 Passed: Seluruh skenario ketepatan waktu & toleransi 10-15 menit akurat!');

        // =========================================================================
        // Test 3: Problematic Student (Siswa Bermasalah) Detection Engine
        // =========================================================================
        console.log('\nTesting Test 3: Deteksi Siswa Bermasalah (Jarang Masuk / Alpha >= 3)...');
        const { evaluateProblematicStudents } = require('../src/controllers/teacher.controller');
        assert(typeof evaluateProblematicStudents === 'function', 'evaluateProblematicStudents harus berupa fungsi');

        const mockStudentAttendanceRecords = [
            // Siswa A: Rajin masuk (4 Hadir, 0 Alpha)
            { student_id: 'S001', nama: 'Budi Santoso', status: 'Hadir', kelas: 'Beginner 1' },
            { student_id: 'S001', nama: 'Budi Santoso', status: 'Hadir', kelas: 'Beginner 1' },
            { student_id: 'S001', nama: 'Budi Santoso', status: 'Hadir', kelas: 'Beginner 1' },
            { student_id: 'S001', nama: 'Budi Santoso', status: 'Hadir', kelas: 'Beginner 1' },

            // Siswa B: Bermasalah (3 Alpha -> Jarang masuk)
            { student_id: 'S002', nama: 'Doni Pratama', status: 'Alpha', kelas: 'Beginner 1' },
            { student_id: 'S002', nama: 'Doni Pratama', status: 'Alpha', kelas: 'Beginner 1' },
            { student_id: 'S002', nama: 'Doni Pratama', status: 'Alpha', kelas: 'Beginner 1' },
            { student_id: 'S002', nama: 'Doni Pratama', status: 'Hadir', kelas: 'Beginner 1' },

            // Siswa C: Kehadiran rendah (1 Hadir, 3 Izin, 1 Alpha -> Kehadiran 20%)
            { student_id: 'S003', nama: 'Citra Dewi', status: 'Izin', kelas: 'Beginner 1' },
            { student_id: 'S003', nama: 'Citra Dewi', status: 'Izin', kelas: 'Beginner 1' },
            { student_id: 'S003', nama: 'Citra Dewi', status: 'Izin', kelas: 'Beginner 1' },
            { student_id: 'S003', nama: 'Citra Dewi', status: 'Alpha', kelas: 'Beginner 1' },
            { student_id: 'S003', nama: 'Citra Dewi', status: 'Hadir', kelas: 'Beginner 1' }
        ];

        const problematicList = evaluateProblematicStudents(mockStudentAttendanceRecords);
        assert(Array.isArray(problematicList), 'Hasil evaluasi harus berupa array');
        assert.strictEqual(problematicList.length, 2, 'Harus mendeteksi tepat 2 siswa bermasalah (Doni & Citra)');

        const doni = problematicList.find(s => s.student_id === 'S002');
        assert.ok(doni, 'Doni harus terdeteksi');
        assert.strictEqual(doni.is_problematic, true);
        assert.strictEqual(doni.alpha_count, 3);
        assert.ok(doni.reason.includes('Alpha'), 'Alasan harus menyebutkan Alpha');

        const citra = problematicList.find(s => s.student_id === 'S003');
        assert.ok(citra, 'Citra harus terdeteksi');
        assert.strictEqual(citra.is_problematic, true);
        assert.ok(citra.attendance_rate < 75, 'Tingkat kehadiran harus < 75%');
        assert.ok(citra.reason.includes('1 dari 5'), 'Alasan harus menyertakan rasio kehadiran (1 dari 5)');
        console.log('✅ Test 3 Passed: Deteksi Siswa Bermasalah berhasil dengan filter akurat & rasio kehadiran!');

        // =========================================================================
        // Test 3.5: Deteksi Jadwal Kelas KBEC (Serial 1, Serial 2, Senin-Jumat)
        // =========================================================================
        console.log('\nTesting Test 3.5: Verifikasi isClassScheduledOnDay (Serial 1, Serial 2, dsb)...');
        const { isClassScheduledOnDay } = require('../src/controllers/teacher.controller');
        assert(typeof isClassScheduledOnDay === 'function', 'isClassScheduledOnDay harus diekspor');

        // Serial 1: Senin(1), Rabu(3), Jumat(5)
        assert.strictEqual(isClassScheduledOnDay('Serial 1', '2026-10-16'), true, 'Serial 1 harus aktif di hari Jumat (2026-10-16)');
        assert.strictEqual(isClassScheduledOnDay('Serial 1', 1), true, 'Serial 1 harus aktif di hari Senin');
        assert.strictEqual(isClassScheduledOnDay('Serial 1', 3), true, 'Serial 1 harus aktif di hari Rabu');
        assert.strictEqual(isClassScheduledOnDay('Serial 1', 2), false, 'Serial 1 tidak aktif di hari Selasa');
        assert.strictEqual(isClassScheduledOnDay('Serial 1', 4), false, 'Serial 1 tidak aktif di hari Kamis');

        // Serial 2: Selasa(2), Kamis(4), Sabtu(6)
        assert.strictEqual(isClassScheduledOnDay('Serial 2', 2), true, 'Serial 2 harus aktif di hari Selasa');
        assert.strictEqual(isClassScheduledOnDay('Serial 2', 4), true, 'Serial 2 harus aktif di hari Kamis');
        assert.strictEqual(isClassScheduledOnDay('Serial 2', 6), true, 'Serial 2 harus aktif di hari Sabtu');
        assert.strictEqual(isClassScheduledOnDay('Serial 2', 5), false, 'Serial 2 tidak aktif di hari Jumat');

        // Rentang Hari
        assert.strictEqual(isClassScheduledOnDay('Senin - Jumat', 5), true, 'Senin - Jumat aktif di hari Jumat');
        assert.strictEqual(isClassScheduledOnDay('Senin - Jumat', 0), false, 'Senin - Jumat tidak aktif di hari Minggu');
        console.log('✅ Test 3.5 Passed: Algoritma decoding jadwal Serial 1 & Serial 2 100% tepat!');

        // =========================================================================
        // Test 4: Controller getTeacherAuditMonitoring integration test
        // =========================================================================
        console.log('\nTesting Test 4: Endpoint Controller getTeacherAuditMonitoring langsung...');
        const reqAudit = {
            user: { id: 'SA-001', name: 'Super Admin', role: 'Super Admin' },
            query: { date: '2026-10-16' }
        };
        const resAudit = createMockRes();
        await teacherController.getTeacherAuditMonitoring(reqAudit, resAudit, (err) => {
            if (err) throw err;
        });

        assert.strictEqual(resAudit.statusCode, 200);
        assert.strictEqual(resAudit.body.success, true);
        assert.ok(resAudit.body.summary, 'Harus memiliki summary statistik');
        assert.ok(Array.isArray(resAudit.body.teachers), 'Harus memiliki list pengajar');
        assert.ok(resAudit.body.summary.total_classes_scheduled > 0, `Jadwal hari ini harus terdeteksi > 0 (Ditemukan: ${resAudit.body.summary.total_classes_scheduled})`);
        assert.ok(resAudit.body.summary.total_problematic_students > 0, `Siswa bermasalah harus terdeteksi (Ditemukan: ${resAudit.body.summary.total_problematic_students})`);
        console.log(`✅ Test 4 Passed: Controller berhasil merangkum data monitoring (${resAudit.body.teachers.length} guru dievaluasi, ${resAudit.body.summary.total_classes_scheduled} kelas terjadwal hari ini, ${resAudit.body.summary.total_problematic_students} siswa bermasalah terdeteksi).`);

        // =========================================================================
        // Test 5: Route Guard Configuration Check
        // =========================================================================
        console.log('\nTesting Test 5: Verifikasi Route Guard RBAC audit-kinerja-pengajar.html...');
        const fs = require('fs');
        const routeGuardCode = fs.readFileSync('public/js/route-guard.js', 'utf8');
        
        assert.ok(
            routeGuardCode.includes('audit-kinerja-pengajar.html'),
            'route-guard.js harus menyertakan audit-kinerja-pengajar.html'
        );
        console.log('✅ Test 5 Passed: Proteksi route guard terpasang.');

        console.log('\n🎉 SEMUA PENGUJIAN AUDIT KINERJA PENGAJAR LULUS 100%!');
        process.exit(0);
    } catch (err) {
        console.error('❌ Gagal pengujian:', err);
        process.exit(1);
    }
}

runTests();
