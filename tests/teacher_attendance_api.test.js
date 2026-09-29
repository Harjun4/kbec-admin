const assert = require('assert');
const { generateToken } = require('../src/middlewares/auth.middleware');
const teacherController = require('../src/controllers/teacher.controller');

console.log('🧪 Testing Teacher Attendance API Controller directly...');

// Mock res helper
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

async function runApiTests() {
    // 1. Test checkinTeacher as Teacher (Check-in Harian)
    const reqTeacherCheckin = {
        user: {
            id: 'USER-T001',
            teacher_id: 'KBEC-T001',
            name: 'Ms. Sarah Johnson',
            role: 'Pengajar'
        },
        body: {
            attendance_type: 'checkin_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockphoto123',
            notes: 'Masuk tepat waktu'
        }
    };

    let res = createMockRes();
    await teacherController.checkinTeacher(reqTeacherCheckin, res, (err) => {
        if (err) throw err;
    });

    assert.strictEqual(res.statusCode, 200, 'Checkin should return 200');
    assert.strictEqual(res.body.success, true, 'Checkin should be success: true');
    assert.strictEqual(res.body.attendance_type, 'checkin_harian');
    console.log('✅ Check-in harian test passed:', res.body.message);

    // 2. Test checkinTeacher as Teacher (Sesi Mengajar)
    const reqTeachingSession = {
        user: {
            id: 'USER-T001',
            teacher_id: 'KBEC-T001',
            name: 'Ms. Sarah Johnson',
            role: 'Pengajar'
        },
        body: {
            attendance_type: 'sesi_mengajar',
            class_id: 1,
            class_name: 'Kelas Bahasa Inggris Dasar',
            topic_material: 'Simple Present Tense & Grammar Drills',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mocksessionphoto',
            notes: 'Semua siswa antusias mengikuti materi'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqTeachingSession, res, (err) => {
        if (err) throw err;
    });

    assert.strictEqual(res.statusCode, 200, 'Teaching session should return 200');
    assert.strictEqual(res.body.success, true, 'Teaching session should be success: true');
    assert.strictEqual(res.body.attendance_type, 'sesi_mengajar');
    console.log('✅ Sesi mengajar test passed:', res.body.message);

    // 2b. Test checkinTeacher FAILS when GPS is missing or 0 for offline presence
    const reqNoGps = {
        user: {
            id: 'USER-T001',
            teacher_id: 'KBEC-T001',
            name: 'Ms. Sarah Johnson',
            role: 'Pengajar'
        },
        body: {
            attendance_type: 'checkin_harian',
            lat: null,
            lng: null,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockphoto123',
            notes: 'Mencoba absen tanpa GPS'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqNoGps, res, (err) => {
        if (err) throw err;
    });

    assert.strictEqual(res.statusCode, 400, 'Checkin without GPS must return 400');
    assert.strictEqual(res.body.success, false, 'Checkin without GPS must have success: false');
    console.log('✅ Check-in rejection without GPS passed:', res.body.message);

    // 3. Test getCheckinLogs as Super Admin
    const reqAdminLogs = {
        user: {
            id: 'USER-ADMIN',
            role: 'Super Admin',
            name: 'Admin Utama'
        },
        query: {
            limit: 10
        }
    };

    res = createMockRes();
    await teacherController.getCheckinLogs(reqAdminLogs, res, (err) => {
        if (err) throw err;
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body), 'Logs must be an array');
    assert.ok(res.body.length > 0, 'Logs must contain at least 1 record');
    const latest = res.body[0];
    assert.ok(latest.teacher_name, 'Log must contain teacher_name');
    assert.ok(latest.waktu, 'Log must contain formatted waktu');
    console.log(`✅ Get logs test passed (${res.body.length} records retrieved)`);

    // 4. Test getAttendanceSummary
    const reqSummary = {
        user: {
            id: 'USER-ADMIN',
            role: 'Super Admin',
            name: 'Admin Utama'
        }
    };

    res = createMockRes();
    await teacherController.getAttendanceSummary(reqSummary, res, (err) => {
        if (err) throw err;
    });

    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.today_checkins !== undefined, 'Summary must have today_checkins');
    assert.ok(res.body.today_sessions !== undefined, 'Summary must have today_sessions');
    console.log('✅ Get attendance summary test passed:', JSON.stringify(res.body));

    // Clean up test records
    const db = require('../src/config/db');
    await db.query("DELETE FROM teacher_checkins WHERE teacher_id = 'KBEC-T001' AND (notes LIKE '%tepat waktu%' OR notes LIKE '%antusias%')");
    console.log('🧹 Cleaned up test attendance records.');

    console.log('🎉 ALL TEACHER ATTENDANCE CONTROLLER TESTS PASSED SUCCESSFULLY!');
    process.exit(0);
}

runApiTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
