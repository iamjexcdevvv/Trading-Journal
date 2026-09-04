const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getSymbols } = require('../controllers/market');

router.use(authMiddleware);
router.get('/:exchange/symbols', getSymbols);

module.exports = router;
