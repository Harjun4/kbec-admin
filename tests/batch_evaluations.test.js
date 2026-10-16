const assert = require('assert');
const attendanceController = require('../src/controllers/attendance.controller');
const db = require('../src/config/db');

console.log('🧪 Testing Batch Student Evaluations (SB/WB) Controller & Endpoints...');

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

async function runBatchTests() {
    // 0. Ensure we have a sample class & test students
    const [[sampleClass]] = await db.query('SELECT * FROM classes ORDER BY id ASC LIMIT 1');
    const classId = sampleClass ? sampleClass.id : 1;
    const className = sampleClass ? sampleClass.nama : 'Elementary 1B';

    // Pick 2 existing students from students table to satisfy foreign key fk_attendance_student
    let [students] = await db.query('SELECT id, nama FROM students LIMIT 2');
    let testStudentId1, testStudentId2, stdName1, stdName2;

    if (students.length >= 2) {
        testStudentId1 = students[0].id;
        testStudentId2 = students[1].id;
        stdName1 = students[0].nama;
        stdName2 = students[1].nama;
    } else {
        testStudentId1 = '9999000001';
        testStudentId2 = '9999000002';
        stdName1 = 'Test Siswa Satu';
        stdName2 = 'Test Siswa Dua';
        await db.query("INSERT INTO students (id, nama, status) VALUES (?, ?, 'Aktif'), (?, ?, 'Aktif') ON CONFLICT (id) DO NOTHING", [testStudentId1, stdName1, testStudentId2, stdName2]);
    }

    const testDate = '2026-10-15';
    const testPastDate = '2026-10-10';

    // Cleanup previous test evaluations for testDate and testPastDate
    await db.query('DELETE FROM student_grades WHERE student_id IN (?, ?) AND tanggal::text IN (?, ?)', [testStudentId1, testStudentId2, testDate, testPastDate]);
    await db.query('DELETE FROM attendance WHERE student_id IN (?, ?) AND tanggal::text IN (?, ?)', [testStudentId1, testStudentId2, testDate, testPastDate]);

    // Insert past session to test last_session helper
    await db.query(
        'INSERT INTO student_grades (student_id, student_name, nama_panggilan, class_id, class_name, grade, lesson, tanggal, presensi, sb_page, wb_page) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [testStudentId1, stdName1, 'Satu', classId, className, 'Elementary 1A', 'Lesson Past', testPastDate, 'Hadir', '53', '50']
    );

    const superAdminUser = {
        id: 'ADMIN-01',
        name: 'Super Admin',
        role: 'Super Admin'
    };

    // TEST 1: saveBatchStudentGrades with empty array should return 400
    console.log('Testing Test 1: saveBatchStudentGrades validation on empty evaluations...');
    const reqEmpty = {
        user: superAdminUser,
        body: { class_id: classId, class_name: className, session_date: testDate, evaluations: [] }
    };
    const resEmpty = createMockRes();
    await attendanceController.saveBatchStudentGrades(reqEmpty, resEmpty, (err) => { throw err; });
    assert.strictEqual(resEmpty.statusCode, 400, 'Empty evaluations must return status 400');
    console.log('✅ Test 1 Passed: Empty evaluations returns 400.');

    // TEST 2: saveBatchStudentGrades with 2 students
    console.log('Testing Test 2: saveBatchStudentGrades saving batch evaluations...');
    const reqBatch = {
        user: superAdminUser,
        body: {
            class_id: classId,
            class_name: className,
            session_date: testDate,
            evaluations: [
                {
                    student_id: testStudentId1,
                    student_name: stdName1,
                    nama_panggilan: 'Satu',
                    grade: 'Elementary 1A',
                    presence: 'Hadir',
                    sb: '54',
                    wb: '51',
                    lesson: 'Speaking Lesson 4',
                    additional_material: 'Bagus dan lancar membaca'
                },
                {
                    student_id: testStudentId2,
                    student_name: stdName2,
                    nama_panggilan: 'Dua',
                    grade: 'Elementary 1B',
                    presence: 'Izin',
                    sb: '',
                    wb: '',
                    lesson: 'Speaking Lesson 4',
                    additional_material: 'Izin acara keluarga'
                }
            ]
        }
    };
    const resBatch = createMockRes();
    await attendanceController.saveBatchStudentGrades(reqBatch, resBatch, (err) => { throw err; });
    assert.strictEqual(resBatch.statusCode, 200, 'Batch save must return 200');
    assert.strictEqual(resBatch.body.success, true, 'Batch save success must be true');
    assert.strictEqual(resBatch.body.count, 2, 'Batch save count must be 2');

    // Verify in database: student_grades
    const [savedGrades] = await db.query('SELECT * FROM student_grades WHERE student_id IN (?, ?) AND tanggal::text = ? ORDER BY student_id ASC', [testStudentId1, testStudentId2, testDate]);
    assert.strictEqual(savedGrades.length, 2, 'Must have 2 records in student_grades for testDate');
    assert.strictEqual(savedGrades[0].sb_page, '54');
    assert.strictEqual(savedGrades[0].wb_page, '51');
    assert.strictEqual(savedGrades[1].presensi, 'Izin');

    // Verify in database: attendance synchronization
    const [savedAtt] = await db.query('SELECT * FROM attendance WHERE student_id IN (?, ?) AND tanggal::text = ? ORDER BY student_id ASC', [testStudentId1, testStudentId2, testDate]);
    assert.strictEqual(savedAtt.length, 2, 'Must have synchronized 2 records into attendance');
    assert.strictEqual(savedAtt[0].status, 'Hadir');
    assert.strictEqual(savedAtt[1].status, 'Izin');
    console.log('✅ Test 2 Passed: Batch save inserted into student_grades and synced attendance.');

    // TEST 3: Teacher access control check
    console.log('Testing Test 3: Teacher access control on saveBatchStudentGrades...');
    const unauthorizedTeacherUser = {
        id: 'T-UNAUTH-999',
        teacher_id: 'KBEC-T9999',
        name: 'Teacher Without Access',
        role: 'Pengajar'
    };
    const reqUnauth = {
        user: unauthorizedTeacherUser,
        body: {
            class_id: classId,
            class_name: className,
            session_date: testDate,
            evaluations: [
                { student_id: testStudentId1, presence: 'Hadir', sb: '55', wb: '52' }
            ]
        }
    };
    const resUnauth = createMockRes();
    await attendanceController.saveBatchStudentGrades(reqUnauth, resUnauth, (err) => { throw err; });
    assert.strictEqual(resUnauth.statusCode, 403, 'Unauthorized teacher must receive 403 Forbidden');
    console.log('✅ Test 3 Passed: Unauthorized teacher blocked with 403.');

    // TEST 4: getSessionEvaluations check
    console.log('Testing Test 4: getSessionEvaluations retrieval...');
    const reqGetSession = {
        user: superAdminUser,
        query: { class_id: classId, tanggal: testDate }
    };
    const resGetSession = createMockRes();
    await attendanceController.getSessionEvaluations(reqGetSession, resGetSession, (err) => { throw err; });
    assert.strictEqual(resGetSession.statusCode, 200, 'getSessionEvaluations must return 200');
    assert.strictEqual(resGetSession.body.success, true, 'success must be true');
    assert(Array.isArray(resGetSession.body.students), 'students must be an array');
    console.log(`✅ Test 4 Passed: getSessionEvaluations returned ${resGetSession.body.students.length} students.`);

    // Cleanup
    await db.query('DELETE FROM student_grades WHERE student_id IN (?, ?)', [testStudentId1, testStudentId2]);
    await db.query('DELETE FROM attendance WHERE student_id IN (?, ?)', [testStudentId1, testStudentId2]);
    console.log('🧹 Cleaned up test data.');
    console.log('🎉 ALL BATCH EVALUATION BACKEND TESTS PASSED 100%!');
}

runBatchTests()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('❌ Batch tests failed:', err);
        process.exit(1);
    });
