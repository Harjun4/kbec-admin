const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');

const { validate, inventorySchema } = require('../middlewares/validate.middleware');

router.get('/', requireAuth, inventoryController.getInventory);
router.post('/', requireAuth, requireRole('Super Admin', 'Admin'), validate(inventorySchema), inventoryController.createInventoryItem);
router.put('/:id', requireAuth, requireRole('Super Admin', 'Admin'), validate(inventorySchema), inventoryController.updateInventoryItem);
router.delete('/:id', requireAuth, requireRole('Super Admin'), inventoryController.deleteInventoryItem);

router.post('/mutate', requireAuth, requireRole('Super Admin', 'Admin'), inventoryController.mutateInventory);
router.get('/mutations', requireAuth, inventoryController.getInventoryMutations);

module.exports = router;
