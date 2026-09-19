const mongoose = require('mongoose');

const alertEventSchema = new mongoose.Schema({
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'Alert', required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    exchange: { type: String, enum: ['bitunix', 'binance', 'bybit'], default: 'bitunix', required: true },
    symbol: { type: String, required: true },
    triggerPrice: { type: Number, required: true },
    message: { type: String, required: true },
    alertType: { type: String, default: 'price' },
    alertName: { type: String, default: '' },
    timeframe: { type: String, default: null },
    conditionSummary: { type: String, default: '' },
    triggerContext: { type: mongoose.Schema.Types.Mixed, default: null },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', default: null },
    journalEntryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', default: null },
    drawingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartDrawing', default: null },
    drawingType: { type: String, default: null },
    drawingValueAtTrigger: { type: Number, default: null },
    drawingCondition: { type: String, default: null },
    triggerSequence: { type: Number, required: true },
    triggeredAt: { type: Date, required: true, default: Date.now },
    readAt: { type: Date, default: null },
    migratedExchangeDefault: { type: Boolean, default: false }
}, { timestamps: false });

alertEventSchema.index({ userId: 1, triggeredAt: -1 });
alertEventSchema.index({ alertId: 1, triggerSequence: 1 }, { unique: true });

const AlertEvent = mongoose.model('AlertEvent', alertEventSchema);

module.exports = { AlertEvent };
