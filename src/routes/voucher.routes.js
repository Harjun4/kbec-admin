const express = require('express');
const router = express.Router();
const voucherController = require('../controllers/voucher.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

// ============================================================
// SEMUA ROUTE WAJIB TERAUTENTIKASI VIA JWT — TANPA PENGECUALIAN
// Hapus total logika x-user-role header fallback (AUDIT FIX #1)
// ============================================================
router.use(requireAuth);

// GET /api/vouchers — Super Admin & Admin (Read)
router.get('/', requireRole('Super Admin', 'Admin'), voucherController.getVouchers);

// POST /api/vouchers/validate — Super Admin & Admin (Validasi kode voucher saat bayar)
// Ditempatkan SEBELUM /:id agar tidak di-parse sebagai ID
router.post('/validate', requireRole('Super Admin', 'Admin'), voucherController.validateVoucher);

// POST /api/vouchers — HANYA Super Admin (Create)
router.post('/', requireRole('Super Admin'), voucherController.createVoucher);

// PUT /api/vouchers/:id — HANYA Super Admin (Update)
router.put('/:id', requireRole('Super Admin'), voucherController.updateVoucher);

// DELETE /api/vouchers/:id — HANYA Super Admin (Delete)
router.delete('/:id', requireRole('Super Admin'), voucherController.deleteVoucher);

module.exports = router;
