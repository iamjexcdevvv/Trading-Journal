const express = require('express');
const router = express.Router();

const { saveTrade, getTrades, deleteTrade, updateTradeNotes, updateTradeScreenshot } = require('../controllers/trades');

router.post('/', saveTrade);
router.get('/', getTrades)
router.delete('/:id', deleteTrade);
router.put('/notes/:id', updateTradeNotes);
router.patch('/:id/screenshot', updateTradeScreenshot);

module.exports = router;