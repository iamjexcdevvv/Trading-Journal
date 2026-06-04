const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');

const { saveTrade, getTrades, deleteTrade, updateTradeNotes, updateTradeScreenshot } = require('../controllers/trades');

router.use(authMiddleware);

router.post('/', saveTrade);
router.get('/', getTrades)
router.delete('/:id', deleteTrade);
router.put('/notes/:id', updateTradeNotes);
router.patch('/:id/screenshot', updateTradeScreenshot);

module.exports = router;