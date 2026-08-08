const express = require('express');
const router = express.Router();
const logController = require('../controllers/log.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.get('/latest', requireAuth, logController.getLatestLogs);
router.get('/all', requireAuth, logController.getAllLogs);
router.get('/', requireAuth, logController.getAllLogs);

module.exports = router;
