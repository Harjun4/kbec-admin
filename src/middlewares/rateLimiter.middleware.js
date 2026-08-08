const rateLimit = require('express-rate-limit');

const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Menit
    max: 5000, // Pelonggaran batas testing: Maksimal 5000 request per IP per 15 menit
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { success: false, message: 'Batas jumlah permintaan terlampaui. Silakan coba beberapa saat lagi.' }
});

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Menit
    max: 1000, // Pelonggaran batas testing: Maksimal 1000 percobaan login per IP
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false, xForwardedForHeader: false },
    message: { success: false, message: 'Terlalu banyak percobaan masuk. Akun ditangguhkan sementara selama 15 menit.' }
});


module.exports = {
    globalRateLimiter,
    authRateLimiter
};
