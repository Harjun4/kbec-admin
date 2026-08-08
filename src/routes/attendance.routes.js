const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

const { validate, attendanceSchema } = require('../middlewares/validate.middleware');

router.get('/', requireAuth, attendanceController.getAttendance);
router.get('/monthly', requireAuth, attendanceController.getMonthlyAttendance);
router.post('/', requireAuth, validate(attendanceSchema), attendanceController.saveAttendance);
router.post('/bulk', requireAuth, validate(attendanceSchema), attendanceController.saveAttendance);

router.get('/student-grades', requireAuth, attendanceController.getStudentGrades);
router.post('/student-grades', requireAuth, attendanceController.saveStudentGrade);
router.get('/performance-report', requireAuth, attendanceController.getPerformanceReport);
router.get('/report', requireAuth, attendanceController.getAttendanceReport);

module.exports = router;
