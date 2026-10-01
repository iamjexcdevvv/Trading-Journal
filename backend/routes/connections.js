const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
    createExchangeConnection,
    getExchangeConnections,
    deleteExchangeConnection,
    syncExchangeConnectionNow
} = require('../controllers/connections');

router.use(authMiddleware);
const exchangeActionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many exchange requests. Please try again later.' }
});

router.post('/', exchangeActionLimiter, createExchangeConnection);
router.get('/', getExchangeConnections);
router.delete('/:id', deleteExchangeConnection);
router.post('/:id/sync', exchangeActionLimiter, syncExchangeConnectionNow);

module.exports = router;
