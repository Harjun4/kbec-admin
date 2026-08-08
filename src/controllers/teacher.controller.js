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
    const { nama, email, kontak, expertise, joined, status } = req.body;
    try {
        const expertiseStr = JSON.stringify(expertise || []);
        await db.query(
            'UPDATE teachers SET nama = ?, email = ?, kontak = ?, expertise = ?, joined = ?, status = ? WHERE id = ?',
            [escapeHTML(nama), escapeHTML(email), escapeHTML(kontak), expertiseStr, escapeHTML(joined), escapeHTML(status), id]
        );
        res.json({ success: true });
    } catch (err) {
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
    const teacher_id = req.body.teacher_id || req.user.id || req.user.nis;
    const teacher_name = req.body.teacher_name || req.user.name;
    const { class_id, class_name, lat, lng, is_online } = req.body;

    if (!teacher_id || !teacher_name) {
        return res.status(400).json({ success: false, message: 'ID dan Nama Pengajar wajib disertakan.' });
    }

    try {
        let distanceMeters = 0;
        let isValid = true;
        let status = 'Terverifikasi (Hadir)';

        if (!is_online && lat && lng) {
            distanceMeters = calculateHaversineDistance(parseFloat(lat), parseFloat(lng), KBEC_LAT, KBEC_LNG);
            if (distanceMeters > 100) {
                isValid = false;
                status = `Gagal - Jarak GPS ${Math.round(distanceMeters)}m (>100m)`;
            }
        } else if (is_online) {
            status = 'Terverifikasi (Online)';
        }

        await db.query(
            'INSERT INTO teacher_checkins (teacher_id, teacher_name, class_id, class_name, lat, lng, distance_meters, is_online, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [teacher_id, escapeHTML(teacher_name), class_id || null, escapeHTML(class_name || 'Tatap Muka'), lat || 0, lng || 0, distanceMeters, is_online ? 1 : 0, status]
        );

        res.json({
            success: isValid,
            status,
            distance_meters: Math.round(distanceMeters),
            message: isValid ? 'Check-in GPS pengajar berhasil terverifikasi.' : `Lokasi Anda terlalu jauh dari lokasi KBEC (${Math.round(distanceMeters)} meter).`
        });
    } catch (err) {
        next(err);
    }
}

async function getCheckinLogs(req, res, next) {
    try {
        const [rows] = await db.query("SELECT id, teacher_id, teacher_name, class_name, lat, lng, distance_meters, is_online, status, TO_CHAR(created_at::timestamp, 'DD Mon YYYY HH24:MI') AS waktu FROM teacher_checkins ORDER BY id DESC LIMIT 100");
        res.json(rows);
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
    getCheckinLogs
};
