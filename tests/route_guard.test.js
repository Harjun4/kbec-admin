const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing route-guard & performance report role permissions...');

const routeGuardContent = fs.readFileSync(path.join(__dirname, '../public/js/route-guard.js'), 'utf8');
const globalUserContent = fs.readFileSync(path.join(__dirname, '../public/global-user.js'), 'utf8');
const uiGuardContent = fs.readFileSync(path.join(__dirname, '../public/js/ui-guard.js'), 'utf8');

// 1. Ensure rekap-kehadiran.html is in Admin permissions in route-guard.js
assert.ok(routeGuardContent.includes("rekap-kehadiran.html"), 'rekap-kehadiran.html must be present in route-guard.js');

// 2. Ensure Laporan Kinerja Siswa in global-user.js sidebar is not restricted by isSuperAdmin
assert.ok(!globalUserContent.includes("${isSuperAdmin ? `<a href=\"laporan.html?type=kinerja#kinerja\""), 'Laporan Kinerja link in sidebar must not be restricted by isSuperAdmin');

// 3. Ensure ui-guard.js does not suppress kinerja tab for Admin in laporan.html
assert.ok(!uiGuardContent.includes("txt.includes('kinerja siswa')"), 'ui-guard.js must not suppress kinerja tab for Admin');

// 4. Test role hierarchy in auth middleware
const { requireRole } = require('../src/middlewares/auth.middleware');

const reqAdmin = { user: { role: 'Admin' } };
const reqSuperAdmin = { user: { role: 'Super Admin' } };
const reqPengajar = { user: { role: 'Pengajar' } };

let adminNextCalled = false;
let superAdminNextCalled = false;
let pengajarNextCalled = false;

const middleware = requireRole('Super Admin', 'Admin');

middleware(reqAdmin, {}, () => { adminNextCalled = true; });
middleware(reqSuperAdmin, {}, () => { superAdminNextCalled = true; });

const resMock = {
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(data) {
        this.body = data;
        return this;
    }
};

middleware(reqPengajar, resMock, () => { pengajarNextCalled = true; });

assert.strictEqual(adminNextCalled, true, 'Admin role should be allowed by requireRole("Super Admin", "Admin")');
assert.strictEqual(superAdminNextCalled, true, 'Super Admin role should be allowed by requireRole("Super Admin", "Admin")');
assert.strictEqual(pengajarNextCalled, false, 'Pengajar role should NOT be allowed by requireRole("Super Admin", "Admin")');
assert.strictEqual(resMock.statusCode, 403, 'Forbidden status 403 expected for Pengajar role');

console.log('✅ All route guard & performance report role permissions tests passed!');
