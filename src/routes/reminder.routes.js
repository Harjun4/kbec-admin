const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { getReminders, createReminder, deleteReminder } = require('../controllers/reminder.controller');

router.get('/', requireAuth, getReminders);
router.post('/', requireAuth, requireRole('Super Admin', 'Admin'), createReminder);
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteReminder);

module.exports = router;
