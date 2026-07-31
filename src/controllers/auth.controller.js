const db = require('../config/db');
const { generateToken, requireAuth, requireRole } = require('../middlewares/auth.middleware');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

function hashHmacLegacy(password) {
    const salt = process.env.PASSWORD_SALT || 'kbec_secure_app_salt_2026';
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

        if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
            try {
                const newBcryptHash = await hashPassword(password);
                await db.query('UPDATE users SET password = ? WHERE id = ? OR nis = ?', [newBcryptHash, user.id, user.id]);
            } catch (e) { }
        }

        const token = generateToken(user);
        return res.json({
            success: true,
            token,
            user: { id: user.id, nis: user.nis || user.id, name: user.name, email: user.email, role: user.role || 'Admin' }
        });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).json({ success: false, message: err.message });
    }
}

async function validateToken(req, res) {
    return res.json({ valid: true, success: true, user: req.user });
}

module.exports = {
    login,
    validateToken,
    hashPassword,
    verifyPassword
};
