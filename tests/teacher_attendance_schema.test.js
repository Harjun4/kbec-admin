const assert = require('assert');
const { teacherAttendanceSchema } = require('../src/middlewares/validate.middleware');

console.log('🧪 Testing teacherAttendanceSchema Zod validation...');

// Test 1: Valid checkin_harian payload
const checkinPayload = {
    attendance_type: 'checkin_harian',
    lat: -7.8123,
    lng: 112.0123,
    is_online: 0,
    proof_image: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ...'
};

const parsedCheckin = teacherAttendanceSchema.safeParse(checkinPayload);
assert.strictEqual(parsedCheckin.success, true, `Checkin validation failed: ${JSON.stringify(parsedCheckin.error)}`);
assert.strictEqual(parsedCheckin.data.attendance_type, 'checkin_harian');

// Test 2: Valid sesi_mengajar payload
const sessionPayload = {
    attendance_type: 'sesi_mengajar',
    class_id: 10,
    class_name: 'IELTS Prep Level 1',
    topic_material: 'Speaking Section Part 2 Cue Cards',
    notes: 'Siswa aktif berpartisipasi',
    lat: '-7.8125',
    lng: '112.0120',
    is_online: false,
    proof_image: 'data:image/jpeg;base64,abc123xyz'
};

const parsedSession = teacherAttendanceSchema.safeParse(sessionPayload);
assert.strictEqual(parsedSession.success, true, `Session validation failed: ${JSON.stringify(parsedSession.error)}`);
assert.strictEqual(parsedSession.data.class_name, 'IELTS Prep Level 1');

// Test 3: Valid izin payload
const izinPayload = {
    attendance_type: 'izin',
    notes: 'Menghadiri wisuda keluarga',
    proof_image: 'data:image/jpeg;base64,suratizin'
};

const parsedIzin = teacherAttendanceSchema.safeParse(izinPayload);
assert.strictEqual(parsedIzin.success, true, `Izin validation failed: ${JSON.stringify(parsedIzin.error)}`);

// Test 4: Invalid attendance_type should fail
const invalidPayload = {
    attendance_type: 'invalid_type_abc'
};

const parsedInvalid = teacherAttendanceSchema.safeParse(invalidPayload);
assert.strictEqual(parsedInvalid.success, false, 'Invalid attendance_type must fail validation');

console.log('✅ teacherAttendanceSchema validation tests passed successfully!');
