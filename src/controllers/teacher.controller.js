const db = require('../config/db');
const { escapeHTML, getWIBDate, getWIBMonth, isUnitUsingSBWB } = require('../utils/helpers');

// Koordinat Resmi Yayasan Ar-Rasyid Bintaro - KBEC Jakarta (https://maps.app.goo.gl/gjiAmuJcTriC3VX49)
const KBEC_LAT = -6.2545644;
const KBEC_LNG = 106.7340093;
const KBEC_ALLOWED_RADIUS = parseInt(process.env.KBEC_RADIUS_METERS || '150', 10); // Toleransi radius GPS (150 meter)

function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function formatDurationIndonesian(durationMinutes) {
    const mins = parseInt(durationMinutes, 10);
    if (isNaN(mins) || mins <= 0) return '0 menit';
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    if (hours > 0 && minutes > 0) {
        return `${hours} jam ${minutes} menit`;
    } else if (hours > 0) {
        return `${hours} jam`;
    }
    return `${minutes} menit`;
}

async function getTeachers(req, res, next) {
    try {
        const [rows] = await db.query('SELECT * FROM teachers ORDER BY id ASC');
        
        // Ambil data attendance bulan berjalan dan relasi kelas untuk deteksi siswa bermasalah
        let classes = [];
        let classStudents = [];
        let attRows = [];
        try {
            const [c] = await db.query('SELECT id, nama, pengajar, teacher_id, hari FROM classes');
            const [cs] = await db.query('SELECT class_id, student_id FROM class_students');
            const currentMonth = getWIBMonth();
            const [a] = await db.query(`
                SELECT a.student_id, s.nama AS student_name, a.status, a.kelas, 
                       TO_CHAR(a.tanggal::timestamp, 'YYYY-MM-DD') as tanggal 
                FROM attendance a
                LEFT JOIN students s ON a.student_id = s.id
                WHERE a.tanggal::text LIKE ?
            `, [`${currentMonth}-%`]);
            classes = c || [];
            classStudents = cs || [];
            attRows = a || [];
        } catch (queryErr) {
            console.warn('[getTeachers] Attendance enrichment notice:', queryErr.message);
        }

        const todayDate = getWIBDate();
        const formatted = rows.map(r => {
            const tId = r.id;
            const tNameLower = (r.nama || '').toLowerCase().trim();
            const myClasses = classes.filter(c => 
                (c.teacher_id && String(c.teacher_id).trim() === String(tId).trim()) ||
                (c.pengajar && tNameLower && (
                    c.pengajar.toLowerCase().trim() === tNameLower ||
                    c.pengajar.toLowerCase().includes(tNameLower) ||
                    tNameLower.includes(c.pengajar.toLowerCase().trim())
                ))
            );
            const myClassIds = myClasses.map(c => String(c.id));
            const myClassNames = myClasses.map(c => (c.nama || '').toLowerCase().replace(/&amp;/g, '&').trim());
            const myStudentIds = classStudents
                .filter(cs => myClassIds.includes(String(cs.class_id)))
                .map(cs => String(cs.student_id));

            const relevantAtt = attRows.filter(a => {
                const aKelasClean = (a.kelas || '').toLowerCase().replace(/&amp;/g, '&').trim();
                return myStudentIds.includes(String(a.student_id)) || (aKelasClean && myClassNames.includes(aKelasClean));
            });

            const problematicStudents = evaluateProblematicStudents(relevantAtt);
            const scheduledTodayCount = myClasses.filter(c => isClassScheduledOnDay(c.hari, todayDate)).length;

            return {
                ...r,
                expertise: JSON.parse(r.expertise || '[]'),
                total_classes: myClasses.length,
                total_classes_today: scheduledTodayCount,
                problematic_students_count: problematicStudents.length,
                has_problematic_students: problematicStudents.length > 0,
                problematic_students: problematicStudents
            };
        });

        res.json(formatted);
    } catch (err) {
        next(err);
    }
}


async function createTeacher(req, res, next) {
    const { nama, joined, expertise, email, kontak, status, avatar } = req.body;
    if (!nama || !nama.trim()) {
        return res.status(400).json({ success: false, message: 'Nama pengajar wajib diisi.' });
    }

    try {
        let uniqueId = null;
        let attempts = 0;
        while (!uniqueId && attempts < 20) {
            const randNum = Math.floor(100 + Math.random() * 900);
            const candidateId = `KBEC-T${randNum}`;
            const [existing] = await db.query('SELECT id FROM teachers WHERE id = ?', [candidateId]);
            if (existing.length === 0) {
                uniqueId = candidateId;
            }
            attempts++;
        }

        if (!uniqueId) {
            uniqueId = `KBEC-T${Date.now().toString().slice(-4)}`;
        }

        const finalAvatar = avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150';
        const expertiseStr = JSON.stringify(expertise || []);

        await db.query(
            'INSERT INTO teachers (id, nama, joined, expertise, email, kontak, status, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [uniqueId, escapeHTML(nama.trim()), escapeHTML(joined || 'Jan 2026'), expertiseStr, escapeHTML(email || ''), escapeHTML(kontak || ''), escapeHTML(status || 'Aktif'), finalAvatar]
        );

        res.status(201).json({
            id: uniqueId,
            nama: escapeHTML(nama.trim()),
            joined: escapeHTML(joined),
            expertise,
            email: escapeHTML(email),
            kontak: escapeHTML(kontak),
            status: escapeHTML(status),
            avatar: finalAvatar
        });
    } catch (err) {
        next(err);
    }
}

async function updateTeacher(req, res, next) {
    const { id } = req.params;
    const { nama, email, kontak, expertise, joined, status, program, unit } = req.body;
    let conn;
    try {
        conn = await db.getConnection();
        await conn.beginTransaction();

        const expertiseStr = JSON.stringify(expertise || []);
        
        try {
            await conn.query(
                'UPDATE teachers SET nama = ?, email = ?, kontak = ?, expertise = ?, joined = ?, status = ?, program = ?, unit = ? WHERE id = ?',
                [escapeHTML(nama), escapeHTML(email), escapeHTML(kontak), expertiseStr, escapeHTML(joined), escapeHTML(status), escapeHTML(program || ''), escapeHTML(unit || ''), id]
            );
        } catch (e) {
            if (e.message && (e.message.includes('column "program"') || e.message.includes('column "unit"'))) {
                await conn.query(
                    'UPDATE teachers SET nama = ?, email = ?, kontak = ?, expertise = ?, joined = ?, status = ? WHERE id = ?',
                    [escapeHTML(nama), escapeHTML(email), escapeHTML(kontak), expertiseStr, escapeHTML(joined), escapeHTML(status), id]
                );
            } else {
                throw e;
            }
        }

        const safeNama = escapeHTML(nama);
        const safeEmail = escapeHTML(email);
        const safeKontak = escapeHTML(kontak);

        try {
            await conn.query(
                `UPDATE users 
                 SET name = ?, email = ?, phone = ? 
                 WHERE (teacher_id = ?::text AND ?::text IS NOT NULL AND ?::text != '') 
                    OR (LOWER(email) = LOWER(?::text) AND email IS NOT NULL AND email != '')`,
                [safeNama, safeEmail, safeKontak, id, id, id, email]
            );
        } catch (dbErr) {
            if (dbErr.message && dbErr.message.includes('column "phone"')) {
                await conn.query(
                    `UPDATE users 
                     SET name = ?, email = ? 
                     WHERE (teacher_id = ?::text AND ?::text IS NOT NULL AND ?::text != '') 
                        OR (LOWER(email) = LOWER(?::text) AND email IS NOT NULL AND email != '')`,
                    [safeNama, safeEmail, id, id, id, email]
                );
            } else {
                throw dbErr;
            }
        }

        await conn.commit();
        conn.release();

        res.json({ success: true });
    } catch (err) {
        if (conn) {
            try { await conn.rollback(); conn.release(); } catch(e) {}
        }
        next(err);
    }
}

async function deleteTeacher(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM teachers WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function checkinTeacher(req, res, next) {
    const isTeacherRole = (req.user.role || '').toLowerCase().includes('pengajar') || (req.user.role || '').toLowerCase().includes('guru') || (req.user.role || '').toLowerCase().includes('teacher');
    let teacher_id = isTeacherRole ? (req.user.teacher_id || req.user.id || req.user.nis) : (req.body.teacher_id || req.user.id || req.user.nis);
    let teacher_name = isTeacherRole ? req.user.name : (req.body.teacher_name || req.user.name);
    
    // Ensure teacher_id satisfies foreign key constraint fk_checkins_teacher
    try {
        const [[existingT]] = await db.query('SELECT id, nama FROM teachers WHERE id = ? OR LOWER(nama) = LOWER(?) LIMIT 1', [teacher_id, teacher_name]);
        if (existingT) {
            teacher_id = existingT.id;
            if (!teacher_name || teacher_name === req.user.name) teacher_name = existingT.nama;
        } else if (isTeacherRole && req.user) {
            const { ensureTeacherProfile } = require('./user.controller');
            const createdId = await ensureTeacherProfile(req.user.id || req.user.nis, 'Pengajar', 'Approved', req.user.email, req.user.name);
            if (createdId) teacher_id = createdId;
        }
    } catch (resolveErr) {
        console.warn('Teacher profile resolve notice:', resolveErr.message);
    }

    const {
        class_id,
        class_name,
        lat,
        lng,
        is_online,
        attendance_type,
        proof_image,
        topic_material,
        notes
    } = req.body;

    if (!teacher_id || !teacher_name) {
        return res.status(400).json({ success: false, message: 'ID dan Nama Pengajar wajib disertakan.' });
    }

    try {
        const type = attendance_type || 'checkin_harian';
        let distanceMeters = 0;
        let isValid = true;
        let status = 'Terverifikasi (Hadir)';

        const todayStr = getWIBDate();
        const [existingTodayLogs] = await db.query(`
            SELECT id, attendance_type, status, duration_minutes,
                   COALESCE(check_time, created_at) AS raw_time,
                   TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI') AS jam
            FROM teacher_checkins
            WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
              AND TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ?
            ORDER BY COALESCE(check_time, created_at) ASC
        `, [teacher_id, teacher_id, teacher_name, todayStr]);

        const dailyLogs = existingTodayLogs.filter(c => 
            c.attendance_type === 'checkin_harian' || 
            c.attendance_type === 'checkout_harian' || 
            c.attendance_type === 'izin' || 
            c.attendance_type === 'sakit'
        );
        const lastDailyLog = dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1] : null;
        const isCurrentlyCheckedIn = lastDailyLog && lastDailyLog.attendance_type === 'checkin_harian';
        const leaveRecord = existingTodayLogs.find(c => c.attendance_type === 'izin' || c.attendance_type === 'sakit');

        let calculatedDurationMinutes = null;
        let calculatedDurationText = null;

        // 1. Aturan Check-in Harian: Bisa berkali-kali sehari, tetapi jika sedang check-in tidak bisa check-in lagi
        if (type === 'checkin_harian') {
            if (isCurrentlyCheckedIn) {
                return res.status(400).json({
                    success: false,
                    message: `Anda saat ini masih dalam status Check-in (sejak pukul ${lastDailyLog.jam} WIB). Anda harus melakukan Check-out terlebih dahulu sebelum dapat Check-in kembali.`
                });
            }
            if (leaveRecord) {
                return res.status(400).json({
                    success: false,
                    message: `Anda sudah tercatat ${leaveRecord.attendance_type} untuk hari ini, sehingga tidak dapat melakukan check-in.`
                });
            }
        }

        // 2. Aturan Check-out Harian: Wajib sedang dalam status check-in
        if (type === 'checkout_harian') {
            if (!isCurrentlyCheckedIn) {
                if (lastDailyLog && lastDailyLog.attendance_type === 'checkout_harian') {
                    return res.status(400).json({
                        success: false,
                        message: `Anda saat ini sedang tidak dalam status Check-in (sudah Check-out pada pukul ${lastDailyLog.jam} WIB). Silakan lakukan Check-in terlebih dahulu sebelum melakukan Check-out.`
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: 'Anda belum melakukan check-in hari ini. Silakan lakukan check-in terlebih dahulu sebelum melakukan check-out.'
                });
            }

            // Hitung durasi jam kerja dari check-in terakhir sampai check-out ini
            const checkinTime = new Date(lastDailyLog.raw_time);
            const checkoutTime = new Date();
            const diffMs = Math.max(0, checkoutTime.getTime() - checkinTime.getTime());
            calculatedDurationMinutes = Math.round(diffMs / (1000 * 60));
            calculatedDurationText = formatDurationIndonesian(calculatedDurationMinutes);
        }

        // 3. Aturan Sesi Mengajar: Hanya bisa diisi jika sedang dalam keadaan check-in
        if (type === 'sesi_mengajar') {
            if (!isCurrentlyCheckedIn) {
                if (lastDailyLog && lastDailyLog.attendance_type === 'checkout_harian') {
                    return res.status(400).json({
                        success: false,
                        message: `Anda saat ini sedang dalam status Check-out (terakhir check-out pukul ${lastDailyLog.jam} WIB). Anda wajib melakukan Check-in Datang terlebih dahulu sebelum mengisi sesi mengajar kelas.`
                    });
                }
                if (leaveRecord) {
                    return res.status(400).json({
                        success: false,
                        message: `Status kehadiran Anda hari ini adalah ${leaveRecord.attendance_type}, tidak dapat mengisi sesi mengajar kelas.`
                    });
                }
                return res.status(400).json({
                    success: false,
                    message: 'Anda belum melakukan check-in hari ini. Anda wajib melakukan check-in kehadiran terlebih dahulu sebelum dapat mengisi presensi sesi mengajar kelas.'
                });
            }
        }

        // 4. Aturan Izin / Sakit: Tidak bisa jika sedang dalam keadaan check-in aktif
        if (type === 'izin' || type === 'sakit') {
            if (isCurrentlyCheckedIn) {
                return res.status(400).json({
                    success: false,
                    message: 'Anda saat ini sedang dalam status Check-in aktif. Selesaikan sesi dengan Check-out terlebih dahulu jika ingin izin/pulang.'
                });
            }
            if (leaveRecord) {
                return res.status(400).json({
                    success: false,
                    message: `Anda sudah tercatat ${leaveRecord.attendance_type} untuk hari ini.`
                });
            }
        }

        // Validasi wajib foto bukti langsung untuk presensi datang & pulang
        if ((type === 'checkin_harian' || type === 'checkout_harian') && !proof_image) {
            return res.status(400).json({
                success: false,
                message: 'Foto bukti kamera langsung wajib disertakan untuk presensi datang dan pulang (tidak boleh foto lama).'
            });
        }

        // Validasi wajib koordinat lokasi GPS untuk presensi tatap muka (checkin harian, checkout harian, sesi mengajar tatap muka)
        const isOfflinePresence = type === 'checkin_harian' || type === 'checkout_harian' || (type === 'sesi_mengajar' && !is_online);
        if (isOfflinePresence) {
            const parsedLat = parseFloat(lat);
            const parsedLng = parseFloat(lng);
            if (lat === undefined || lat === null || lat === '' || lng === undefined || lng === null || lng === '' || isNaN(parsedLat) || isNaN(parsedLng) || (parsedLat === 0 && parsedLng === 0)) {
                return res.status(400).json({
                    success: false,
                    message: 'Akses lokasi GPS wajib diaktifkan dan diizinkan pada perangkat Anda untuk melakukan presensi!'
                });
            }
        }

        if (type === 'izin') {
            status = 'Izin';
        } else if (type === 'sakit') {
            status = 'Sakit';
        } else if (type === 'checkout_harian') {
            distanceMeters = calculateHaversineDistance(parseFloat(lat), parseFloat(lng), KBEC_LAT, KBEC_LNG);
            status = 'Check-out (Selesai)';
        } else {
            // checkin_harian atau sesi_mengajar
            if (!is_online) {
                distanceMeters = calculateHaversineDistance(parseFloat(lat), parseFloat(lng), KBEC_LAT, KBEC_LNG);
                if (distanceMeters > KBEC_ALLOWED_RADIUS) {
                    isValid = false;
                    status = `Hadir (Luar Radius - ${Math.round(distanceMeters)}m)`;
                } else {
                    status = 'Terverifikasi (Hadir)';
                }
            } else {
                status = 'Terverifikasi (Online)';
            }
        }

        const querySql = `
            INSERT INTO teacher_checkins (
                teacher_id, teacher_name, class_id, class_name, lat, lng,
                distance_meters, is_online, status, attendance_type,
                proof_image, topic_material, notes, duration_minutes, check_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;

        await db.query(querySql, [
            teacher_id,
            escapeHTML(teacher_name),
            class_id || null,
            escapeHTML(class_name || (type === 'checkin_harian' ? 'Kantor / Bimbel KBEC' : (type === 'checkout_harian' ? 'Selesai Mengajar' : 'Tatap Muka'))),
            lat ? parseFloat(lat) : 0,
            lng ? parseFloat(lng) : 0,
            distanceMeters,
            is_online ? 1 : 0,
            status,
            type,
            proof_image || null,
            escapeHTML(topic_material || ''),
            escapeHTML(notes || ''),
            calculatedDurationMinutes
        ]);

        let message = 'Presensi berhasil dicatat.';
        if (type === 'checkin_harian') {
            message = isValid ? 'Check-in datang harian berhasil terverifikasi.' : `Check-in tercatat di luar radius KBEC (${Math.round(distanceMeters)} meter).`;
        } else if (type === 'checkout_harian') {
            message = `Check-out pulang harian berhasil dicatat. Durasi sesi kerja: ${calculatedDurationText}.`;
        } else if (type === 'sesi_mengajar') {
            message = 'Presensi sesi mengajar kelas berhasil disimpan beserta bukti.';
        } else if (type === 'izin' || type === 'sakit') {
            message = `Pengajuan ${type} berhasil dikirim ke Super Admin.`;
        }

        res.json({
            success: true,
            status,
            attendance_type: type,
            distance_meters: Math.round(distanceMeters),
            duration_minutes: calculatedDurationMinutes,
            duration_text: calculatedDurationText,
            message
        });
    } catch (err) {
        next(err);
    }
}

async function getCheckinLogs(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').trim().toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('guru') || userRole.includes('teacher');
        
        let conditions = [];
        let params = [];

        // If logged-in user is a Teacher, isolate their logs
        if (isTeacher) {
            const uId = req.user.id || '';
            const tId = req.user.teacher_id || '';
            const tName = (req.user.name || '').trim();
            conditions.push('(teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))');
            params.push(tId, uId, tName);
        } else {
            // Super Admin, Admin, Staff can filter by teacher_id
            if (req.query.teacher_id && req.query.teacher_id !== 'all') {
                conditions.push('teacher_id = ?');
                params.push(req.query.teacher_id);
            }
        }

        // Filter by attendance_type
        if (req.query.attendance_type && req.query.attendance_type !== 'all') {
            conditions.push('attendance_type = ?');
            params.push(req.query.attendance_type);
        }

        // Filter by status
        if (req.query.status && req.query.status !== 'all') {
            conditions.push('status ILIKE ?');
            params.push(`%${req.query.status}%`);
        }

        // Filter by date range or single date (Menggunakan Timezone Asia/Jakarta - WIB)
        if (req.query.date) {
            conditions.push("TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ?");
            params.push(req.query.date);
        } else {
            if (req.query.startDate) {
                conditions.push("(COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')::date >= ?::date");
                params.push(req.query.startDate);
            }
            if (req.query.endDate) {
                conditions.push("(COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')::date <= ?::date");
                params.push(req.query.endDate);
            }
        }

        // Filter by month & year (WIB)
        if (req.query.month && req.query.year) {
            conditions.push("EXTRACT(MONTH FROM (COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')) = ? AND EXTRACT(YEAR FROM (COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')) = ?");
            params.push(parseInt(req.query.month, 10), parseInt(req.query.year, 10));
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit = parseInt(req.query.limit || '200', 10);

        const sql = `
            SELECT 
                id,
                teacher_id,
                teacher_name,
                class_id,
                class_name,
                lat,
                lng,
                distance_meters,
                is_online,
                status,
                attendance_type,
                proof_image,
                topic_material,
                notes,
                duration_minutes,
                TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'DD Mon YYYY HH24:MI') AS waktu,
                TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS tanggal,
                TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI') AS jam
            FROM teacher_checkins
            ${whereClause}
            ORDER BY COALESCE(check_time, created_at) DESC
            LIMIT ?
        `;
        params.push(limit);

        const [rows] = await db.query(sql, params);
        if (!rows || rows.length === 0) {
            return res.json([]);
        }

        const teacherIds = [...new Set(rows.map(r => r.teacher_id).filter(Boolean))];
        const dates = [...new Set(rows.map(r => r.tanggal).filter(Boolean))];

        const sessionInfoMap = {};

        if (teacherIds.length > 0 && dates.length > 0) {
            const tPlaceholders = teacherIds.map(() => '?').join(',');
            const dPlaceholders = dates.map(() => '?').join(',');

            const [allDayEvents] = await db.query(`
                SELECT id, teacher_id, attendance_type, duration_minutes,
                       COALESCE(check_time, created_at) AS raw_time,
                       TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI') AS jam,
                       TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS tanggal
                FROM teacher_checkins
                WHERE teacher_id IN (${tPlaceholders})
                  AND TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') IN (${dPlaceholders})
                ORDER BY COALESCE(check_time, created_at) ASC
            `, [...teacherIds, ...dates]);

            // Group by teacher_id and tanggal
            const groups = {};
            (allDayEvents || []).forEach(e => {
                const key = `${e.teacher_id}_${e.tanggal}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(e);
            });

            Object.keys(groups).forEach(key => {
                const events = groups[key];
                let currentSessionNum = 0;
                let currentSessionCheckin = null;
                let currentSessionEvents = [];

                events.forEach(ev => {
                    if (ev.attendance_type === 'checkin_harian') {
                        if (currentSessionEvents.length > 0 && currentSessionCheckin) {
                            const prevCheckinJam = `${currentSessionCheckin.jam} WIB`;
                            currentSessionEvents.forEach(item => {
                                sessionInfoMap[item.id] = {
                                    session_number: Math.max(1, currentSessionNum),
                                    session_checkin_jam: prevCheckinJam,
                                    session_checkout_jam: null,
                                    session_duration_minutes: null,
                                    session_duration_text: null,
                                    session_status: 'Sesi Belum Check-out',
                                    is_active_session: false
                                };
                            });
                        }

                        currentSessionNum++;
                        currentSessionCheckin = ev;
                        currentSessionEvents = [ev];
                    } else if (ev.attendance_type === 'checkout_harian') {
                        currentSessionEvents.push(ev);
                        const checkinTime = currentSessionCheckin ? new Date(currentSessionCheckin.raw_time) : null;
                        const checkoutTime = new Date(ev.raw_time);
                        let durationMins = ev.duration_minutes;
                        if (durationMins === null || durationMins === undefined) {
                            if (checkinTime) {
                                durationMins = Math.max(0, Math.round((checkoutTime.getTime() - checkinTime.getTime()) / 60000));
                            }
                        }
                        const durationText = formatDurationIndonesian(durationMins);
                        const checkinJam = currentSessionCheckin ? `${currentSessionCheckin.jam} WIB` : '-';
                        const checkoutJam = `${ev.jam} WIB`;

                        currentSessionEvents.forEach(item => {
                            sessionInfoMap[item.id] = {
                                session_number: Math.max(1, currentSessionNum),
                                session_checkin_jam: checkinJam,
                                session_checkout_jam: checkoutJam,
                                session_duration_minutes: durationMins,
                                session_duration_text: durationText,
                                session_status: 'Selesai (Sudah Check-out)',
                                is_active_session: false
                            };
                        });

                        currentSessionCheckin = null;
                        currentSessionEvents = [];
                    } else {
                        // sesi_mengajar, izin, sakit
                        currentSessionEvents.push(ev);
                    }
                });

                // Finalize active session
                if (currentSessionEvents.length > 0 && currentSessionCheckin) {
                    const checkinJam = `${currentSessionCheckin.jam} WIB`;
                    const now = new Date();
                    const checkinTime = new Date(currentSessionCheckin.raw_time);
                    const runningMins = Math.max(0, Math.round((now.getTime() - checkinTime.getTime()) / 60000));
                    const durationText = formatDurationIndonesian(runningMins);

                    currentSessionEvents.forEach(item => {
                        sessionInfoMap[item.id] = {
                            session_number: Math.max(1, currentSessionNum),
                            session_checkin_jam: checkinJam,
                            session_checkout_jam: null,
                            session_duration_minutes: runningMins,
                            session_duration_text: durationText,
                            session_status: 'Aktif (Sedang Berlangsung)',
                            is_active_session: true
                        };
                    });
                }
            });
        }

        const enrichedRows = rows.map(r => {
            const sInfo = sessionInfoMap[r.id] || {
                session_number: 1,
                session_checkin_jam: r.attendance_type === 'checkin_harian' ? `${r.jam} WIB` : null,
                session_checkout_jam: r.attendance_type === 'checkout_harian' ? `${r.jam} WIB` : null,
                session_duration_minutes: r.duration_minutes || null,
                session_duration_text: r.duration_minutes ? formatDurationIndonesian(r.duration_minutes) : null,
                session_status: r.attendance_type === 'checkout_harian' ? 'Selesai (Sudah Check-out)' : '-',
                is_active_session: false
            };

            return {
                ...r,
                session_number: sInfo.session_number,
                session_checkin_jam: sInfo.session_checkin_jam,
                session_checkout_jam: sInfo.session_checkout_jam,
                session_duration_minutes: sInfo.session_duration_minutes,
                session_duration_text: sInfo.session_duration_text,
                session_status: sInfo.session_status,
                is_active_session: sInfo.is_active_session
            };
        });

        res.json(enrichedRows);
    } catch (err) {
        next(err);
    }
}

async function getAttendanceSummary(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').trim().toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('guru') || userRole.includes('teacher');
        const todayStr = getWIBDate();

        // Overall stats (WIB)
        const [[totalTeachersRow]] = await db.query("SELECT COUNT(*) AS total FROM teachers WHERE status != 'Nonaktif' AND status != 'Non-Aktif'");
        const [[todayCheckinsRow]] = await db.query("SELECT COUNT(DISTINCT teacher_id) AS total FROM teacher_checkins WHERE TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ? AND attendance_type = 'checkin_harian'", [todayStr]);
        const [[todaySessionsRow]] = await db.query("SELECT COUNT(*) AS total FROM teacher_checkins WHERE TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ? AND attendance_type = 'sesi_mengajar'", [todayStr]);
        const [[todayLeaveRow]] = await db.query("SELECT COUNT(DISTINCT teacher_id) AS total FROM teacher_checkins WHERE TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ? AND attendance_type IN ('izin', 'sakit')", [todayStr]);

        let teacherStats = null;
        const queryParams = req.query || {};
        const queryTeacherId = queryParams.teacher_id || '';
        const queryTeacherName = queryParams.teacher_name || '';

        if (isTeacher || queryTeacherId) {
            const uId = isTeacher ? (req.user.id || '') : queryTeacherId;
            const tId = isTeacher ? (req.user.teacher_id || '') : queryTeacherId;
            const tName = isTeacher ? (req.user.name || '').trim() : queryTeacherName.trim();

            const [myTodayCheckin] = await db.query(`
                SELECT id, attendance_type, status, duration_minutes,
                       COALESCE(check_time, created_at) AS raw_time,
                       TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI') AS jam
                FROM teacher_checkins
                WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
                  AND TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ?
                ORDER BY COALESCE(check_time, created_at) ASC
            `, [tId, uId, tName, todayStr]);

            const [[myMonthSessions]] = await db.query(`
                SELECT COUNT(*) AS total
                FROM teacher_checkins
                WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
                  AND attendance_type = 'sesi_mengajar'
                  AND EXTRACT(MONTH FROM (COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')) = EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'))
                  AND EXTRACT(YEAR FROM (COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')) = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'))
            `, [tId, uId, tName]);

            const [[myMonthDays]] = await db.query(`
                SELECT COUNT(DISTINCT TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD')) AS total
                FROM teacher_checkins
                WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
                  AND attendance_type IN ('checkin_harian', 'sesi_mengajar')
                  AND EXTRACT(MONTH FROM (COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')) = EXTRACT(MONTH FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'))
                  AND EXTRACT(YEAR FROM (COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta')) = EXTRACT(YEAR FROM (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta'))
            `, [tId, uId, tName]);

            const dailyLogs = myTodayCheckin.filter(c => 
                c.attendance_type === 'checkin_harian' || 
                c.attendance_type === 'checkout_harian' || 
                c.attendance_type === 'izin' || 
                c.attendance_type === 'sakit'
            );
            const lastDailyLog = dailyLogs.length > 0 ? dailyLogs[dailyLogs.length - 1] : null;
            const isCurrentlyCheckedIn = lastDailyLog && lastDailyLog.attendance_type === 'checkin_harian';
            const leaveRow = myTodayCheckin.find(c => c.attendance_type === 'izin' || c.attendance_type === 'sakit');
            const hasLeave = !!leaveRow;

            // Total menit kerja hari ini dari seluruh checkout yang sudah selesai
            let totalWorkMinutesToday = myTodayCheckin
                .filter(c => c.attendance_type === 'checkout_harian' && c.duration_minutes)
                .reduce((sum, c) => sum + (parseInt(c.duration_minutes, 10) || 0), 0);

            // Menit sesi aktif berjalan jika saat ini sedang checked in
            let currentActiveMinutes = 0;
            if (isCurrentlyCheckedIn && lastDailyLog) {
                const checkinTime = new Date(lastDailyLog.raw_time);
                const now = new Date();
                currentActiveMinutes = Math.max(0, Math.round((now.getTime() - checkinTime.getTime()) / (1000 * 60)));
                totalWorkMinutesToday += currentActiveMinutes;
            }

            const checkinCount = myTodayCheckin.filter(c => c.attendance_type === 'checkin_harian').length;
            const checkoutCount = myTodayCheckin.filter(c => c.attendance_type === 'checkout_harian').length;
            const lastCheckinRow = [...myTodayCheckin].reverse().find(c => c.attendance_type === 'checkin_harian');
            const lastCheckoutRow = [...myTodayCheckin].reverse().find(c => c.attendance_type === 'checkout_harian');

            const currentState = hasLeave 
                ? 'ON_LEAVE' 
                : (isCurrentlyCheckedIn ? 'CHECKED_IN' : (checkoutCount > 0 ? 'CHECKED_OUT' : 'NOT_CHECKED_IN'));

            teacherStats = {
                current_state: currentState,
                is_currently_checked_in: isCurrentlyCheckedIn,
                can_checkin: !isCurrentlyCheckedIn && !hasLeave,
                can_checkout: isCurrentlyCheckedIn,
                can_teach: isCurrentlyCheckedIn,
                has_checked_in_today: checkinCount > 0,
                has_checked_out_today: checkoutCount > 0,
                has_leave_today: hasLeave,
                checkin_count_today: checkinCount,
                checkout_count_today: checkoutCount,
                checkin_time: lastCheckinRow ? lastCheckinRow.jam : null,
                checkout_time: lastCheckoutRow ? lastCheckoutRow.jam : null,
                current_active_minutes: currentActiveMinutes,
                current_active_duration_text: formatDurationIndonesian(currentActiveMinutes),
                total_work_minutes_today: totalWorkMinutesToday,
                total_work_duration_text: formatDurationIndonesian(totalWorkMinutesToday),
                last_session_duration_minutes: lastCheckoutRow ? (lastCheckoutRow.duration_minutes || 0) : 0,
                last_session_duration_text: lastCheckoutRow && lastCheckoutRow.duration_minutes ? formatDurationIndonesian(lastCheckoutRow.duration_minutes) : null,
                leave_type: leaveRow ? leaveRow.attendance_type : null,
                today_logs: [...myTodayCheckin].reverse(),
                month_sessions: myMonthSessions ? myMonthSessions.total : 0,
                month_days_attended: myMonthDays ? myMonthDays.total : 0
            };
        }

        res.json({
            total_teachers: totalTeachersRow ? totalTeachersRow.total : 0,
            today_checkins: todayCheckinsRow ? todayCheckinsRow.total : 0,
            today_sessions: todaySessionsRow ? todaySessionsRow.total : 0,
            today_leave: todayLeaveRow ? todayLeaveRow.total : 0,
            teacher_stats: teacherStats
        });
    } catch (err) {
        next(err);
    }
}

async function getMyClassesToday(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').trim().toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('guru') || userRole.includes('teacher');
        const queryParams = req.query || {};
        
        let sql = 'SELECT id, nama, program, pengajar, teacher_id, hari, mulai, selesai, tipe, ruang FROM classes';
        let params = [];

        if (isTeacher || queryParams.teacher_id) {
            const uId = isTeacher ? (req.user.id || '') : (queryParams.teacher_id || '');
            const tId = isTeacher ? (req.user.teacher_id || '') : (queryParams.teacher_id || '');
            const tEmail = isTeacher ? ((req.user.email || '').trim().toLowerCase()) : '';
            const tName = isTeacher ? ((req.user.name || '').trim()) : ((queryParams.teacher_name || '').trim());

            sql += ' WHERE (teacher_id IS NOT NULL AND teacher_id != \'\' AND teacher_id = (SELECT teacher_id FROM users WHERE id = ? OR nis = ? LIMIT 1))' +
                   ' OR (teacher_id IS NOT NULL AND teacher_id = ?)' +
                   ' OR (teacher_id IS NOT NULL AND teacher_id IN (SELECT id FROM teachers WHERE LOWER(email) = LOWER(?)))' +
                   ' OR (LOWER(pengajar) = LOWER(?))' +
                   ' OR (pengajar ILIKE ?)';
            params.push(uId, uId, tId, tEmail, tName, `%${tName}%`);
        }

        sql += ' ORDER BY nama ASC';
        const [rows] = await db.query(sql, params);
        res.json(rows || []);
    } catch (err) {
        next(err);
    }
}

/**
 * Mengecek apakah suatu jadwal kelas aktif pada hari tertentu di KBEC
 * Menangani Serial 1 (Senin, Rabu, Jumat), Serial 2 (Selasa, Kamis, Sabtu),
 * Senin - Jumat, Setiap Hari, serta nama hari spesifik.
 */
function isClassScheduledOnDay(classHari, targetDateOrDay) {
    if (!classHari) return false;
    const h = String(classHari).toLowerCase().trim();

    let dayIdx = -1;
    let dayName = '';
    const DAY_NAMES = ['minggu', 'senin', 'selasa', 'rabu', 'kamis', 'jumat', 'sabtu'];

    if (typeof targetDateOrDay === 'number') {
        dayIdx = targetDateOrDay;
        dayName = DAY_NAMES[dayIdx] || '';
    } else if (typeof targetDateOrDay === 'string') {
        const clean = targetDateOrDay.toLowerCase().trim();
        if (clean.includes('-')) {
            // Format YYYY-MM-DD
            try {
                const parts = clean.split('-');
                const dObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
                dayIdx = dObj.getDay();
                dayName = DAY_NAMES[dayIdx];
            } catch (e) {
                dayIdx = new Date().getDay();
                dayName = DAY_NAMES[dayIdx];
            }
        } else {
            // Langsung nama hari (misal 'jumat' atau 'senin')
            dayName = clean;
            dayIdx = DAY_NAMES.indexOf(dayName);
        }
    } else {
        dayIdx = new Date().getDay();
        dayName = DAY_NAMES[dayIdx];
    }

    // 1. Serial 1: Senin (1), Rabu (3), Jumat (5)
    if (h.includes('serial 1')) {
        return dayIdx === 1 || dayIdx === 3 || dayIdx === 5;
    }

    // 2. Serial 2: Selasa (2), Kamis (4), Sabtu (6)
    if (h.includes('serial 2')) {
        return dayIdx === 2 || dayIdx === 4 || dayIdx === 6;
    }

    // 3. Rentang Senin - Jumat (misal kelas TK)
    if (h.includes('senin - jumat') || h.includes('senin-jumat') || h.includes('senin s/d jumat')) {
        return dayIdx >= 1 && dayIdx <= 5;
    }

    // 4. Rentang Senin - Sabtu
    if (h.includes('senin - sabtu') || h.includes('senin-sabtu') || h.includes('senin s/d sabtu')) {
        return dayIdx >= 1 && dayIdx <= 6;
    }

    // 5. Setiap Hari
    if (h.includes('setiap hari') || h.includes('daily')) {
        return true;
    }

    // 6. Weekend: Sabtu & Minggu
    if (h.includes('sabtu - minggu') || h.includes('weekend') || h.includes('sabtu & minggu')) {
        return dayIdx === 0 || dayIdx === 6;
    }

    // 7. Nama hari spesifik
    return dayName ? h.includes(dayName) : false;
}

/**
 * Menghitung ketepatan waktu check-in sesi mengajar pengajar
 * Toleransi: 10 - 15 Menit sesuai arahan Super Admin KBEC
 */
function calculatePunctuality(scheduledStart, actualTime) {
    if (!scheduledStart || !actualTime) {
        return {
            status: 'Belum Ada Jadwal / Absen',
            badge: 'slate',
            is_late: false,
            late_minutes: 0,
            diff_minutes: 0
        };
    }

    const parseMinutes = (timeStr) => {
        const parts = String(timeStr).trim().split(':');
        const h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        return h * 60 + m;
    };

    const schedM = parseMinutes(scheduledStart);
    const actualM = parseMinutes(actualTime);
    const diff = actualM - schedM;

    // Toleransi 10 - 15 Menit:
    // <= 10 menit: Tepat Waktu (Hijau)
    // 11 s/d 15 menit: Toleransi Keterlambatan (Kuning / Amber)
    // > 15 menit: Terlambat (Merah / Rose)
    if (diff <= 10) {
        return {
            status: 'Tepat Waktu',
            badge: 'green',
            is_late: false,
            late_minutes: 0,
            diff_minutes: diff,
            diff_text: diff <= 0 ? 'On-time' : `+${diff} mnt`
        };
    } else if (diff <= 15) {
        return {
            status: `Toleransi (Telat ${diff} mnt)`,
            badge: 'amber',
            is_late: false,
            late_minutes: diff,
            diff_minutes: diff,
            diff_text: `+${diff} mnt`
        };
    } else {
        return {
            status: `Telat ${diff} Menit ⚠️`,
            badge: 'rose',
            is_late: true,
            late_minutes: diff,
            diff_minutes: diff,
            diff_text: `+${diff} mnt`
        };
    }

}

/**
 * Mengevaluasi siswa bermasalah (jarang masuk / banyak alpha) di kelas pengajar
 */
function evaluateProblematicStudents(attendanceRecords) {
    if (!Array.isArray(attendanceRecords) || attendanceRecords.length === 0) return [];

    const studentMap = {};
    attendanceRecords.forEach(rec => {
        const sid = String(rec.student_id || rec.id || '').trim();
        if (!sid) return;

        if (!studentMap[sid]) {
            studentMap[sid] = {
                student_id: sid,
                student_name: rec.student_name || rec.nama || 'Siswa KBEC',
                kelas: rec.kelas || rec.class_name || '-',
                hadir_count: 0,
                izin_count: 0,
                sakit_count: 0,
                alpha_count: 0,
                total_recorded: 0
            };
        }

        const st = String(rec.status || '').toLowerCase().trim();
        studentMap[sid].total_recorded++;
        if (st.includes('hadir') || st === 'h') {
            studentMap[sid].hadir_count++;
        } else if (st.includes('izin') || st.includes('ijin') || st === 'i') {
            studentMap[sid].izin_count++;
        } else if (st.includes('sakit') || st === 's') {
            studentMap[sid].sakit_count++;
        } else if (st.includes('alpha') || st.includes('alpa') || st === 'a') {
            studentMap[sid].alpha_count++;
        }
    });

    const problematic = [];
    Object.values(studentMap).forEach(s => {
        const rate = s.total_recorded > 0 ? (s.hadir_count / s.total_recorded) * 100 : 100;
        let isProblematic = false;
        let reasons = [];

        if (s.alpha_count >= 3) {
            isProblematic = true;
            reasons.push(`${s.alpha_count}x Alpha (Tanpa Keterangan)`);
        }

        if (s.total_recorded >= 3 && rate < 75) {
            isProblematic = true;
            reasons.push(`Kehadiran Rendah (${Math.round(rate)}% - ${s.hadir_count} dari ${s.total_recorded})`);
        }

        if (isProblematic) {
            problematic.push({
                student_id: s.student_id,
                student_name: s.student_name,
                nama: s.student_name,
                kelas: s.kelas,
                hadir_count: s.hadir_count,
                alpha_count: s.alpha_count,
                total_recorded: s.total_recorded,
                attendance_rate: Math.round(rate),
                is_problematic: true,
                reason: reasons.join(' • ')
            });
        }
    });

    return problematic;
}

/**
 * Controller Endpoint Khusus Super Admin:
 * Pusat Audit & Pemantauan Kinerja Pengajar Terpadu
 */
async function getTeacherAuditMonitoring(req, res, next) {
    try {
        const targetDate = req.query.date || getWIBDate();
        const targetMonth = req.query.month || (targetDate ? targetDate.slice(0, 7) : getWIBMonth());
        const filterUnit = req.query.unit || 'all';
        const filterTeacherId = req.query.teacher_id || 'all';

        // 1. Ambil data semua guru aktif
        let teacherSql = "SELECT id, nama, email, kontak, expertise, joined, status, avatar FROM teachers WHERE status != 'Nonaktif' AND status != 'Non-Aktif'";
        let teacherParams = [];
        if (filterTeacherId && filterTeacherId !== 'all') {
            teacherSql += " AND id = ?";
            teacherParams.push(filterTeacherId);
        }
        teacherSql += " ORDER BY nama ASC";
        const [teachers] = await db.query(teacherSql, teacherParams);

        // 2. Ambil semua kelas
        let classSql = `
            SELECT c.id, c.nama, c.program, c.unit, c.pengajar, c.teacher_id, c.hari, c.mulai, c.selesai, c.tipe, c.ruang, 
                   COALESCE(cs.student_count, 0) AS terisi 
            FROM classes c 
            LEFT JOIN (SELECT class_id, COUNT(*) AS student_count FROM class_students GROUP BY class_id) cs ON c.id::text = cs.class_id::text
        `;
        let classParams = [];
        if (filterUnit && filterUnit !== 'all') {
            classSql += " WHERE c.unit ILIKE ? OR c.program ILIKE ?";
            classParams.push(`%${filterUnit}%`, `%${filterUnit}%`);
        }
        classSql += " ORDER BY c.nama ASC";
        const [classes] = await db.query(classSql, classParams);

        // 3. Mapping data siswa per kelas
        const [classStudentRows] = await db.query(`
            SELECT cs.class_id, cs.student_id, s.nama AS student_name, s.program, s.level, s.unit
            FROM class_students cs
            JOIN students s ON cs.student_id = s.id
        `);
        const classStudentsMap = {};
        (classStudentRows || []).forEach(r => {
            const cid = String(r.class_id);
            if (!classStudentsMap[cid]) classStudentsMap[cid] = [];
            classStudentsMap[cid].push(r);
        });

        // 4. Ambil log teacher_checkins pada tanggal yang dipilih
        const [checkinRows] = await db.query(`
            SELECT id, teacher_id, teacher_name, class_id, class_name, lat, lng,
                   distance_meters, is_online, status, attendance_type, proof_image,
                   topic_material, notes, duration_minutes,
                   TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'HH24:MI') AS jam,
                   TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') AS tanggal
            FROM teacher_checkins
            WHERE TO_CHAR((COALESCE(check_time, created_at) AT TIME ZONE 'Asia/Jakarta'), 'YYYY-MM-DD') = ?
            ORDER BY COALESCE(check_time, created_at) ASC
        `, [targetDate]);

        // 5. Ambil data attendance siswa dalam bulan terkait untuk deteksi siswa bermasalah & kesehatan kelas
        const [attendanceRows] = await db.query(`
            SELECT a.student_id, s.nama AS student_name, s.nama, a.status, a.kelas, 
                   TO_CHAR(a.tanggal::timestamp, 'YYYY-MM-DD') AS tanggal
            FROM attendance a
            LEFT JOIN students s ON a.student_id = s.id
            WHERE a.tanggal::text LIKE ?
        `, [`${targetMonth}-%`]);

        // 6. Ambil data evaluasi nilai siswa (student_grades) pada tanggal terpilih
        const [gradeRows] = await db.query(`
            SELECT sg.student_id, sg.class_name, sg.presensi, sg.sb_page, sg.wb_page, sg.grade, sg.lesson, sg.notes,
                   TO_CHAR(sg.tanggal::timestamp, 'YYYY-MM-DD') AS tanggal
            FROM student_grades sg
            WHERE sg.tanggal::text LIKE ?
        `, [`${targetDate}%`]);

        // Tentukan nama hari Bahasa Indonesia dari targetDate
        const INDO_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
        let dayName = '';
        try {
            const dateParts = targetDate.split('-');
            const dObj = new Date(parseInt(dateParts[0], 10), parseInt(dateParts[1], 10) - 1, parseInt(dateParts[2], 10));
            dayName = INDO_DAYS[dObj.getDay()];
        } catch (e) {
            dayName = 'Senin';
        }

        // Agregasi Data per Pengajar
        let totalPunctualCount = 0;
        let totalLateCount = 0;
        let totalClassesScheduled = 0;
        let totalClassesCompleted = 0;
        let totalGradingFull = 0;
        let totalProblematicStudentsGlobal = 0;

        const teacherAuditList = teachers.map(teacher => {
            const tId = teacher.id;
            const tName = teacher.nama || '';
            const tNameLower = tName.toLowerCase();

            // Saring checkins guru ini hari ini
            const myCheckins = checkinRows.filter(c => 
                c.teacher_id === tId || 
                (c.teacher_name && c.teacher_name.toLowerCase().includes(tNameLower))
            );

            const checkinHarian = myCheckins.find(c => c.attendance_type === 'checkin_harian');
            const checkoutHarian = [...myCheckins].reverse().find(c => c.attendance_type === 'checkout_harian');
            const leaveRecord = myCheckins.find(c => c.attendance_type === 'izin' || c.attendance_type === 'sakit');
            const teachingSessions = myCheckins.filter(c => c.attendance_type === 'sesi_mengajar');

            // Hitung status kehadiran guru
            let attendanceStatus = 'Belum Hadir';
            let attendanceBadge = 'slate';
            let workDurationText = '-';

            if (leaveRecord) {
                attendanceStatus = leaveRecord.attendance_type === 'izin' ? 'Izin Resmi' : 'Sakit (Surat Dokter)';
                attendanceBadge = 'amber';
            } else if (checkinHarian && checkoutHarian) {
                attendanceStatus = 'Hadir (Sudah Check-out)';
                attendanceBadge = 'green';
                const totalMins = myCheckins
                    .filter(c => c.attendance_type === 'checkout_harian' && c.duration_minutes)
                    .reduce((sum, c) => sum + (parseInt(c.duration_minutes, 10) || 0), 0);
                workDurationText = formatDurationIndonesian(totalMins);
            } else if (checkinHarian) {
                attendanceStatus = 'Hadir (Aktif Mengajar)';
                attendanceBadge = 'blue';
                workDurationText = 'Sedang Berlangsung';
            }

            // Cari kelas-kelas yang diampu oleh pengajar ini
            const myAssignedClasses = classes.filter(c => 
                (c.teacher_id && c.teacher_id === tId) || 
                (c.pengajar && c.pengajar.toLowerCase().includes(tNameLower))
            );

            // Saring kelas yang dijadwalkan HARI INI (Mendukung Serial 1, Serial 2, Senin-Jumat, dsb)
            const scheduledToday = myAssignedClasses.filter(c => 
                c.hari && isClassScheduledOnDay(c.hari, targetDate)
            );

            totalClassesScheduled += scheduledToday.length;

            // Evaluasi setiap kelas hari ini
            const classAuditDetails = scheduledToday.map(cls => {
                const clsCleanName = (cls.nama || '').toLowerCase().replace(/&amp;/g, '&');
                const sessionCheckin = teachingSessions.find(s => 
                    String(s.class_id) === String(cls.id) || 
                    (s.class_name && s.class_name.toLowerCase().replace(/&amp;/g, '&') === clsCleanName)
                );

                const isTaught = !!sessionCheckin;
                if (isTaught) totalClassesCompleted++;

                const punctuality = isTaught 
                    ? calculatePunctuality(cls.mulai, sessionCheckin.jam)
                    : { status: 'Belum Dilaksanakan', badge: 'slate', is_late: false, late_minutes: 0 };

                if (isTaught) {
                    if (punctuality.is_late) {
                        totalLateCount++;
                    } else {
                        totalPunctualCount++;
                    }
                }

                // Cek kepatuhan input evaluasi siswa untuk kelas ini
                const enrolledStudents = classStudentsMap[String(cls.id)] || [];
                const enrolledStudentIds = enrolledStudents.map(s => String(s.student_id));
                const studentCount = enrolledStudents.length;

                // Hanya Unit KBEC yang mewajibkan input lembar evaluasi SB/WB
                const usesSBWB = isUnitUsingSBWB(cls.unit, cls.program);

                let evalCount = 0;
                let gradingStatus = 'Belum Diinput (0%)';
                let gradingBadge = 'rose';

                if (!usesSBWB) {
                    // Unit non-KBEC (TK, Bimbel, Calistung, Arabin): Cukup presensi biasa
                    const attendedInClass = attendanceRows.filter(a => {
                        const aDate = a.tanggal ? String(a.tanggal).slice(0, 10) : '';
                        const aClass = (a.kelas || '').toLowerCase().replace(/&amp;/g, '&');
                        return aDate === targetDate && (
                            (aClass && aClass === clsCleanName) ||
                            enrolledStudentIds.includes(String(a.student_id))
                        );
                    });

                    if (studentCount === 0) {
                        gradingStatus = 'Tidak Ada Siswa';
                        gradingBadge = 'slate';
                        evalCount = 0;
                    } else if (isTaught || attendedInClass.length >= studentCount) {
                        gradingStatus = 'Lengkap (Presensi Reguler)';
                        gradingBadge = 'green';
                        evalCount = studentCount;
                        totalGradingFull++;
                    } else if (attendedInClass.length > 0) {
                        gradingStatus = `Sebagian (${Math.round((attendedInClass.length / studentCount) * 100)}%)`;
                        gradingBadge = 'amber';
                        evalCount = attendedInClass.length;
                    } else {
                        gradingStatus = 'Presensi Belum Diisi';
                        gradingBadge = 'slate';
                        evalCount = 0;
                    }
                } else {
                    // Unit KBEC: Wajib evaluasi lembar kerja siswa (SB/WB)
                    const evaluatedInClass = gradeRows.filter(g => 
                        (g.class_name && g.class_name.toLowerCase().replace(/&amp;/g, '&') === clsCleanName) ||
                        enrolledStudentIds.includes(String(g.student_id))
                    );
                    evalCount = evaluatedInClass.length;

                    if (studentCount === 0) {
                        gradingStatus = 'Tidak Ada Siswa';
                        gradingBadge = 'slate';
                    } else if (evalCount >= studentCount) {
                        gradingStatus = 'Lengkap (100%)';
                        gradingBadge = 'green';
                        totalGradingFull++;
                    } else if (evalCount > 0) {
                        gradingStatus = `Sebagian (${Math.round((evalCount / studentCount) * 100)}%)`;
                        gradingBadge = 'amber';
                    }
                }

                return {
                    class_id: cls.id,
                    class_name: cls.nama,
                    program: cls.program || cls.unit || '-',
                    unit: cls.unit || (usesSBWB ? 'KBEC' : 'Reguler'),
                    uses_sb_wb: usesSBWB,
                    room: cls.ruang || '-',
                    scheduled_time: `${cls.mulai || '08:00'} - ${cls.selesai || '09:30'}`,
                    is_taught: isTaught,
                    checkin_time: sessionCheckin ? `${sessionCheckin.jam} WIB` : '-',
                    punctuality_status: punctuality.status,
                    punctuality_badge: punctuality.badge,
                    is_late: punctuality.is_late,
                    late_minutes: punctuality.late_minutes,
                    topic_material: sessionCheckin ? (sessionCheckin.topic_material || '-') : '-',
                    proof_image: sessionCheckin ? sessionCheckin.proof_image : null,
                    is_online: sessionCheckin ? sessionCheckin.is_online : 0,
                    students_count: studentCount,
                    evaluated_count: evalCount,
                    grading_status: gradingStatus,
                    grading_badge: gradingBadge
                };
            });

            // Evaluasi Seluruh Siswa & Deteksi Siswa Bermasalah di kelas pengajar ini
            const allMyClassNames = myAssignedClasses.map(c => (c.nama || '').toLowerCase().replace(/&amp;/g, '&'));
            const allMyStudentIds = [];
            myAssignedClasses.forEach(cls => {
                const st = classStudentsMap[String(cls.id)] || [];
                st.forEach(s => allMyStudentIds.push(String(s.student_id)));
            });

            const relevantAttendance = attendanceRows.filter(a => {
                const aClass = (a.kelas || '').toLowerCase().replace(/&amp;/g, '&');
                return allMyStudentIds.includes(String(a.student_id)) ||
                       (aClass && allMyClassNames.includes(aClass));
            });

            const problematicStudents = evaluateProblematicStudents(relevantAttendance);
            totalProblematicStudentsGlobal += problematicStudents.length;

            const totalHadirStudents = relevantAttendance.filter(a => String(a.status || '').toLowerCase().includes('hadir')).length;
            const studentAttendanceRate = relevantAttendance.length > 0 
                ? Math.round((totalHadirStudents / relevantAttendance.length) * 100) 
                : 100;

            // Hitung Skor Kinerja Objektif (0 - 100)
            let sKehadiran = checkinHarian ? 100 : (leaveRecord ? 80 : 0);
            
            let sKetepatan = 100;
            const taughtClasses = classAuditDetails.filter(c => c.is_taught);
            if (taughtClasses.length > 0) {
                const lateClasses = taughtClasses.filter(c => c.is_late);
                const avgLateMins = lateClasses.reduce((sum, c) => sum + c.late_minutes, 0) / (lateClasses.length || 1);
                if (lateClasses.length > 0) {
                    sKetepatan = Math.max(30, 100 - (lateClasses.length * 20) - Math.round(avgLateMins));
                }
            } else if (scheduledToday.length > 0 && !leaveRecord) {
                sKetepatan = 50;
            }

            let sRealisasi = scheduledToday.length > 0 
                ? Math.round((taughtClasses.length / scheduledToday.length) * 100) 
                : 100;

            let sGrading = 100;
            if (taughtClasses.length > 0) {
                const totalStudentsToGrade = taughtClasses.reduce((sum, c) => sum + c.students_count, 0);
                const totalGraded = taughtClasses.reduce((sum, c) => sum + c.evaluated_count, 0);
                sGrading = totalStudentsToGrade > 0 ? Math.round((totalGraded / totalStudentsToGrade) * 100) : 100;
            }

            let overallScore = Math.round(
                (sKehadiran * 0.30) + 
                (sKetepatan * 0.25) + 
                (sRealisasi * 0.25) + 
                (sGrading * 0.20)
            );

            // Penyesuaian jika ada siswa bermasalah yang menonjol
            if (problematicStudents.length >= 3) {
                overallScore = Math.max(40, overallScore - 5);
            }

            let kpiGrade = 'A';
            if (overallScore >= 90) kpiGrade = 'A';
            else if (overallScore >= 75) kpiGrade = 'B';
            else if (overallScore >= 60) kpiGrade = 'C';
            else kpiGrade = 'D';

            return {
                teacher_id: tId,
                name: tName,
                email: teacher.email || '-',
                kontak: teacher.kontak || '-',
                avatar: teacher.avatar || null,
                status_kontrak: teacher.status || 'Aktif',
                joined: teacher.joined || '-',
                expertise: JSON.parse(teacher.expertise || '[]'),
                daily_attendance: {
                    status: attendanceStatus,
                    badge: attendanceBadge,
                    checkin_time: checkinHarian ? `${checkinHarian.jam} WIB` : '-',
                    checkout_time: checkoutHarian ? `${checkoutHarian.jam} WIB` : '-',
                    work_duration: workDurationText,
                    gps_radius_meters: checkinHarian ? Math.round(checkinHarian.distance_meters) : null,
                    gps_is_valid: checkinHarian ? checkinHarian.distance_meters <= KBEC_ALLOWED_RADIUS : true,
                    proof_image: checkinHarian ? checkinHarian.proof_image : null
                },
                classes_summary: {
                    total_assigned: myAssignedClasses.length,
                    scheduled_today_count: scheduledToday.length,
                    completed_today_count: taughtClasses.length,
                    fulfillment_rate: scheduledToday.length > 0 ? Math.round((taughtClasses.length / scheduledToday.length) * 100) : 100,
                    details: classAuditDetails
                },
                student_health: {
                    attendance_rate: studentAttendanceRate,
                    total_records_month: relevantAttendance.length,
                    problematic_count: problematicStudents.length,
                    has_problematic_students: problematicStudents.length > 0,
                    problematic_students: problematicStudents
                },
                kpi_score: {
                    overall: overallScore,
                    grade: kpiGrade,
                    breakdown: {
                        kehadiran: sKehadiran,
                        ketepatan: sKetepatan,
                        realisasi: sRealisasi,
                        grading: sGrading
                    }
                }
            };
        });

        const totalTeachers = teachers.length;
        const presentCount = teacherAuditList.filter(t => t.daily_attendance.badge === 'green' || t.daily_attendance.badge === 'blue').length;
        const onTimeRate = (totalPunctualCount + totalLateCount) > 0 
            ? Math.round((totalPunctualCount / (totalPunctualCount + totalLateCount)) * 100) 
            : 100;
        const classFulfillmentRate = totalClassesScheduled > 0 
            ? Math.round((totalClassesCompleted / totalClassesScheduled) * 100) 
            : 100;

        res.json({
            success: true,
            date: targetDate,
            month: targetMonth,
            day_name: dayName,
            summary: {
                total_teachers: totalTeachers,
                teachers_present: presentCount,
                attendance_rate: totalTeachers > 0 ? Math.round((presentCount / totalTeachers) * 100) : 0,
                total_classes_scheduled: totalClassesScheduled,
                total_classes_completed: totalClassesCompleted,
                class_fulfillment_rate: classFulfillmentRate,
                punctuality_rate: onTimeRate,
                total_problematic_students: totalProblematicStudentsGlobal
            },
            teachers: teacherAuditList
        });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    getTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    checkinTeacher,
    getCheckinLogs,
    getAttendanceSummary,
    getMyClassesToday,
    calculatePunctuality,
    isClassScheduledOnDay,
    evaluateProblematicStudents,
    getTeacherAuditMonitoring
};

