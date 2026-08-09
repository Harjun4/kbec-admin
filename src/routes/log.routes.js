const express = require('express');
const router = express.Router();
const logController = require('../controllers/log.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/latest', requireAuth, requireRole('Super Admin', 'Admin'), logController.getLatestLogs);
router.get('/all', requireAuth, requireRole('Super Admin', 'Admin'), logController.getAllLogs);
router.get('/', requireAuth, requireRole('Super Admin', 'Admin'), logController.getAllLogs);

module.exports = router;
