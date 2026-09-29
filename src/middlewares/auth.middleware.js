require('dotenv').config();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL ERROR: JWT_SECRET is missing from process.env');
  process.exit(1);
}


function generateToken(user) {
    if (!user || !user.id) {
        throw new Error('Objek user valid diperlukan untuk membuat token.');
    }
    return jwt.sign(
        {
            id: user.id,
            nis: user.nis || user.id,
            name: user.name,
            email: user.email,
            role: user.role || 'Admin'
        },
        JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
}

function requireAuth(req, res, next) {
    const authHeader = req.headers['authorization'] || req.headers['x-auth-token'];
    let token = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : '';
    
    if (!token && req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    if (!token) {
        return res.status(401).json({ success: false, message: 'Akses ditolak. Token autentikasi tidak valid atau belum login.' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ success: false, message: 'Token otentikasi tidak valid atau telah kadaluwarsa.' });
    }
}

const ROLE_ALIASES = {
    'super admin': ['super admin'],
    'admin': ['admin'],
    'staff': ['staff', 'staf'],
    'staf': ['staff', 'staf'],
    'pengajar': ['pengajar', 'guru', 'teacher'],
    'guru': ['pengajar', 'guru', 'teacher'],
    'teacher': ['pengajar', 'guru', 'teacher']
};

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, message: 'Akses ditolak. Pengguna belum terautentikasi.' });
        }
        const userRoleLower = String(req.user.role).trim().toLowerCase();

        // Super Admin memiliki akses universal untuk seluruh resource
        if (userRoleLower === 'super admin') {
            return next();
        }

        const normalizedAllowed = allowedRoles.map(r => String(r).trim().toLowerCase());
        const userEquivalents = ROLE_ALIASES[userRoleLower] || [userRoleLower];
        const isAllowed = userEquivalents.some(alias => normalizedAllowed.includes(alias));

        if (!isAllowed) {
            return res.status(403).json({ success: false, message: 'Akses dilarang. Anda tidak memiliki hak akses untuk tindakan ini.' });
        }
        next();
    };
}

function requireCsrf(req, res, next) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
    }
    if (req.path.includes('/auth/login') || req.path.includes('/auth/register')) {
        return next();
    }
    const authHeader = req.headers['authorization'];
    const customHeader = req.headers['x-requested-with'] || req.headers['x-csrf-token'];
    if (authHeader || (customHeader && String(customHeader).trim().length > 0)) {
        return next();
    }
    return res.status(403).json({ success: false, message: 'Akses dilarang. Permintaan mutasi data memerlukan validasi CSRF header.' });
}

module.exports = {
    generateToken,
    requireAuth,
    requireRole,
    requireCsrf,
    JWT_SECRET
};

