const express = require('express');
const router = express.Router();

const { saveTrade, getTrades, deleteTrade, updateTradeNotes } = require('../controllers/trades');

router.post('/', saveTrade);
router.get('/', getTrades)
router.delete('/:id', deleteTrade);
router.put('/notes/:id', updateTradeNotes);

module.exports = router;