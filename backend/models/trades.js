const mongoose = require('mongoose');

const tradeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: Date,
    symbol: String,
    direction: String,
    strategy: String,
    setup: String,
    checklist: [{ label: String, checked: Boolean, required: { type: Boolean, default: true }, _id: false }],
    rulesChecklist: [{ label: String, checked: Boolean, required: { type: Boolean, default: true }, _id: false }],
    notes: String,
    mistakes: String,
    actionableTakeaways: String,
    pnl: Number,
    screenshot: String,
    tags: [String],
    exchange: { type: String, enum: ['manual', 'binance', 'okx', 'bitunix'], default: 'manual' },
    connectionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ExchangeConnection' },
    sourceExternalId: String,
    externalId: String,
    status: { type: String, enum: ['open', 'closed'], default: 'closed' },
    entryPrice: Number,
    exitPrice: Number,
    rMultiple: Number,
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

async function deleteTradeById(id, userId) {
    return await Trade.findOneAndDelete({ _id: id, userId });
}

async function updateTradeNotesById(id, userId, notes) {
    return await Trade.findOneAndUpdate({ _id: id, userId }, { $set: { notes } }, { returnDocument: 'after', runValidators: true });
}

async function updateTradeScreenshotById(id, userId, screenshot) {
    return await Trade.findOneAndUpdate({ _id: id, userId }, { $set: { screenshot } }, { returnDocument: 'after', runValidators: true });
}

async function updateTradeById(id, userId, tradeData) {
    return await Trade.findOneAndUpdate({ _id: id, userId }, { $set: tradeData }, { returnDocument: 'after', runValidators: true });
}

async function findSyncedTrade(userId, connectionId, exchange, sourceExternalId, allowLegacy = false) {
    const scoped = await Trade.findOne({ userId, connectionId, exchange, sourceExternalId, status: 'open' });
    if (scoped || !allowLegacy) return scoped;

    // Compatibility path for records created before connections were isolated.
    return await Trade.findOne({
        userId,
        exchange,
        externalId: sourceExternalId,
        status: 'open',
        connectionId: { $exists: false }
    });
}

async function closeSyncedTrade(id, userId, closeData) {
    return await Trade.findOneAndUpdate({ _id: id, userId, status: 'open' }, { $set: { status: 'closed', ...closeData } }, { returnDocument: 'after' });
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
