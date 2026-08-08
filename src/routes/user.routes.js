const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../middlewares/auth.middleware');
const { 
    getSelfProfile, 
    updateSelfProfile, 
    getNextId, 
    getAllUsers, 
    createUser, 
    updateUser, 
    deleteUser 
} = require('../controllers/user.controller');

const { validate, userSchema } = require('../middlewares/validate.middleware');

router.get('/profile', requireAuth, getSelfProfile);
router.put('/profile', requireAuth, updateSelfProfile); // Profile update could use a different schema, leaving for now as per instructions

router.get('/next-id', requireAuth, requireRole('Super Admin'), getNextId);
router.get('/', requireAuth, requireRole('Super Admin'), getAllUsers);
router.post('/', requireAuth, requireRole('Super Admin'), validate(userSchema), createUser);
router.put('/:id', requireAuth, requireRole('Super Admin'), validate(userSchema), updateUser);
router.delete('/:id', requireAuth, requireRole('Super Admin'), deleteUser);

module.exports = router;
