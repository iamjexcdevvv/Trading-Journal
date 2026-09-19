const mongoose = require('mongoose');

const DRAWING_TYPES = ['horizontal_line', 'trendline', 'ray', 'rectangle', 'parallel_channel'];
const pointSchema = new mongoose.Schema({
    time: { type: Number, required: true },
    price: { type: Number, required: true }
}, { _id: false });

const chartDrawingSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    drawingId: { type: String, required: true, maxlength: 80 },
    exchange: { type: String, enum: ['bitunix', 'binance', 'bybit'], required: true },
    symbol: { type: String, required: true, uppercase: true, maxlength: 20 },
    timeframe: { type: String, enum: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'], required: true },
    drawingType: { type: String, enum: DRAWING_TYPES, required: true },
    geometry: { points: { type: [pointSchema], required: true } },
    style: { type: mongoose.Schema.Types.Mixed, default: {} },
    label: { type: String, trim: true, maxlength: 100, default: '' },
    schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

chartDrawingSchema.index({ userId: 1, drawingId: 1 }, { unique: true });
chartDrawingSchema.index({ userId: 1, exchange: 1, symbol: 1, timeframe: 1 });

const ChartDrawing = mongoose.model('ChartDrawing', chartDrawingSchema);
module.exports = { ChartDrawing, DRAWING_TYPES };
