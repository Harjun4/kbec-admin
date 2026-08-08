const express = require('express');
const router = express.Router();
const classController = require('../controllers/class.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/schedule', requireAuth, classController.getSchedules);
router.get('/schedules', requireAuth, classController.getSchedules);

const { validate, classSchema } = require('../middlewares/validate.middleware');

router.get('/', requireAuth, classController.getClasses);
router.post('/', requireAuth, requireRole('Super Admin', 'Admin'), validate(classSchema), classController.createClass);
router.put('/:id', requireAuth, requireRole('Super Admin', 'Admin'), validate(classSchema), classController.updateClass);
router.delete('/:id', requireAuth, requireRole('Super Admin'), classController.deleteClass);

router.get('/:id/students', requireAuth, classController.getClassStudents);
router.post('/:id/students', requireAuth, requireRole('Super Admin', 'Admin'), classController.addStudentToClass);
router.delete('/:id/students/:student_id', requireAuth, requireRole('Super Admin', 'Admin'), classController.removeStudentFromClass);

module.exports = router;
