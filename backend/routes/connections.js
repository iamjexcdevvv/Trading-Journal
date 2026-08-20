const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const {
    createExchangeConnection,
    getExchangeConnections,
    deleteExchangeConnection,
    syncExchangeConnectionNow
} = require('../controllers/connections');

router.use(authMiddleware);
router.post('/', createExchangeConnection);
router.get('/', getExchangeConnections);
router.delete('/:id', deleteExchangeConnection);
router.post('/:id/sync', syncExchangeConnectionNow);

module.exports = router;
