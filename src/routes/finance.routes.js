const express = require('express');
const router = express.Router();
const financeController = require('../controllers/finance.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { validate, paymentSchema } = require('../middlewares/validate.middleware');

router.get('/bills/per-student', requireAuth, financeController.getStudentBillsSummary);
router.get('/bills', requireAuth, financeController.getBills);
router.post('/bills/generate-spp', requireAuth, requireRole('Super Admin', 'Admin'), financeController.generateSppBills);
router.post('/bills', requireAuth, requireRole('Super Admin', 'Admin'), financeController.createBill);
router.put('/bills/:id', requireAuth, requireRole('Super Admin', 'Admin'), financeController.updateBill);
router.delete('/bills/:id', requireAuth, requireRole('Super Admin'), financeController.deleteBill);

router.get('/payments', requireAuth, financeController.getPayments);
router.get('/payments/receipt/:id', requireAuth, financeController.getReceipt);
router.post('/payments', requireAuth, requireRole('Super Admin', 'Admin'), validate(paymentSchema), financeController.createPayment);
router.put('/payments/:id', requireAuth, requireRole('Super Admin', 'Admin'), financeController.updatePayment);
router.delete('/payments/:id', requireAuth, requireRole('Super Admin'), financeController.deletePayment);

router.get('/deposits', requireAuth, financeController.getDeposits);
router.post('/deposits', requireAuth, requireRole('Super Admin', 'Admin'), financeController.createDeposit);
router.put('/deposits/:id', requireAuth, requireRole('Super Admin', 'Admin'), financeController.updateDeposit);
router.put('/deposits/:id/verify', requireAuth, requireRole('Super Admin'), financeController.verifyDeposit);
router.put('/deposits/:id/unverify', requireAuth, requireRole('Super Admin'), financeController.unverifyDeposit);
router.delete('/deposits/:id', requireAuth, requireRole('Super Admin', 'Admin'), financeController.deleteDeposit);

router.get('/petty-cash', requireAuth, financeController.getPettyCash);
router.post('/petty-cash', requireAuth, requireRole('Super Admin', 'Admin'), financeController.createPettyCash);
router.delete('/petty-cash/:id', requireAuth, requireRole('Super Admin'), financeController.deletePettyCash);

router.get('/summary', requireAuth, financeController.getFinanceSummary);

module.exports = router;
