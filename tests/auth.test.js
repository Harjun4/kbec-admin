const assert = require('assert');
const { generateToken, JWT_SECRET } = require('../src/middlewares/auth.middleware');
const jwt = require('jsonwebtoken');

console.log('🧪 Menjalankan pengujian otomatis (Auth Suite)...');

// Test 1: JWT Generation
const mockUser = { id: '2607000001-SA', name: 'Super Admin Test', role: 'Super Admin' };
const token = generateToken(mockUser);
assert.ok(token, 'JWT Token harus ter-generate');

// Test 2: JWT Verification
const decoded = jwt.verify(token, JWT_SECRET);
assert.strictEqual(decoded.id, '2607000001-SA');
assert.strictEqual(decoded.role, 'Super Admin');

// Test 3: Admin Role Token Generation & Verification
const mockAdmin = { id: '2607000001-ADM', name: 'Admin Test', role: 'Admin' };
const adminToken = generateToken(mockAdmin);
const decodedAdmin = jwt.verify(adminToken, JWT_SECRET);
assert.strictEqual(decodedAdmin.id, '2607000001-ADM');
assert.strictEqual(decodedAdmin.role, 'Admin');

// Test 4: Role Hierarchy Middleware Validation
const { requireRole } = require('../src/middlewares/auth.middleware');

const reqAdmin = { user: decodedAdmin };
const reqSuper = { user: decoded };

let allowedForBoth = false;
let allowedSuperOnlyForAdmin = false;

const middlewareBoth = requireRole('Super Admin', 'Admin');
middlewareBoth(reqAdmin, {}, () => { allowedForBoth = true; });
assert.strictEqual(allowedForBoth, true, 'Admin harus diizinkan untuk rute (Super Admin, Admin)');

const middlewareSuperOnly = requireRole('Super Admin');
const mockRes = {
    status(code) {
        assert.strictEqual(code, 403, 'Admin harus mendapatkan status 403 untuk rute Super Admin');
        return { json: () => {} };
    }
};
middlewareSuperOnly(reqAdmin, mockRes, () => { allowedSuperOnlyForAdmin = true; });
assert.strictEqual(allowedSuperOnlyForAdmin, false, 'Admin tidak boleh diizinkan untuk rute Super Admin');

console.log('✅ seluruh pengujian auth suite berhasil LULUS!');
