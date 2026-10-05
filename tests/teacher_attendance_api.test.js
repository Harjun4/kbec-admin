const assert = require('assert');
const { generateToken } = require('../src/middlewares/auth.middleware');
const teacherController = require('../src/controllers/teacher.controller');
const db = require('../src/config/db');

console.log('🧪 Testing Teacher Attendance Sequence & Constraints API Controller directly...');

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
    // 0. Clean up any existing records for test teacher today
    await db.query("DELETE FROM teacher_checkins WHERE (teacher_id IN ('KBEC-T001', 'KBEC-T853') OR LOWER(teacher_name) LIKE '%sarah%') AND (notes LIKE '%Tes Sequence%' OR notes LIKE '%tepat waktu%' OR notes LIKE '%antusias%')");

    const teacherUser = {
        id: 'USER-T001',
        teacher_id: 'KBEC-T001',
        name: 'Ms. Sarah Johnson',
        role: 'Pengajar'
    };

    // 1. ATURAN: Tidak bisa isi sesi mengajar jika belum check-in
    console.log('Testing Rule: Sesi mengajar DITOLAK jika belum check-in...');
    const reqTeachingBeforeCheckin = {
        user: teacherUser,
        body: {
            attendance_type: 'sesi_mengajar',
            class_id: 1,
            class_name: 'Kelas Bahasa Inggris Dasar',
            topic_material: 'Simple Present Tense',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mocksessionphoto',
            notes: 'Tes Sequence - Sebelum check-in'
        }
    };

    let res = createMockRes();
    await teacherController.checkinTeacher(reqTeachingBeforeCheckin, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 400, 'Sesi mengajar sebelum check-in harus ditolak 400');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('belum melakukan check-in'), 'Pesan harus menyebutkan belum check-in');
    console.log('✅ Rule passed: Sesi mengajar sebelum check-in berhasil ditolak:', res.body.message);

    // 2. ATURAN: Tidak bisa check-out jika belum check-in
    console.log('Testing Rule: Check-out DITOLAK jika belum check-in...');
    const reqCheckoutBeforeCheckin = {
        user: teacherUser,
        body: {
            attendance_type: 'checkout_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockcheckoutphoto',
            notes: 'Tes Sequence - Checkout sebelum checkin'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqCheckoutBeforeCheckin, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 400, 'Checkout sebelum check-in harus ditolak 400');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('belum melakukan check-in'), 'Pesan harus menyebutkan belum check-in');
    console.log('✅ Rule passed: Checkout sebelum check-in berhasil ditolak:', res.body.message);

    // 3. Check-in Harian Pertama kali -> Harus SUKSES
    console.log('Testing: Check-in harian pertama kali...');
    const reqFirstCheckin = {
        user: teacherUser,
        body: {
            attendance_type: 'checkin_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockphoto123',
            notes: 'Tes Sequence - Check-in pertama'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqFirstCheckin, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200, 'Checkin pertama harus 200');
    assert.strictEqual(res.body.success, true);
    console.log('✅ Check-in pertama berhasil:', res.body.message);

    // 4. ATURAN: Tidak bisa check-in dua kali berturut-turut saat masih dalam status check-in aktif
    console.log('Testing Rule: Check-in kedua DITOLAK saat masih dalam status Check-in aktif...');
    const reqSecondCheckinWhileActive = {
        user: teacherUser,
        body: {
            attendance_type: 'checkin_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockphoto123',
            notes: 'Tes Sequence - Check-in kedua saat aktif'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqSecondCheckinWhileActive, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 400, 'Check-in kedua saat aktif harus ditolak 400');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('masih dalam status Check-in'), 'Pesan harus menyebutkan masih dalam status check-in');
    console.log('✅ Rule passed: Check-in saat masih aktif berhasil ditolak:', res.body.message);

    // 5. ATURAN: Sesi mengajar setelah check-in -> Harus SUKSES
    console.log('Testing Rule: Sesi mengajar setelah check-in...');
    const reqTeachingAfterCheckin = {
        user: teacherUser,
        body: {
            attendance_type: 'sesi_mengajar',
            class_id: 1,
            class_name: 'Kelas Bahasa Inggris Dasar',
            topic_material: 'Simple Present Tense & Grammar Drills',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mocksessionphoto',
            notes: 'Tes Sequence - Sesi mengajar aktif'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqTeachingAfterCheckin, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200, 'Sesi mengajar setelah check-in harus 200');
    assert.strictEqual(res.body.success, true);
    console.log('✅ Sesi mengajar setelah check-in berhasil:', res.body.message);

    // 6. Check-out Pulang Sesi 1 -> Harus SUKSES dan MENGHITUNG DURASI JAM KERJA
    console.log('Testing: Check-out pulang sesi 1 dan hitung durasi jam kerja...');
    const reqFirstCheckout = {
        user: teacherUser,
        body: {
            attendance_type: 'checkout_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockcheckoutphoto',
            notes: 'Tes Sequence - Check-out pulang sesi 1'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqFirstCheckout, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200, 'Check-out pertama harus 200');
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.duration_minutes !== undefined, 'Durasi menit kerja harus ada');
    assert.ok(res.body.duration_text, 'Teks durasi kerja harus ada');
    console.log(`✅ Check-out sesi 1 berhasil (Durasi: ${res.body.duration_text}):`, res.body.message);

    // 7. ATURAN: Tidak bisa check-out lagi saat sudah dalam keadaan check-out
    console.log('Testing Rule: Check-out ganda DITOLAK saat sudah checkout...');
    const reqSecondCheckoutAfterCheckout = {
        user: teacherUser,
        body: {
            attendance_type: 'checkout_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockcheckoutphoto',
            notes: 'Tes Sequence - Check-out ganda'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqSecondCheckoutAfterCheckout, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 400, 'Check-out saat sudah checkout harus ditolak 400');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('tidak dalam status Check-in') || res.body.message.includes('sudah Check-out'), 'Pesan harus menjelaskan sudah check-out');
    console.log('✅ Rule passed: Check-out berulang saat checkout berhasil ditolak:', res.body.message);

    // 8. ATURAN: Tidak bisa isi sesi mengajar setelah check-out (sebelum check-in kembali)
    console.log('Testing Rule: Sesi mengajar setelah check-out DITOLAK...');
    const reqTeachingAfterCheckout = {
        user: teacherUser,
        body: {
            attendance_type: 'sesi_mengajar',
            class_id: 1,
            class_name: 'Kelas Bahasa Inggris Dasar',
            topic_material: 'Speaking Part 2',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mocksessionphoto',
            notes: 'Tes Sequence - Mengajar setelah checkout'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqTeachingAfterCheckout, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 400, 'Sesi mengajar setelah check-out harus ditolak 400');
    assert.strictEqual(res.body.success, false);
    assert.ok(res.body.message.includes('Check-out') || res.body.message.includes('wajib melakukan Check-in Datang terlebih dahulu'), 'Pesan harus menyebutkan wajib check-in');
    console.log('✅ Rule passed: Sesi mengajar setelah check-out berhasil ditolak:', res.body.message);

    // 9. ATURAN: BISA CHECK-IN KEMBALI UNTUK SESI BERIKUTNYA (MULTI-SESSION DAILY CHECKIN)
    console.log('Testing: Check-in sesi 2 pada hari yang sama (Multi-session support)...');
    const reqSecondCheckinNewSession = {
        user: teacherUser,
        body: {
            attendance_type: 'checkin_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockphotoSession2',
            notes: 'Tes Sequence - Check-in sesi 2 siang'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqSecondCheckinNewSession, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200, 'Check-in sesi 2 harus 200 (diizinkan multi-sesi)');
    assert.strictEqual(res.body.success, true);
    console.log('✅ Check-in sesi 2 berhasil (Multi-sesi harian didukung):', res.body.message);

    // 10. Check-out Sesi 2 -> Harus SUKSES dan durasi terhitung
    console.log('Testing: Check-out sesi 2...');
    const reqSecondCheckoutNewSession = {
        user: teacherUser,
        body: {
            attendance_type: 'checkout_harian',
            lat: -6.2545644,
            lng: 106.7340093,
            is_online: 0,
            proof_image: 'data:image/jpeg;base64,mockcheckoutphotoSession2',
            notes: 'Tes Sequence - Check-out sesi 2 sore'
        }
    };

    res = createMockRes();
    await teacherController.checkinTeacher(reqSecondCheckoutNewSession, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200, 'Check-out sesi 2 harus 200');
    assert.strictEqual(res.body.success, true);
    assert.ok(res.body.duration_minutes !== undefined, 'Durasi sesi 2 harus dihitung');
    console.log(`✅ Check-out sesi 2 berhasil (Durasi: ${res.body.duration_text}):`, res.body.message);

    // 11. Verifikasi getAttendanceSummary & teacherStats akumulasi multi-sesi
    console.log('Testing: getAttendanceSummary verification for multi-session & accumulated duration...');
    const reqTeacherSummary = {
        user: teacherUser
    };

    res = createMockRes();
    await teacherController.getAttendanceSummary(reqTeacherSummary, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(res.body.teacher_stats, 'teacher_stats must be returned');
    assert.strictEqual(res.body.teacher_stats.checkin_count_today, 2, 'Harus tercatat 2 kali checkin hari ini');
    assert.strictEqual(res.body.teacher_stats.checkout_count_today, 2, 'Harus tercatat 2 kali checkout hari ini');
    assert.strictEqual(res.body.teacher_stats.is_currently_checked_in, false, 'Status saat ini sedang tidak checkin');
    assert.strictEqual(res.body.teacher_stats.can_checkin, true, 'Bisa check-in lagi untuk sesi ke-3 jika ada');
    assert.strictEqual(res.body.teacher_stats.can_checkout, false, 'Tidak bisa checkout karena belum checkin sesi 3');
    assert.strictEqual(res.body.teacher_stats.can_teach, false, 'Tidak bisa mengajar karena belum checkin');
    assert.ok(res.body.teacher_stats.total_work_duration_text, 'Total durasi kerja hari ini harus terformat');
    console.log('✅ teacher_stats verification passed:', JSON.stringify({
        current_state: res.body.teacher_stats.current_state,
        checkin_count: res.body.teacher_stats.checkin_count_today,
        checkout_count: res.body.teacher_stats.checkout_count_today,
        total_duration: res.body.teacher_stats.total_work_duration_text,
        can_checkin: res.body.teacher_stats.can_checkin,
        can_checkout: res.body.teacher_stats.can_checkout,
        can_teach: res.body.teacher_stats.can_teach
    }));

    // 12. Verifikasi getCheckinLogs mengembalikan session_number, jam masuk, jam pulang & durasi
    console.log('Testing: getCheckinLogs session enrichment verification for admin modal...');
    const reqAdminLogs = {
        user: { id: 'ADMIN-01', role: 'Super Admin' },
        query: { date: require('../src/utils/helpers').getWIBDate() }
    };
    res = createMockRes();
    await teacherController.getCheckinLogs(reqAdminLogs, res, (err) => {
        if (err) throw err;
    });
    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.body), 'Logs must be an array');
    const testLogs = res.body.filter(l => l.notes && l.notes.includes('Tes Sequence'));
    assert.ok(testLogs.length >= 2, 'Should find at least 2 test logs');
    testLogs.forEach(l => {
        assert.ok(l.session_number !== undefined, 'session_number must be defined');
        assert.ok(l.session_checkin_jam, 'session_checkin_jam must be defined');
    });
    console.log('✅ getCheckinLogs session enrichment verified:', testLogs.map(l => ({
        attendance_type: l.attendance_type,
        session_number: l.session_number,
        checkin_jam: l.session_checkin_jam,
        checkout_jam: l.session_checkout_jam,
        duration: l.session_duration_text
    })));

    // Clean up test records
    await db.query("DELETE FROM teacher_checkins WHERE (teacher_id IN ('KBEC-T001', 'KBEC-T853') OR LOWER(teacher_name) LIKE '%sarah%') AND (notes LIKE '%Tes Sequence%' OR notes LIKE '%tepat waktu%' OR notes LIKE '%antusias%')");
    console.log('🧹 Cleaned up test sequence records.');

    console.log('🎉 ALL MULTI-SESSION & DURATION TRACKING TESTS PASSED 100%!');
    process.exit(0);
}

runApiTests().catch(err => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
