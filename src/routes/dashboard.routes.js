const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { getStats, getActivities } = require('../controllers/dashboard.controller');

router.get('/stats', requireAuth, getStats);
router.get('/activities', requireAuth, getActivities);

module.exports = router;
