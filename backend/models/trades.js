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

async function createTrade(tradeData) {
    const newTrade = new Trade(tradeData);
    await newTrade.save();
    return newTrade;
}

async function getTradesByUserId(userId) {
    return await Trade.find({ userId });
}

async function deleteTradeById(id) {
    await Trade.deleteOne({ _id: id });
}

async function updateTradeNotesById(id, notes) {
    return await Trade.findByIdAndUpdate(id, { $set: { notes } }, { returnDocument: 'after', runValidators: true });
}

async function updateTradeScreenshotById(id, screenshot) {
    return await Trade.findByIdAndUpdate(id, { $set: { screenshot } }, { returnDocument: 'after', runValidators: true });
}

module.exports = {
    createTrade,
    getTradesByUserId,
    deleteTradeById,
    updateTradeNotesById,
    updateTradeScreenshotById
};