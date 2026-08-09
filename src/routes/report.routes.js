const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/attendance-recap', requireAuth, requireRole('Super Admin', 'Admin'), reportController.getAttendanceRecap);
router.get('/student-performance', requireAuth, requireRole('Super Admin', 'Admin'), reportController.getStudentPerformanceReport);

module.exports = router;
