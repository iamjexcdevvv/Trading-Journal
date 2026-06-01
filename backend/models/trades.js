const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: Date,
    symbol: String,
    direction: String,
    strategy: String,
    notes: String,
    pnl: Number,
    screenshot: String,
    tags: [String]
});

const Trade = mongoose.model('Trade', tradeSchema);

module.exports = Trade;