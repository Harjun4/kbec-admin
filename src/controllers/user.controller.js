const db = require('../config/db');
const { hashPassword } = require('./auth.controller');
const { generateUniqueUserId, escapeHTML } = require('../utils/helpers');
const bcrypt = require('bcrypt');

async function ensureTeacherProfile(userIdOrNis, role, status, emailInput, nameInput) {
    if (role !== 'Pengajar' || (status && status !== 'Approved')) return null;

    try {
        const [[user]] = await db.query('SELECT * FROM users WHERE id = ? OR nis = ?', [userIdOrNis, userIdOrNis]);
        const email = (emailInput || (user ? user.email : '') || '').trim();
        const name = (nameInput || (user ? user.name : '') || '').trim();

        if (!email && !name) return null;

        const [[existingTeacher]] = await db.query(
            'SELECT id FROM teachers WHERE (email IS NOT NULL AND email != \'\' AND LOWER(email) = LOWER(?)) OR (nama IS NOT NULL AND LOWER(nama) = LOWER(?))',
            [email, name]
        );

        if (existingTeacher) {
            await db.query('UPDATE users SET teacher_id = ? WHERE id = ? OR nis = ?', [existingTeacher.id, userIdOrNis, userIdOrNis]);
            return existingTeacher.id;
        }

        const randNum = Math.floor(100 + Math.random() * 900);
        const newTeacherId = `KBEC-T${randNum}`;
        const defaultExpertise = JSON.stringify(["Umum"]);
        const defaultAvatar = 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150';

        await db.query(
            'INSERT INTO teachers (id, nama, email, kontak, expertise, status, joined, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
                newTeacherId,
                name ? name : 'Pengajar KBEC',
                email,
                '',
                defaultExpertise,
                'Aktif',
                'Jan 2026',
                defaultAvatar
            ]
        );

        await db.query('UPDATE users SET teacher_id = ? WHERE id = ? OR nis = ?', [newTeacherId, userIdOrNis, userIdOrNis]);
        return newTeacherId;
    } catch (err) {
        console.error('Error ensuring teacher profile:', err);
        return null;
    }
}

async function getSelfProfile(req, res, next) {
    try {
        const userId = req.user.id;
        const [[user]] = await db.query('SELECT id, nis, name, email, role, status, teacher_id FROM users WHERE id = ? OR nis = ?', [userId, userId]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }
        res.json({ success: true, user });
    } catch (err) {
        next(err);
    }
}

async function updateSelfProfile(req, res, next) {
    try {
        const userId = req.user.id;
        const { name, email, phone } = req.body;

        if (!name || !email) {
            return res.status(400).json({ success: false, message: 'Nama dan email wajib diisi.' });
        }

        await db.query('UPDATE users SET name = ?, email = ? WHERE id = ? OR nis = ?', [escapeHTML(name.trim()), email.trim(), userId, userId]);

        if (req.user.teacher_id) {
            await db.query('UPDATE teachers SET nama = ?, email = ? WHERE id = ?', [escapeHTML(name.trim()), email.trim(), req.user.teacher_id]);
        }

        res.json({
            success: true,
            message: 'Profil pribadi berhasil diperbarui.',
            user: { ...req.user, name: escapeHTML(name.trim()), email: email.trim() }
        });
    } catch (err) {
        next(err);
    }
}

async function getNextId(req, res, next) {
    try {
        const { role } = req.query;
        const nextId = await generateUniqueUserId(db, role || 'Admin');
        res.json({ success: true, nextId });
    } catch (err) {
        next(err);
    }
}

async function getAllUsers(req, res, next) {
    try {
        const [rows] = await db.query('SELECT id, nis, name, email, role, status, teacher_id, created_at FROM users ORDER BY id ASC');
        const formatted = rows.map(r => ({
            ...r,
            nis: r.nis || r.id,
            status: r.status || 'Approved'
        }));
        res.json(formatted);
    } catch (err) {
        next(err);
    }
}

async function approveUser(req, res, next) {
    const { id } = req.params;
    const { status, role, teacher_id, teacher_data } = req.body;

    if (!status || !role) {
        return res.status(400).json({ success: false, message: 'Status dan role wajib ditentukan.' });
    }

    try {
        const [[user]] = await db.query('SELECT * FROM users WHERE id = ? OR nis = ?', [id, id]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'Pengguna tidak ditemukan.' });
        }

        let assignedTeacherId = teacher_id || user.teacher_id || null;

        if (role === 'Pengajar' && status === 'Approved') {
            if (teacher_id) {
                assignedTeacherId = teacher_id;
                await db.query('UPDATE teachers SET email = ? WHERE id = ? AND (email IS NULL OR email = \'\')', [user.email, teacher_id]);
            } else if (teacher_data && teacher_data.nama) {
                const randNum = Math.floor(100 + Math.random() * 900);
                const newTeacherId = `KBEC-T${randNum}`;
                const expertiseStr = JSON.stringify(teacher_data.expertise || ["Umum"]);
                const finalAvatar = teacher_data.avatar || 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150';

                await db.query(
                    'INSERT INTO teachers (id, nama, email, kontak, expertise, status, joined, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [
                        newTeacherId,
                        escapeHTML(teacher_data.nama.trim()),
                        user.email,
                        escapeHTML(teacher_data.kontak || ''),
                        expertiseStr,
                        teacher_data.status || 'Aktif',
                        teacher_data.joined || 'Jan 2026',
                        finalAvatar
                    ]
                );
                assignedTeacherId = newTeacherId;
            } else {
                assignedTeacherId = await ensureTeacherProfile(id, role, status, user.email, user.name);
            }
        }

        await db.query(
            'UPDATE users SET status = ?, role = ?, teacher_id = ? WHERE id = ? OR nis = ?',
            [status, role, assignedTeacherId, id, id]
        );

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Super Admin',
                action: `Persetujuan User (${user ? user.name : id} - ${role})`,
                status: status || 'Approved'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.json({ success: true, message: 'Status dan role pengguna berhasil diperbarui!', teacher_id: assignedTeacherId });
    } catch (err) {
        next(err);
    }
}

async function createUser(req, res, next) {
    const { id, nis, name, email, password, role } = req.body;
    if (!name || !name.trim() || !email || !email.trim()) {
        return res.status(400).json({ success: false, message: 'Nama dan email wajib diisi.' });
    }
    const selectedRole = role || 'Admin';
    const finalNis = (nis && nis.trim()) ? nis.trim() : ((id && id.trim()) ? id.trim() : await generateUniqueUserId(db, selectedRole));
    const finalId = finalNis;
    const cleanEmail = email.trim();
    const passwordHashed = await hashPassword(password || '123456');

    try {
        const [existing] = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?) OR id = ? OR nis = ?', [cleanEmail, finalId, finalNis]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email atau NIS sudah terdaftar dalam sistem.' });
        }

        await db.query(
            'INSERT INTO users (id, nis, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [finalId, finalNis, escapeHTML(name.trim()), cleanEmail, passwordHashed, selectedRole, 'Approved']
        );

        if (selectedRole === 'Pengajar') {
            await ensureTeacherProfile(finalId, selectedRole, 'Approved', cleanEmail, escapeHTML(name.trim()));
        }

        try {
            const { createActivityLog } = require('../utils/logger');
            createActivityLog({
                user_name: (req.user && req.user.name) || 'Super Admin',
                action: `Tambah User Baru (${escapeHTML(name.trim())} - ${selectedRole})`,
                status: 'Berhasil'
            }).catch(err => console.error('[LOGGER NON-BLOCKING ERR]:', err.message));
        } catch (lErr) {}

        res.status(201).json({ success: true, id: finalId, nis: finalNis, name: escapeHTML(name.trim()), email: cleanEmail, role: selectedRole });
    } catch (err) {
        next(err);
    }
}

async function updateUser(req, res, next) {
    const { id } = req.params;
    const { nis, name, email, role, password, status } = req.body;
    try {
        const cleanName = name ? escapeHTML(name.trim()) : '';
        const cleanEmail = email ? email.trim() : '';
        const selectedRole = role || 'Admin';
        const finalNis = nis ? nis.trim() : id;
        const finalStatus = status || 'Approved';

        if (password && password.trim()) {
            const passwordHashed = await hashPassword(password.trim());
            await db.query(
                'UPDATE users SET nis = ?, name = ?, email = ?, role = ?, status = ?, password = ? WHERE id = ? OR nis = ?',
                [finalNis, cleanName, cleanEmail, selectedRole, finalStatus, passwordHashed, id, id]
            );
        } else {
            await db.query(
                'UPDATE users SET nis = ?, name = ?, email = ?, role = ?, status = ? WHERE id = ? OR nis = ?',
                [finalNis, cleanName, cleanEmail, selectedRole, finalStatus, id, id]
            );
        }

        if (selectedRole === 'Pengajar' && finalStatus === 'Approved') {
            await ensureTeacherProfile(id, selectedRole, finalStatus, cleanEmail, cleanName);
        }

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function deleteUser(req, res, next) {
    const { id } = req.params;
    try {
        await db.query('DELETE FROM users WHERE id = ? OR nis = ?', [id, id]);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    ensureTeacherProfile,
    getSelfProfile,
    updateSelfProfile,
    getNextId,
    getAllUsers,
    approveUser,
    createUser,
    updateUser,
    deleteUser
};
