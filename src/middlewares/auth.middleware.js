const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ FATAL: JWT_SECRET is not set in environment variables.');
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

const ROLE_HIERARCHY = {
    'super admin': 3,
    'admin': 2,
    'pengajar': 1,
    'teacher': 1
};

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ success: false, message: 'Akses ditolak. Pengguna belum terautentikasi.' });
        }
        const userRoleLower = req.user.role.toLowerCase();
        const userLevel = ROLE_HIERARCHY[userRoleLower] || 0;

        const allowedLevels = allowedRoles.map(r => ROLE_HIERARCHY[r.toLowerCase()] || 0);
        const minRequiredLevel = Math.min(...allowedLevels);

        if (userLevel < minRequiredLevel) {
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

