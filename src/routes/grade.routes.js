const express = require('express');
const router = express.Router();
const gradeController = require('../controllers/grade.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/classes', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.getClasses);
router.get('/subjects', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.getClassSubjects);
router.post('/subjects', requireAuth, requireRole('Super Admin', 'Pengajar'), gradeController.saveClassSubjects);
router.get('/', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.getClassGrades);
router.post('/batch', requireAuth, requireRole('Super Admin', 'Pengajar'), gradeController.saveBatchGrades);
router.get('/progress-report', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.getProgressReportData);
router.get('/certificate', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.getCertificateData);
router.get('/batch-print', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.getBatchPrintData);
router.post('/student-photo', requireAuth, requireRole('Super Admin', 'Pengajar', 'Staff'), gradeController.updateStudentCertificatePhoto);

module.exports = router;

