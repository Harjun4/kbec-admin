const express = require('express');
const router = express.Router();
const studentController = require('../controllers/student.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { validate, studentSchema } = require('../middlewares/validate.middleware');

router.get('/', requireAuth, studentController.getStudents);
router.get('/next-id', requireAuth, studentController.getNextStudentId);
router.post('/', requireAuth, requireRole('Super Admin', 'Admin'), validate(studentSchema), studentController.createStudent);
router.put('/:id', requireAuth, requireRole('Super Admin', 'Admin'), studentController.updateStudent);
router.delete('/:id', requireAuth, requireRole('Super Admin'), studentController.deleteStudent);
router.post('/bulk', requireAuth, requireRole('Super Admin', 'Admin'), studentController.bulkCreateStudents);

module.exports = router;
