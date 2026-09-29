const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing route-guard & performance report role permissions...');

const routeGuardContent = fs.readFileSync(path.join(__dirname, '../public/js/route-guard.js'), 'utf8');
const globalUserContent = fs.readFileSync(path.join(__dirname, '../public/global-user.js'), 'utf8');
const uiGuardContent = fs.readFileSync(path.join(__dirname, '../public/js/ui-guard.js'), 'utf8');

// 1. Ensure role permissions exist in route-guard.js
assert.ok(routeGuardContent.includes("rekap-kehadiran.html"), 'rekap-kehadiran.html must be present in route-guard.js');
assert.ok(routeGuardContent.includes("absensi-pengajar.html"), 'absensi-pengajar.html must be present in route-guard.js');
assert.ok(routeGuardContent.includes("'Staff':"), 'Staff must be defined in route-guard.js permissions');
assert.ok(routeGuardContent.includes("'Pengajar':"), 'Pengajar must be defined in route-guard.js permissions');

// 2. Ensure Laporan Kinerja Siswa in global-user.js sidebar is not restricted by isSuperAdmin
assert.ok(!globalUserContent.includes("${isSuperAdmin ? `<a href=\"laporan.html?type=kinerja#kinerja\""), 'Laporan Kinerja link in sidebar must not be restricted by isSuperAdmin');

// 3. Ensure ui-guard.js does not suppress kinerja tab for Admin in laporan.html
assert.ok(!uiGuardContent.includes("txt.includes('kinerja siswa')"), 'ui-guard.js must not suppress kinerja tab for Admin');

// 4. Test RBAC matrix in auth middleware
const { requireRole } = require('../src/middlewares/auth.middleware');

const reqSuperAdmin = { user: { role: 'Super Admin' } };
const reqAdmin = { user: { role: 'Admin' } };
const reqStaff = { user: { role: 'Staff' } };
const reqPengajar = { user: { role: 'Pengajar' } };

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

// A. Test Keuangan Endpoint: requireRole('Super Admin', 'Admin')
const financeMiddleware = requireRole('Super Admin', 'Admin');
let saCalled = false, admCalled = false, stfCalled = false, tchCalled = false;
let resMock = createMockRes();

financeMiddleware(reqSuperAdmin, resMock, () => { saCalled = true; });
financeMiddleware(reqAdmin, resMock, () => { admCalled = true; });
financeMiddleware(reqStaff, resMock, () => { stfCalled = true; });
assert.strictEqual(resMock.statusCode, 403, 'Staff must be forbidden from finance');

resMock = createMockRes();
financeMiddleware(reqPengajar, resMock, () => { tchCalled = true; });
assert.strictEqual(resMock.statusCode, 403, 'Pengajar must be forbidden from finance');

assert.strictEqual(saCalled, true, 'Super Admin must access finance');
assert.strictEqual(admCalled, true, 'Admin must access finance');
assert.strictEqual(stfCalled, false, 'Staff must NOT access finance');
assert.strictEqual(tchCalled, false, 'Pengajar must NOT access finance');

// B. Test Akademik Guru/Kelas Endpoint: requireRole('Super Admin', 'Staff')
const academicStaffMiddleware = requireRole('Super Admin', 'Staff');
saCalled = false; admCalled = false; stfCalled = false; tchCalled = false;
resMock = createMockRes();

academicStaffMiddleware(reqSuperAdmin, resMock, () => { saCalled = true; });
academicStaffMiddleware(reqStaff, resMock, () => { stfCalled = true; });
academicStaffMiddleware(reqAdmin, resMock, () => { admCalled = true; });
assert.strictEqual(resMock.statusCode, 403, 'Admin must be forbidden from academic teacher/class management');

resMock = createMockRes();
academicStaffMiddleware(reqPengajar, resMock, () => { tchCalled = true; });
assert.strictEqual(resMock.statusCode, 403, 'Pengajar must be forbidden from teacher/class management');

assert.strictEqual(saCalled, true, 'Super Admin must access teacher/class management');
assert.strictEqual(stfCalled, true, 'Staff must access teacher/class management');
assert.strictEqual(admCalled, false, 'Admin must NOT access teacher/class management');
assert.strictEqual(tchCalled, false, 'Pengajar must NOT access teacher/class management');

// C. Test Siswa Endpoint: requireRole('Super Admin', 'Admin', 'Staff')
const studentMiddleware = requireRole('Super Admin', 'Admin', 'Staff');
saCalled = false; admCalled = false; stfCalled = false; tchCalled = false;
resMock = createMockRes();

studentMiddleware(reqSuperAdmin, resMock, () => { saCalled = true; });
studentMiddleware(reqAdmin, resMock, () => { admCalled = true; });
studentMiddleware(reqStaff, resMock, () => { stfCalled = true; });
studentMiddleware(reqPengajar, resMock, () => { tchCalled = true; });

assert.strictEqual(saCalled, true, 'Super Admin must access student data');
assert.strictEqual(admCalled, true, 'Admin must access student data');
assert.strictEqual(stfCalled, true, 'Staff must access student data');
assert.strictEqual(tchCalled, false, 'Pengajar must NOT access general student data');
assert.strictEqual(resMock.statusCode, 403, 'Pengajar must be forbidden from general student data');

// D. Test Presensi/Nilai Input: requireRole('Super Admin', 'Pengajar')
const attendanceInputMiddleware = requireRole('Super Admin', 'Pengajar');
saCalled = false; admCalled = false; stfCalled = false; tchCalled = false;
resMock = createMockRes();

attendanceInputMiddleware(reqSuperAdmin, resMock, () => { saCalled = true; });
attendanceInputMiddleware(reqPengajar, resMock, () => { tchCalled = true; });
attendanceInputMiddleware(reqAdmin, resMock, () => { admCalled = true; });
assert.strictEqual(resMock.statusCode, 403, 'Admin must be forbidden from attendance/grade input');

resMock = createMockRes();
attendanceInputMiddleware(reqStaff, resMock, () => { stfCalled = true; });
assert.strictEqual(resMock.statusCode, 403, 'Staff must be forbidden from attendance/grade input');

assert.strictEqual(saCalled, true, 'Super Admin must access attendance/grade input');
assert.strictEqual(tchCalled, true, 'Pengajar must access attendance/grade input');
assert.strictEqual(admCalled, false, 'Admin must NOT access attendance/grade input');
assert.strictEqual(stfCalled, false, 'Staff must NOT access attendance/grade input');

// E. Test Laporan Kinerja Endpoint: requireRole('Super Admin', 'Admin', 'Staff', 'Pengajar')
const performanceReportMiddleware = requireRole('Super Admin', 'Admin', 'Staff', 'Pengajar');
saCalled = false; admCalled = false; stfCalled = false; tchCalled = false;

performanceReportMiddleware(reqSuperAdmin, resMock, () => { saCalled = true; });
performanceReportMiddleware(reqAdmin, resMock, () => { admCalled = true; });
performanceReportMiddleware(reqStaff, resMock, () => { stfCalled = true; });
performanceReportMiddleware(reqPengajar, resMock, () => { tchCalled = true; });

assert.strictEqual(saCalled, true, 'Super Admin must access performance report');
assert.strictEqual(admCalled, true, 'Admin must access performance report');
assert.strictEqual(stfCalled, true, 'Staff must access performance report');
assert.strictEqual(tchCalled, true, 'Pengajar must access performance report');

console.log('✅ All 4-role RBAC permissions, route guard & sidebar tests passed successfully!');
