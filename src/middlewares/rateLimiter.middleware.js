const rateLimit = require('express-rate-limit');

const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Menit
    max: 300, // Maksimal 300 request per IP per 15 menit
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Batas jumlah permintaan terlampaui. Silakan coba beberapa saat lagi.' }
});

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 Menit
    max: 15, // Maksimal 15 percobaan login per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Terlalu banyak percobaan masuk. Akun ditangguhkan sementara selama 15 menit.' }
});

module.exports = {
    globalRateLimiter,
    authRateLimiter
};
