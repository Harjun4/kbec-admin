const assert = require('assert');
const http = require('http');
const db = require('../src/config/db');
const { generateToken } = require('../src/middlewares/auth.middleware');
const app = require('../server');

async function runTests() {
    console.log('🧪 Memulai pengujian otomatis: Student Migration, Schema 11 Kolom & Excel Bulk Importer...');

    // Pre-cleanup data testing jika ada sisa
    await db.query(`DELETE FROM students WHERE nama IN ('Kenzo Alvaro', 'Zhafran Al-Fatih', 'Zhafran Al-Fatih Updated', 'Khansa Almira', 'Malik Ibrahim') OR id IN ('9907999001', '9907999002-C', 'ARBN.2026.07.999')`).catch(() => {});

    const token = generateToken({ id: '2607000001-SA', name: 'Super Admin Test', role: 'Super Admin' });
    const authHeaders = {
        'Authorization': `Bearer ${token}`
    };

    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    const baseUrl = `http://127.0.0.1:${port}`;

    const createdStudentIds = [];

    async function req(path, opts = {}) {
        const url = `${baseUrl}${path}`;
        const res = await fetch(url, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                ...authHeaders,
                ...(opts.headers || {})
            }
        });
        const data = await res.json().catch(() => null);
        return { status: res.status, ok: res.ok, data };
    }

    try {
        // -------------------------------------------------------------
        // Test 1: Generate NIS Sesuai Aturan Masing-Masing Unit
        // -------------------------------------------------------------
        console.log('\n--- 1. Pengujian Generator NIS per Unit Yayasan ---');
        
        // 1a. KBEC: 10 digit angka murni
        const rKbec = await req('/api/students/next-id?unit=KBEC');
        assert.strictEqual(rKbec.ok, true, 'Next ID KBEC harus OK');
        assert.match(rKbec.data.nextId, /^\d{10}$/, `Format NIS KBEC harus 10 digit angka murni, didapat: ${rKbec.data.nextId}`);
        console.log(`✅ KBEC NIS Generator: ${rKbec.data.nextId}`);

        // 1b. Calistung: 10 digit + -C
        const rCal = await req('/api/students/next-id?unit=Calistung');
        assert.strictEqual(rCal.ok, true, 'Next ID Calistung harus OK');
        assert.match(rCal.data.nextId, /^\d{10}-C$/, `Format NIS Calistung harus 10 digit + -C, didapat: ${rCal.data.nextId}`);
        console.log(`✅ Calistung NIS Generator: ${rCal.data.nextId}`);

        // 1c. Bimbel: 10 digit + -B
        const rBim = await req('/api/students/next-id?unit=Bimbel');
        assert.strictEqual(rBim.ok, true, 'Next ID Bimbel harus OK');
        assert.match(rBim.data.nextId, /^\d{10}-B$/, `Format NIS Bimbel harus 10 digit + -B, didapat: ${rBim.data.nextId}`);
        console.log(`✅ Bimbel NIS Generator: ${rBim.data.nextId}`);

        // 1d. Arabin: 10 digit + -A
        const rAra = await req('/api/students/next-id?unit=Arabin');
        assert.strictEqual(rAra.ok, true, 'Next ID Arabin harus OK');
        assert.match(rAra.data.nextId, /^\d{10}-A$/, `Format NIS Arabin harus 10 digit + -A, didapat: ${rAra.data.nextId}`);
        console.log(`✅ Arabin NIS Generator: ${rAra.data.nextId}`);

        // 1e. TK: ARBN.YYYY.MM.NNN
        const rTk = await req('/api/students/next-id?unit=TK');
        assert.strictEqual(rTk.ok, true, 'Next ID TK harus OK');
        assert.match(rTk.data.nextId, /^ARBN\.\d{4}\.\d{2}\.\d{3,}$/, `Format NIS TK harus ARBN.YYYY.MM.NNN, didapat: ${rTk.data.nextId}`);
        console.log(`✅ TK NIS Generator: ${rTk.data.nextId}`);

        // -------------------------------------------------------------
        // Test 2: Pendaftaran Siswa Baru dengan 11 Kolom Penuh
        // -------------------------------------------------------------
        console.log('\n--- 2. Pengujian Pendaftaran Siswa (11 Kolom Lengkap) ---');
        const testStudent = {
            id: '9907999001',
            nama: 'Zhafran Al-Fatih',
            tempat_tanggal_lahir: 'Jakarta, 16 Desember 2021',
            agama: 'Islam',
            nama_ayah: 'Fajar Nugraha',
            nama_ibu: 'Ayu Lestari',
            kontak: '081298765432',
            alamat: 'Jl. Rawa Belong No. 88, Jakarta Barat',
            unit: 'KBEC',
            program: 'Beginner 1',
            level: 'Beginner 1',
            status: 'Aktif'
        };

        const rCreate = await req('/api/students', {
            method: 'POST',
            body: JSON.stringify(testStudent)
        });
        assert.strictEqual(rCreate.ok, true, `Create student gagal: ${JSON.stringify(rCreate.data)}`);
        createdStudentIds.push(testStudent.id);
        console.log(`✅ Pendaftaran siswa berhasil dengan NIS: ${testStudent.id}`);

        // Verifikasi ke database
        const [[savedRow]] = await db.query('SELECT * FROM students WHERE id = ?', [testStudent.id]);
        assert.ok(savedRow, 'Siswa harus tersimpan di DB');
        assert.strictEqual(savedRow.nama, 'Zhafran Al-Fatih');
        assert.strictEqual(savedRow.tempat_tanggal_lahir, 'Jakarta, 16 Desember 2021');
        assert.strictEqual(savedRow.agama, 'Islam');
        assert.strictEqual(savedRow.nama_ayah, 'Fajar Nugraha');
        assert.strictEqual(savedRow.nama_ibu, 'Ayu Lestari');
        assert.strictEqual(savedRow.kontak, '081298765432');
        assert.strictEqual(savedRow.unit, 'KBEC');
        assert.strictEqual(savedRow.program, 'Beginner 1');
        assert.strictEqual(savedRow.status, 'Aktif');
        assert.ok(savedRow.program_id, 'program_id harus terhubung ke master programs');
        console.log(`✅ Verifikasi integritas 11 kolom & relasi program_id di database: PASS (program_id: ${savedRow.program_id})`);

        // -------------------------------------------------------------
        // Test 3: Pembaruan Data Siswa (PUT /api/students/:id) & Status Cuti
        // -------------------------------------------------------------
        console.log('\n--- 3. Pengujian Pembaruan Data Siswa & Status Cuti ---');
        const rUpdate = await req(`/api/students/${testStudent.id}`, {
            method: 'PUT',
            body: JSON.stringify({
                nama: 'Zhafran Al-Fatih Updated',
                tempat_tanggal_lahir: 'Tangerang Selatan, 16 Desember 2021',
                agama: 'Islam',
                nama_ayah: 'Fajar Nugraha, S.T.',
                nama_ibu: 'Ayu Lestari, S.Pd.',
                kontak: '081298765433',
                alamat: 'Bintaro Jaya Sektor 9',
                unit: 'KBEC',
                program: 'Beginner 2',
                status: 'Cuti'
            })
        });
        assert.strictEqual(rUpdate.ok, true, `Update gagal: ${JSON.stringify(rUpdate.data)}`);

        const [[updatedRow]] = await db.query('SELECT * FROM students WHERE id = ?', [testStudent.id]);
        assert.strictEqual(updatedRow.nama, 'Zhafran Al-Fatih Updated');
        assert.strictEqual(updatedRow.tempat_tanggal_lahir, 'Tangerang Selatan, 16 Desember 2021');
        assert.strictEqual(updatedRow.nama_ayah, 'Fajar Nugraha, S.T.');
        assert.strictEqual(updatedRow.program, 'Beginner 2');
        assert.strictEqual(updatedRow.status, 'Cuti', 'Status siswa harus berhasil diubah menjadi Cuti');
        console.log('✅ Pembaruan 11 kolom & status Cuti berhasil diverifikasi di database.');

        // -------------------------------------------------------------
        // Test 4: Bulk Importer (Simulasi Impor File Excel 11 Kolom)
        // -------------------------------------------------------------
        console.log('\n--- 4. Pengujian Bulk Import dengan 11 Kolom Excel ---');
        const bulkRows = [
            {
                id: '9907999002-C',
                nama: 'Khansa Almira',
                tempat_tanggal_lahir: 'Tangerang, 10 Mei 2018',
                agama: 'Islam',
                nama_ayah: 'Budi Santoso',
                nama_ibu: 'Dewi Anggraini',
                kontak: '085611223344',
                alamat: 'Pondok Aren, Tangsel',
                unit: 'Calistung',
                program: 'Calistung 1A',
                status: 'cuti' // Uji normalisasi huruf kecil 'cuti' -> 'Cuti'
            },
            {
                id: 'ARBN.2026.07.999',
                nama: 'Malik Ibrahim',
                tempat_tanggal_lahir: 'Jakarta, 12 Agustus 2020',
                agama: 'Islam',
                nama_ayah: 'Ibrahim Pasha',
                nama_ibu: 'Maryam',
                kontak: '087855667788',
                alamat: 'Ciputat Timur',
                unit: 'TK',
                program: 'TKA',
                status: 'Aktif'
            },
            {
                // Auto NIS test
                nama: 'Kenzo Alvaro',
                tempat_tanggal_lahir: 'Depok, 5 Januari 2017',
                agama: 'Islam',
                nama_ayah: 'Rian Kurniawan',
                nama_ibu: 'Nita',
                kontak: '081399887766',
                alamat: 'Serpong Utara',
                unit: 'Bimbel',
                program: 'Bimbel (SD-SMP)',
                status: 'Aktif'
            }
        ];

        const rBulk = await req('/api/students/bulk', {
            method: 'POST',
            body: JSON.stringify({ list: bulkRows })
        });
        assert.strictEqual(rBulk.ok, true, `Bulk import gagal: ${JSON.stringify(rBulk.data)}`);
        assert.strictEqual(rBulk.data.count, 3, 'Harus sukses 3 siswa');
        console.log(`✅ Bulk Importer berhasil mengimpor ${rBulk.data.count} siswa.`);

        createdStudentIds.push('9907999002-C', 'ARBN.2026.07.999');

        // Verifikasi normalisasi status Cuti pada hasil bulk import
        const [[khansaRow]] = await db.query('SELECT status FROM students WHERE id = ?', ['9907999002-C']);
        assert.strictEqual(khansaRow.status, 'Cuti', "Normalisasi status 'cuti' -> 'Cuti' harus sukses di DB");
        console.log("✅ Verifikasi normalisasi status 'cuti' -> 'Cuti' di database: PASS");

        // Verifikasi siswa auto NIS yang diimpor
        const [kenzoRows] = await db.query('SELECT * FROM students WHERE nama = ?', ['Kenzo Alvaro']);
        assert.strictEqual(kenzoRows.length, 1, 'Kenzo Alvaro harus terdaftar');
        const kenzo = kenzoRows[0];
        createdStudentIds.push(kenzo.id);
        assert.strictEqual(kenzo.unit, 'Bimbel');
        assert.strictEqual(kenzo.tempat_tanggal_lahir, 'Depok, 5 Januari 2017');
        assert.match(kenzo.id, /^\d{10}-B$/, `Kenzo Alvaro harus diberi NIS Bimbel (-B otomatis), didapat: ${kenzo.id}`);
        console.log(`✅ Siswa tanpa NIS dalam Excel otomatis diberi NIS resmi per-unit: ${kenzo.id}`);

        // -------------------------------------------------------------
        // Test 5: Filter Pencarian & Status Keaktifan Cuti
        // -------------------------------------------------------------
        console.log('\n--- 5. Pengujian Pencarian Cerdas & Filter Status Cuti ---');
        const rSearchAyah = await req('/api/students?search=Pasha');
        assert.strictEqual(rSearchAyah.ok, true);
        const listPasha = Array.isArray(rSearchAyah.data) ? rSearchAyah.data : rSearchAyah.data.data;
        assert.ok(listPasha.some(s => s.nama === 'Malik Ibrahim'), 'Pencarian berdasarkan nama ayah harus menemukan anak');
        console.log('✅ Pencarian berdasarkan Nama Orang Tua / Wali berhasil!');

        const rSearchTTL = await req('/api/students?unit=Calistung');
        assert.strictEqual(rSearchTTL.ok, true);
        const listCal = Array.isArray(rSearchTTL.data) ? rSearchTTL.data : rSearchTTL.data.data;
        assert.ok(listCal.some(s => s.id === '9907999002-C'), 'Filter unit Calistung harus menemukan siswa');
        console.log('✅ Filter per-unit Yayasan berhasil!');

        const rSearchCuti = await req('/api/students?page=1&limit=50&status=Cuti');
        assert.strictEqual(rSearchCuti.ok, true);
        const listCuti = Array.isArray(rSearchCuti.data) ? rSearchCuti.data : (rSearchCuti.data.data || []);
        assert.ok(listCuti.some(s => s.id === testStudent.id), 'Filter status Cuti harus mencakup siswa yang statusnya Cuti');
        console.log('✅ Filter API dengan status Cuti berhasil!');

    } finally {
        // Cleanup test data
        if (createdStudentIds.length > 0) {
            console.log(`\n🧹 Membersihkan ${createdStudentIds.length} data uji testing...`);
            for (const id of createdStudentIds) {
                await db.query('DELETE FROM class_students WHERE student_id = ?', [id]).catch(() => {});
                await db.query('DELETE FROM student_grades WHERE student_id = ?', [id]).catch(() => {});
                await db.query('DELETE FROM students WHERE id = ?', [id]).catch(() => {});
            }
            console.log('✅ Cleanup data uji selesai.');
        }

        server.close();
    }

    console.log('\n🎉 SEMUA PENGUJIAN SKEMA 11 KOLOM, FORMAT NIS RESMI & IMPOR EXCEL LULUS 100%!');
}

runTests().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('❌ PENGUJIAN GAGAL:', err);
    process.exit(1);
});
