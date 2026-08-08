const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');
const { rateLimit } = require('express-rate-limit');

const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { success: false, message: 'Terlalu banyak request. Silakan coba lagi nanti.' },
    standardHeaders: true,
    legacyHeaders: false,
});

router.post('/register', authRateLimiter, authController.register);
router.post('/login', authController.login);
router.get('/validate', requireAuth, authController.validateToken);
router.put('/profile', requireAuth, authController.updateAuthProfile);
router.put('/change-password', requireAuth, authController.changePassword);

module.exports = router;
