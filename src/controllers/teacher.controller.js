const db = require('../config/db');
const { escapeHTML, getWIBDate, getWIBMonth } = require('../utils/helpers');

// Koordinat Resmi Yayasan Ar-Rasyid Bintaro — KBEC Jakarta (https://maps.app.goo.gl/gjiAmuJcTriC3VX49)
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
        const formatted = rows.map(r => ({
            ...r,
            expertise: JSON.parse(r.expertise || '[]')
        }));
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

module.exports = {
    getTeachers,
    createTeacher,
    updateTeacher,
    deleteTeacher,
    checkinTeacher,
    getCheckinLogs,
    getAttendanceSummary,
    getMyClassesToday
};
