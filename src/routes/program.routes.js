const express = require('express');
const router = express.Router();
const programController = require('../controllers/program.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

router.get('/', requireAuth, programController.getPrograms);
router.post('/', requireAuth, requireRole('Super Admin'), programController.createProgram);
router.put('/:id', requireAuth, requireRole('Super Admin'), programController.updateProgram);
router.delete('/:id', requireAuth, requireRole('Super Admin'), programController.deleteProgram);

module.exports = router;
