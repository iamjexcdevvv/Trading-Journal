const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: Date,
    symbol: String,
    direction: String,
    strategy: String,
    setup: String,
    checklist: [{ label: String, checked: Boolean, required: { type: Boolean, default: true }, _id: false }],
    notes: String,
    pnl: Number,
    screenshot: String,
    tags: [String],
    exchange: { type: String, enum: ['manual', 'binance', 'okx', 'bitunix'], default: 'manual' },
    externalId: String,
    status: { type: String, enum: ['open', 'closed'], default: 'closed' },
    entryPrice: Number,
    exitPrice: Number,
    qty: Number,
    leverage: Number,
    fee: Number
});

// Partial (not sparse) so manual entries — which never set externalId — can't collide with
// each other; only docs that actually have an externalId are subject to the unique constraint.
tradeSchema.index(
    { userId: 1, exchange: 1, externalId: 1 },
    { unique: true, partialFilterExpression: { externalId: { $exists: true } } }
);

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

async function updateTradeById(id, tradeData) {
    return await Trade.findByIdAndUpdate(id, { $set: tradeData }, { returnDocument: 'after', runValidators: true });
}

async function findSyncedTrade(userId, exchange, externalId) {
    return await Trade.findOne({ userId, exchange, externalId });
}

async function closeSyncedTrade(id, closeData) {
    return await Trade.findByIdAndUpdate(id, { $set: { status: 'closed', ...closeData } }, { returnDocument: 'after' });
}

module.exports = {
    Trade,
    createTrade,
    getTradesByUserId,
    deleteTradeById,
    updateTradeNotesById,
    updateTradeScreenshotById,
    updateTradeById,
    findSyncedTrade,
    closeSyncedTrade
};