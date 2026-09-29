const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { getStats, getActivities } = require('../controllers/dashboard.controller');

router.get('/stats', requireAuth, requireRole('Super Admin', 'Admin'), getStats);
router.get('/activities', requireAuth, requireRole('Super Admin', 'Admin'), getActivities);

module.exports = router;
