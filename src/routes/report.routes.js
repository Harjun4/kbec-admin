const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/attendance-recap', requireAuth, requireRole('Super Admin', 'Staff'), reportController.getAttendanceRecap);
router.get('/student-performance', requireAuth, requireRole('Super Admin'), reportController.getStudentPerformanceReport);
router.get('/problematic-students', requireAuth, requireRole('Super Admin'), reportController.getProblematicStudentsReport);
router.get('/teacher-monthly-performance', requireAuth, requireRole('Super Admin'), reportController.getTeacherMonthlyPerformanceReport);

module.exports = router;
