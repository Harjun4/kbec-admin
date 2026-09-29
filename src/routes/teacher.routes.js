const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

const { validate, teacherSchema, teacherAttendanceSchema } = require('../middlewares/validate.middleware');

router.get('/', requireAuth, teacherController.getTeachers);
router.post('/', requireAuth, requireRole('Super Admin', 'Staff'), validate(teacherSchema), teacherController.createTeacher);
router.put('/:id', requireAuth, requireRole('Super Admin', 'Staff'), validate(teacherSchema), teacherController.updateTeacher);
router.delete('/:id', requireAuth, requireRole('Super Admin'), teacherController.deleteTeacher);

// Teacher Attendance / Checkin Endpoints
router.post(['/checkin', '/attendance'], requireAuth, validate(teacherAttendanceSchema), teacherController.checkinTeacher);
router.get(['/checkin-logs', '/attendance-logs'], requireAuth, teacherController.getCheckinLogs);
router.get(['/attendance-summary', '/checkin-summary'], requireAuth, teacherController.getAttendanceSummary);
router.get('/my-classes-today', requireAuth, teacherController.getMyClassesToday);

module.exports = router;
