const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const { getSymbols, getCandles } = require('../controllers/market');

router.use(authMiddleware);
router.get('/:exchange/symbols', getSymbols);
router.get('/:exchange/candles', getCandles);

module.exports = router;
