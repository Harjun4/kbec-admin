const assert = require('assert');
const { attendanceSchema } = require('../src/middlewares/validate.middleware');

console.log('🧪 Testing attendanceSchema Zod validation...');

// Test 1: Array of items payload (from submitAttendance)
const arrayPayload = [
    { student_id: 'STUD-001', nama: 'Budi', kelas: 'Bimbel SD', program: 'Reguler', tanggal: '2026-08-09', status: 'Hadir' },
    { student_id: 102, nama: 'Siti', kelas: 'Bimbel SD', program: 'Reguler', tanggal: '2026-08-09', status: 'Izin' },
    { student_id: 'STUD-003', nama: 'Andi', kelas: 'Bimbel SD', program: 'Reguler', tanggal: '2026-08-09', status: 'Alpha' },
    { student_id: 'STUD-004', nama: 'Dewi', kelas: 'Bimbel SD', program: 'Reguler', tanggal: '2026-08-09', status: '-' }
];

const parsedArray = attendanceSchema.safeParse(arrayPayload);
assert.strictEqual(parsedArray.success, true, `Array payload validation failed: ${JSON.stringify(parsedArray.error)}`);

// Test 2: Object wrapper payload with items array
const objectItemsPayload = {
    class_id: 1,
    tanggal: '2026-08-09',
    items: [
        { student_id: 'STUD-001', status: 'Hadir' },
        { student_id: 'STUD-002', status: 'Sakit' }
    ]
};

const parsedObjectItems = attendanceSchema.safeParse(objectItemsPayload);
assert.strictEqual(parsedObjectItems.success, true, `Object items payload validation failed: ${JSON.stringify(parsedObjectItems.error)}`);

// Test 3: Object wrapper payload with list array
const objectListPayload = {
    kelas: 'Bimbel SD',
    list: [
        { student_id: 'STUD-001', status: 'Kosong' },
        { student_id: 'STUD-002', status: 'Alfa' }
    ]
};

const parsedObjectList = attendanceSchema.safeParse(objectListPayload);
assert.strictEqual(parsedObjectList.success, true, `Object list payload validation failed: ${JSON.stringify(parsedObjectList.error)}`);

// Test 4: Invalid status value should fail
const invalidPayload = [
    { student_id: 'STUD-001', status: 'InvalidStatus' }
];

const parsedInvalid = attendanceSchema.safeParse(invalidPayload);
assert.strictEqual(parsedInvalid.success, false, 'Invalid status should fail validation');

console.log('✅ attendanceSchema validation tests passed successfully!');
