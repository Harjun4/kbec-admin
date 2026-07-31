const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.post('/login', authController.login);
router.get('/validate', requireAuth, authController.validateToken);

module.exports = router;
