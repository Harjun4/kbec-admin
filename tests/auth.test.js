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

console.log('✅ seluruh pengujian auth suite berhasil LULUS!');
