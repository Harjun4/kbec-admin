const express = require('express');
const router = express.Router();
const teacherController = require('../controllers/teacher.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/', requireAuth, teacherController.getTeachers);
router.post('/', requireAuth, requireRole('Super Admin', 'Admin'), teacherController.createTeacher);
router.put('/:id', requireAuth, requireRole('Super Admin', 'Admin'), teacherController.updateTeacher);
router.delete('/:id', requireAuth, requireRole('Super Admin'), teacherController.deleteTeacher);
router.post('/checkin', requireAuth, teacherController.checkinTeacher);
router.get('/checkin-logs', requireAuth, teacherController.getCheckinLogs);

module.exports = router;
