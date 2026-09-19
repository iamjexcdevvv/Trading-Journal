const Joi = require('joi');
const mongoose = require('mongoose');
const { ChartDrawing, DRAWING_TYPES } = require('../models/chartDrawings');
const { Alert } = require('../models/alerts');
const { removeAlertFromCache, refreshDrawingInCache } = require('../services/alertService');

const point = Joi.object({ time: Joi.number().integer().positive().required(), price: Joi.number().positive().required() });
const createSchema = Joi.object({
    drawingId: Joi.string().trim().max(80).required(), exchange: Joi.string().valid('bitunix', 'binance', 'bybit').required(),
    symbol: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{1,20}$/).required(), timeframe: Joi.string().valid('1m', '5m', '15m', '30m', '1h', '4h', '1d').required(),
    drawingType: Joi.string().valid(...DRAWING_TYPES).required(), geometry: Joi.object({ points: Joi.array().items(point).min(1).max(3).required() }).required(),
    style: Joi.object().unknown(true).default({}), label: Joi.string().trim().max(100).allow('').default('')
}).custom((value, helpers) => {
    const expected = { horizontal_line: 1, trendline: 2, ray: 2, rectangle: 2, parallel_channel: 3 }[value.drawingType];
    if (value.geometry.points.length !== expected) return helpers.message({ custom: `${value.drawingType} requires ${expected} point(s)` });
    if (['trendline', 'ray', 'parallel_channel'].includes(value.drawingType) && value.geometry.points[0].time === value.geometry.points[1].time) return helpers.message({ custom: 'Line anchor times must differ' });
    if (value.drawingType === 'ray' && value.geometry.points[1].time <= value.geometry.points[0].time) return helpers.message({ custom: 'Ray second anchor must be later than first anchor' });
    return value;
});
const updateSchema = Joi.object({ geometry: createSchema.extract('geometry'), style: Joi.object().unknown(true), label: Joi.string().trim().max(100).allow('') }).min(1);

function validId(id) { return mongoose.Types.ObjectId.isValid(id); }
async function listDrawings(req, res) {
    const filter = { userId: req.user._id };
    for (const field of ['exchange', 'symbol', 'timeframe']) if (req.query[field]) filter[field] = String(req.query[field]).toUpperCase();
    if (filter.exchange) filter.exchange = filter.exchange.toLowerCase();
    if (filter.timeframe) filter.timeframe = req.query.timeframe;
    return res.json(await ChartDrawing.find(filter).sort({ createdAt: 1 }));
}
async function createDrawing(req, res) {
    const { value, error } = createSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message });
    try { return res.status(201).json(await ChartDrawing.create({ ...value, userId: req.user._id })); }
    catch (databaseError) {
        if (databaseError.code === 11000) return res.status(409).json({ error: 'Drawing ID already exists' });
        throw databaseError;
    }
}
async function updateDrawing(req, res) {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Drawing not found' });
    const existing = await ChartDrawing.findOne({ _id: req.params.id, userId: req.user._id });
    if (!existing) return res.status(404).json({ error: 'Drawing not found' });
    const { value, error } = updateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message });
    if (value.geometry) {
        const { error: geometryError } = createSchema.validate({ ...existing.toObject(), ...value }, { stripUnknown: true });
        if (geometryError) return res.status(400).json({ error: geometryError.details[0].message });
    }
    const drawing = await ChartDrawing.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: value }, { new: true, runValidators: true });
    refreshDrawingInCache(drawing);
    return res.json(drawing);
}
async function deleteDrawing(req, res) {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Drawing not found' });
    const drawing = await ChartDrawing.findOne({ _id: req.params.id, userId: req.user._id });
    if (!drawing) return res.status(404).json({ error: 'Drawing not found' });
    const alerts = await Alert.find({ drawingId: drawing._id, userId: req.user._id });
    const activeCount = alerts.filter((alert) => alert.isActive && alert.status === 'active').length;
    if (activeCount && req.query.cascade !== 'true') return res.status(409).json({ error: 'Drawing has active alerts', activeAlertCount: activeCount });
    if (alerts.length) {
        await Alert.deleteMany({ _id: { $in: alerts.map((alert) => alert._id) }, userId: req.user._id });
        for (const alert of alerts) removeAlertFromCache(alert._id, alert.exchange, alert.symbol, alert.timeframe);
    }
    await ChartDrawing.deleteOne({ _id: drawing._id, userId: req.user._id });
    return res.json({ drawing, deletedAlerts: alerts.length });
}

module.exports = { listDrawings, createDrawing, updateDrawing, deleteDrawing, createSchema };
