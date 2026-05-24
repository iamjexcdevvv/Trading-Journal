const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    date: Date,
    symbol: String,
    direction: String,
    strategy: String,
    notes: String,
    pnl: Number,
});

const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;