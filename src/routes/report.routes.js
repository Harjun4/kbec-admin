const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

router.get('/attendance-recap', requireAuth, reportController.getAttendanceRecap);
router.get('/student-performance', requireAuth, reportController.getStudentPerformanceReport);

module.exports = router;
