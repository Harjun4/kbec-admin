const db = require('../config/db');
const { escapeHTML } = require('../utils/helpers');

const KBEC_LAT = -7.8123;
const KBEC_LNG = 112.0123;

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

        if (type === 'izin') {
            status = 'Izin';
        } else if (type === 'sakit') {
            status = 'Sakit';
        } else if (type === 'checkout_harian') {
            status = 'Check-out (Selesai)';
            if (!is_online && lat && lng) {
                distanceMeters = calculateHaversineDistance(parseFloat(lat), parseFloat(lng), KBEC_LAT, KBEC_LNG);
            }
        } else {
            // checkin_harian atau sesi_mengajar
            if (!is_online && lat && lng) {
                distanceMeters = calculateHaversineDistance(parseFloat(lat), parseFloat(lng), KBEC_LAT, KBEC_LNG);
                if (distanceMeters > 100) {
                    isValid = false;
                    status = `Hadir (Luar Radius - ${Math.round(distanceMeters)}m)`;
                } else {
                    status = 'Terverifikasi (Hadir)';
                }
            } else if (is_online) {
                status = 'Terverifikasi (Online)';
            } else {
                status = 'Hadir (Tanpa GPS)';
            }
        }

        const querySql = `
            INSERT INTO teacher_checkins (
                teacher_id, teacher_name, class_id, class_name, lat, lng,
                distance_meters, is_online, status, attendance_type,
                proof_image, topic_material, notes, check_time
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
            escapeHTML(notes || '')
        ]);

        let message = 'Presensi berhasil dicatat.';
        if (type === 'checkin_harian') {
            message = isValid ? 'Check-in datang harian berhasil terverifikasi.' : `Check-in tercatat di luar radius KBEC (${Math.round(distanceMeters)} meter).`;
        } else if (type === 'checkout_harian') {
            message = 'Check-out pulang harian berhasil dicatat.';
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

        // Filter by date range or single date
        if (req.query.date) {
            conditions.push("TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD') = ?");
            params.push(req.query.date);
        } else {
            if (req.query.startDate) {
                conditions.push("COALESCE(check_time, created_at)::date >= ?::date");
                params.push(req.query.startDate);
            }
            if (req.query.endDate) {
                conditions.push("COALESCE(check_time, created_at)::date <= ?::date");
                params.push(req.query.endDate);
            }
        }

        // Filter by month & year
        if (req.query.month && req.query.year) {
            conditions.push("EXTRACT(MONTH FROM COALESCE(check_time, created_at)) = ? AND EXTRACT(YEAR FROM COALESCE(check_time, created_at)) = ?");
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
                TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'DD Mon YYYY HH24:MI') AS waktu,
                TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD') AS tanggal,
                TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'HH24:MI') AS jam
            FROM teacher_checkins
            ${whereClause}
            ORDER BY COALESCE(check_time, created_at) DESC
            LIMIT ?
        `;
        params.push(limit);

        const [rows] = await db.query(sql, params);
        res.json(rows || []);
    } catch (err) {
        next(err);
    }
}

async function getAttendanceSummary(req, res, next) {
    try {
        const userRole = (req.user && req.user.role ? req.user.role : '').trim().toLowerCase();
        const isTeacher = userRole.includes('pengajar') || userRole.includes('guru') || userRole.includes('teacher');
        const todayStr = new Date().toISOString().split('T')[0];

        // Overall stats
        const [[totalTeachersRow]] = await db.query("SELECT COUNT(*) AS total FROM teachers WHERE status != 'Nonaktif' AND status != 'Non-Aktif'");
        const [[todayCheckinsRow]] = await db.query("SELECT COUNT(DISTINCT teacher_id) AS total FROM teacher_checkins WHERE TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD') = ? AND attendance_type = 'checkin_harian'", [todayStr]);
        const [[todaySessionsRow]] = await db.query("SELECT COUNT(*) AS total FROM teacher_checkins WHERE TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD') = ? AND attendance_type = 'sesi_mengajar'", [todayStr]);
        const [[todayLeaveRow]] = await db.query("SELECT COUNT(DISTINCT teacher_id) AS total FROM teacher_checkins WHERE TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD') = ? AND attendance_type IN ('izin', 'sakit')", [todayStr]);

        let teacherStats = null;
        if (isTeacher) {
            const uId = req.user.id || '';
            const tId = req.user.teacher_id || '';
            const tName = (req.user.name || '').trim();

            const [myTodayCheckin] = await db.query(`
                SELECT id, attendance_type, status, TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'HH24:MI') AS jam
                FROM teacher_checkins
                WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
                  AND TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD') = ?
                ORDER BY COALESCE(check_time, created_at) DESC
            `, [tId, uId, tName, todayStr]);

            const [[myMonthSessions]] = await db.query(`
                SELECT COUNT(*) AS total
                FROM teacher_checkins
                WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
                  AND attendance_type = 'sesi_mengajar'
                  AND EXTRACT(MONTH FROM COALESCE(check_time, created_at)) = EXTRACT(MONTH FROM CURRENT_DATE)
                  AND EXTRACT(YEAR FROM COALESCE(check_time, created_at)) = EXTRACT(YEAR FROM CURRENT_DATE)
            `, [tId, uId, tName]);

            const [[myMonthDays]] = await db.query(`
                SELECT COUNT(DISTINCT TO_CHAR(COALESCE(check_time, created_at)::timestamp, 'YYYY-MM-DD')) AS total
                FROM teacher_checkins
                WHERE (teacher_id = ? OR teacher_id = ? OR LOWER(teacher_name) = LOWER(?))
                  AND attendance_type IN ('checkin_harian', 'sesi_mengajar')
                  AND EXTRACT(MONTH FROM COALESCE(check_time, created_at)) = EXTRACT(MONTH FROM CURRENT_DATE)
                  AND EXTRACT(YEAR FROM COALESCE(check_time, created_at)) = EXTRACT(YEAR FROM CURRENT_DATE)
            `, [tId, uId, tName]);

            teacherStats = {
                has_checked_in_today: myTodayCheckin.some(c => c.attendance_type === 'checkin_harian'),
                has_checked_out_today: myTodayCheckin.some(c => c.attendance_type === 'checkout_harian'),
                today_logs: myTodayCheckin,
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
        
        let sql = 'SELECT id, nama, program, pengajar, teacher_id, hari, mulai, selesai, tipe, ruang FROM classes';
        let params = [];

        if (isTeacher) {
            const uId = req.user.id || '';
            const tId = req.user.teacher_id || '';
            const tEmail = (req.user.email || '').trim().toLowerCase();
            const tName = (req.user.name || '').trim();

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
