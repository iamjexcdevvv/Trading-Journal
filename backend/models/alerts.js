const mongoose = require('mongoose');

const TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'];
const alertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, trim: true, maxlength: 100, required: true },
    exchange: { type: String, enum: ['bitunix', 'binance', 'bybit'], default: 'bitunix', required: true },
    symbol: { type: String, uppercase: true, trim: true, maxlength: 20, required: true },
    alertType: { type: String, enum: ['price', 'indicator', 'crossover', 'candle', 'volume', 'trade', 'drawing'], default: 'price', required: true },
    condition: { type: String, enum: ['crosses_above', 'crosses_below', 'price_gte', 'price_lte', 'percentage_increase', 'percentage_decrease'] },
    targetValue: Number,
    timeframe: { type: String, enum: TIMEFRAMES, default: '15m' },
    conditions: { type: [mongoose.Schema.Types.Mixed], default: undefined },
    conditionLogic: { type: String, enum: ['AND', 'OR'], default: 'AND' },
    tradeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Trade', default: null },
    drawingId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChartDrawing', default: null },
    drawingCondition: { type: String, enum: ['crosses_above', 'crosses_below', 'touches', 'enters', 'exits', 'crosses_upper', 'crosses_lower'] },
    triggerMode: { type: String, enum: ['realtime', 'candle_close'], default: 'candle_close' },
    frequency: { type: String, enum: ['once', 'recurring', 'once_per_candle'], default: 'once' },
    notificationMethods: { type: [String], enum: ['in_app'], default: ['in_app'] },
    isActive: { type: Boolean, default: true },
    expiresAt: { type: Date, default: null },
    lastTriggeredAt: { type: Date, default: null },
    triggerCount: { type: Number, default: 0 },
    referencePrice: { type: Number, default: null },
    previousPrice: { type: Number, default: null },
    previousEvaluationTime: { type: Number, default: null },
    conditionMet: { type: Boolean, default: false },
    lastTriggeredCandle: { type: Number, default: null },
    lastEvaluatedCandleTime: { type: Number, default: null },
    lastCheckedAt: { type: Date, default: null },
    status: { type: String, enum: ['active', 'triggered', 'expired'], default: 'active', required: true },
    schemaVersion: { type: Number, default: 5, required: true },
    price: { type: Number, select: false },
    type: { type: String, select: false },
    currentPrice: { type: Number, select: false },
    startPrice: { type: Number, select: false },
    startTime: { type: Date, select: false },
    endPrice: { type: Number, select: false },
    endTime: { type: Date, select: false }
}, { timestamps: true });

alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ isActive: 1, status: 1, exchange: 1, symbol: 1, timeframe: 1 });

const Alert = mongoose.model('Alert', alertSchema);

async function saveAlert(alertData) { return Alert.create(alertData); }
async function getAlertsByUserId(userId) { return Alert.find({ userId }).sort({ createdAt: -1 }); }
async function deleteAlertById(alertId, userId) { return Alert.findOneAndDelete({ _id: alertId, userId }); }

module.exports = { Alert, TIMEFRAMES, saveAlert, getAlertsByUserId, deleteAlertById };
