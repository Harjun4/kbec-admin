const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/', requireAuth, attendanceController.getAttendance);
router.get('/monthly', requireAuth, attendanceController.getMonthlyAttendance);
router.post('/', requireAuth, attendanceController.saveAttendance);
router.post('/bulk', requireAuth, attendanceController.saveAttendance);

router.get('/student-grades', requireAuth, attendanceController.getStudentGrades);
router.post('/student-grades', requireAuth, attendanceController.saveStudentGrade);
router.get('/performance-report', requireAuth, attendanceController.getPerformanceReport);

module.exports = router;
