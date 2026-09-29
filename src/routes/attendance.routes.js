const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendance.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

const { validate, attendanceSchema } = require('../middlewares/validate.middleware');

router.get('/', requireAuth, attendanceController.getAttendance);
router.get('/monthly', requireAuth, attendanceController.getMonthlyAttendance);
router.post('/', requireAuth, requireRole('Super Admin', 'Pengajar'), validate(attendanceSchema), attendanceController.saveAttendance);
router.post('/bulk', requireAuth, requireRole('Super Admin', 'Pengajar'), validate(attendanceSchema), attendanceController.saveAttendance);

router.get('/student-grades', requireAuth, attendanceController.getStudentGrades);
router.post('/student-grades', requireAuth, requireRole('Super Admin', 'Pengajar'), attendanceController.saveStudentGrade);
router.get('/performance-report', requireAuth, requireRole('Super Admin', 'Admin', 'Staff', 'Pengajar'), attendanceController.getPerformanceReport);
router.get('/report', requireAuth, requireRole('Super Admin', 'Admin'), attendanceController.getAttendanceReport);

module.exports = router;
