const db = require('../config/db');
const { generateToken, requireAuth, requireRole } = require('../middlewares/auth.middleware');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { generateUniqueUserId } = require('../utils/helpers');

async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

function hashHmacLegacy(password) {
    const salt = process.env.PASSWORD_SALT;
    if (!salt) throw new Error('PASSWORD_SALT environment variable is required');
    return crypto.createHmac('sha256', salt).update(password).digest('hex');
}

async function verifyPassword(inputPassword, storedPasswordHash) {
    if (!storedPasswordHash) return false;
    if (storedPasswordHash.startsWith('$2a$') || storedPasswordHash.startsWith('$2b$') || storedPasswordHash.startsWith('$2y$')) {
        return await bcrypt.compare(inputPassword, storedPasswordHash);
    }
    const legacyHmac = hashHmacLegacy(inputPassword);
    return storedPasswordHash === legacyHmac;
}

async function login(req, res) {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ success: false, message: 'Email dan password wajib diisi.' });
    }

    try {
        const cleanEmail = email.trim();
        const [users] = await db.query('SELECT * FROM users WHERE email = ? OR nis = ? OR id = ?', [cleanEmail, cleanEmail, cleanEmail]);

        if (users.length === 0) {
            return res.status(401).json({ success: false, message: 'Email/NIS atau password yang Anda masukkan salah.' });
        }

        const user = users[0];
        const isPasswordMatch = await verifyPassword(password, user.password);

        if (!isPasswordMatch) {
            return res.status(401).json({ success: false, message: 'Email/NIS atau password yang Anda masukkan salah.' });
        }

        // Cek Status & Role Persetujuan Akun oleh Super Admin
        const rawStatus = String(user.status || '').trim().toLowerCase();
        const rawRole = String(user.role || '').trim().toLowerCase();

        if (rawStatus === 'pending' || rawRole === 'pending' || rawStatus === 'rejected') {
            return res.status(403).json({
                success: false,
                message: 'Akun Anda sedang menunggu persetujuan dan pengaturan role oleh Super Admin.'
            });
        }

        let resolvedRole = user.role || user.role_name || user.type || 'Admin';
        let resolvedName = user.name;
        let resolvedTeacherId = user.teacher_id || null;

        try {
            let teachers = [];
            if (user.teacher_id) {
                const [tRows] = await db.query('SELECT id, nama, email FROM teachers WHERE id = ?', [user.teacher_id]);
                teachers = tRows;
            }
            if (teachers.length === 0) {
                const [tRows] = await db.query('SELECT id, nama, email FROM teachers WHERE LOWER(email) = LOWER(?) OR id = ?', [cleanEmail, user.id]);
                teachers = tRows;
            }
            if (teachers.length > 0) {
                resolvedRole = 'Pengajar';
                resolvedTeacherId = teachers[0].id;
                if (teachers[0].nama) {
                    resolvedName = teachers[0].nama;
                }
            } else if (user.role && (user.role.toLowerCase().includes('pengajar') || user.role.toLowerCase().includes('guru'))) {
                resolvedRole = 'Pengajar';
            }
        } catch (tErr) {}

        const token = generateToken({ ...user, role: resolvedRole, name: resolvedName, teacher_id: resolvedTeacherId });
        
        // Log aktivitas login secara non-blocking
        const { createActivityLog } = require('../utils/logger');
        createActivityLog({
            user_name: resolvedName || user.name || 'User',
            action: 'Masuk ke Sistem (Login)',
            program: '-',
            status: 'Berhasil'
        });

        return res.json({
            success: true,
            token,
            user: { id: user.id, nis: user.nis || user.id, name: resolvedName, email: user.email, role: resolvedRole, teacher_id: resolvedTeacherId }
        });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function validateToken(req, res) {
    return res.json({ valid: true, success: true, user: req.user });
}

async function register(req, res, next) {
    const { name, email, password, nis } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ success: false, message: 'Nama, email, dan password wajib diisi.' });
    }
    try {
        const cleanEmail = email.trim();
        const [existing] = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [cleanEmail]);
        if (existing.length > 0) {
            return res.status(400).json({ success: false, message: 'Email sudah terdaftar.' });
        }

        const selectedRole = 'Pending';
        const defaultStatus = 'Pending';
        const finalNis = (nis && nis.trim()) ? nis.trim() : await generateUniqueUserId(db, 'Pending');
        const passwordHashed = await hashPassword(password);
        await db.query(
            'INSERT INTO users (id, nis, name, email, password, role, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [finalNis, finalNis, name.trim(), cleanEmail, passwordHashed, selectedRole, defaultStatus]
        );
        res.status(201).json({
            success: true,
            message: 'Registrasi akun berhasil! Akun Anda berstatus Pending dan memerlukan approval Super Admin sebelum dapat masuk.',
            nis: finalNis
        });
    } catch (err) {
        next(err);
    }
}

async function updateAuthProfile(req, res, next) {
    const { name, email, password } = req.body;
    const targetEmail = req.user.email;
    try {
        if (!targetEmail) {
            return res.status(400).json({ success: false, message: 'Pengguna tidak terautentikasi.' });
        }

        const newEmail = (email && email.trim()) ? email.trim() : targetEmail;

        if (newEmail !== targetEmail) {
            const [existing] = await db.query('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [newEmail]);
            if (existing.length > 0) {
                return res.status(400).json({ success: false, message: 'Email baru sudah digunakan oleh akun lain.' });
            }
        }

        if (password && password.trim()) {
            const passwordHashed = await hashPassword(password.trim());
            await db.query(
                'UPDATE users SET name = ?, email = ?, password = ? WHERE LOWER(email) = LOWER(?)',
                [name ? name.trim() : 'User KBEC', newEmail, passwordHashed, targetEmail]
            );
        } else {
            await db.query(
                'UPDATE users SET name = ?, email = ? WHERE LOWER(email) = LOWER(?)',
                [name ? name.trim() : 'User KBEC', newEmail, targetEmail]
            );
        }
        res.json({ success: true, user: { name: name || 'User KBEC', email: newEmail } });
    } catch (err) {
        next(err);
    }
}

async function changePassword(req, res, next) {
    try {
        const userId = req.user.id;
        const { oldPassword, newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ success: false, message: 'Password baru minimal 6 karakter.' });
        }

        const [[user]] = await db.query('SELECT * FROM users WHERE id = ? OR nis = ?', [userId, userId]);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User tidak ditemukan.' });
        }

        if (oldPassword) {
            const isMatch = await verifyPassword(oldPassword, user.password);
            if (!isMatch) {
                return res.status(400).json({ success: false, message: 'Password lama Anda tidak sesuai.' });
            }
        }

        const hashedPassword = await hashPassword(newPassword);
        await db.query('UPDATE users SET password = ? WHERE id = ? OR nis = ?', [hashedPassword, userId, userId]);

        res.json({ success: true, message: 'Kata sandi berhasil diperbarui.' });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    login,
    validateToken,
    hashPassword,
    verifyPassword,
    register,
    updateAuthProfile,
    changePassword
};
