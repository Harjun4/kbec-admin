const assert = require('assert');
const { resolveStudentUnit, escapeHTML } = require('../src/utils/helpers');

console.log('🧪 Menjalankan pengujian otomatis (API & Helper Suite)...');

// Test 1: Unit Resolution
assert.strictEqual(resolveStudentUnit('2607000001-C', 'General'), 'Calistung');
assert.strictEqual(resolveStudentUnit('2607000002-B', 'Reguler'), 'Bimbel');
assert.strictEqual(resolveStudentUnit('2607000003-A', 'Beasiswa'), 'Arabin');
assert.strictEqual(resolveStudentUnit('2607000004-TK', 'PAUD'), 'TK');
assert.strictEqual(resolveStudentUnit('2607000005-ADM', 'Beginner 1'), 'KBEC'); // Must NOT match Arabin for -ADM

// Test 2: HTML Escaping
assert.strictEqual(escapeHTML('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
assert.strictEqual(escapeHTML('John & Jane'), 'John &amp; Jane');

console.log('✅ seluruh pengujian API & Helper Suite berhasil LULUS!');
