const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const { createTradingRule, getUserTradingRules, deleteTradingRule, updateTradingRule } = require('../controllers/tradingRules');

router.use(authMiddleware);

router.post('/', createTradingRule);
router.get('/', getUserTradingRules);
router.delete('/:id', deleteTradingRule);
router.put('/:id', updateTradingRule);

module.exports = router;
