const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/auth.middleware');
const { globalSearch } = require('../controllers/search.controller');

router.get('/', requireAuth, globalSearch);

module.exports = router;
