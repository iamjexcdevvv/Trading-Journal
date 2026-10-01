const Joi = require('joi');
const mongoose = require('mongoose');
const { Alert, TIMEFRAMES } = require('../models/alerts');
const { Trade } = require('../models/trades');
const { ChartDrawing } = require('../models/chartDrawings');
const marketData = require('../services/exchanges/publicMarketData');
const { addAlertToCache, removeAlertFromCache } = require('../services/alertService');

const exchanges = Object.keys(marketData);
const priceConditions = ['crosses_above', 'crosses_below', 'price_gte', 'price_lte', 'percentage_increase', 'percentage_decrease'];
const conditionSchema = Joi.object({
    type: Joi.string().valid('indicator', 'price_indicator', 'crossover', 'candle', 'volume', 'trade').required(),
    indicator: Joi.string(), component: Joi.string(), period: Joi.number().integer().min(1).max(500),
    fastPeriod: Joi.number().integer().min(1).max(500), slowPeriod: Joi.number().integer().min(1).max(500), signalPeriod: Joi.number().integer().min(1).max(500),
    leftIndicator: Joi.string(), rightIndicator: Joi.string(), leftPeriod: Joi.number().integer().min(1).max(500), rightPeriod: Joi.number().integer().min(1).max(500),
    operator: Joi.string(), value: Joi.number(), deviation: Joi.number().positive(), comparison: Joi.string(), pattern: Joi.string(),
    level: Joi.string(), warningPercent: Joi.number().positive()
}).unknown(false);
const createSchema = Joi.object({
    name: Joi.string().trim().max(100).required(),
    exchange: Joi.string().valid(...exchanges).default('bitunix'),
    symbol: Joi.string().trim().uppercase().pattern(/^[A-Z0-9]{1,20}$/).required(),
    alertType: Joi.string().valid('price', 'indicator', 'crossover', 'candle', 'volume', 'trade', 'drawing').default('price'),
    condition: Joi.string().valid(...priceConditions), targetValue: Joi.number(),
    timeframe: Joi.string().valid(...TIMEFRAMES).default('15m'),
    conditions: Joi.array().items(conditionSchema).min(1).max(10), conditionLogic: Joi.string().valid('AND', 'OR').default('AND'),
    tradeId: Joi.string().hex().length(24), drawingId: Joi.string().hex().length(24),
    drawingCondition: Joi.string().valid('crosses_above', 'crosses_below', 'touches', 'enters', 'exits', 'crosses_upper', 'crosses_lower'),
    triggerMode: Joi.string().valid('realtime', 'candle_close').default('candle_close'),
    frequency: Joi.string().valid('once', 'recurring', 'once_per_candle').default('once'),
    notificationMethods: Joi.array().items(Joi.string().valid('in_app')).min(1).default(['in_app']),
    isActive: Joi.boolean().default(true), expiresAt: Joi.date().greater('now').allow(null),
    price: Joi.number(), type: Joi.string().valid('horizontal')
}).custom((value, helpers) => {
    if (value.alertType === 'price' && !value.condition) return helpers.message({ custom: 'condition is required for price alerts' });
    if (value.alertType === 'price' && value.targetValue === undefined && value.price === undefined) return helpers.message({ custom: 'targetValue is required for price alerts' });
    if (value.alertType === 'drawing' && (!value.drawingId || !value.drawingCondition)) return helpers.message({ custom: 'drawingId and drawingCondition are required for drawing alerts' });
    if (!['price', 'drawing'].includes(value.alertType) && !value.conditions) return helpers.message({ custom: 'conditions are required for smart alerts' });
    return value;
});
const updateSchema = Joi.object({
    name: Joi.string().trim().max(100), targetValue: Joi.number(), condition: Joi.string().valid(...priceConditions),
    conditions: Joi.array().items(conditionSchema).min(1).max(10), conditionLogic: Joi.string().valid('AND', 'OR'),
    frequency: Joi.string().valid('once', 'recurring', 'once_per_candle'), notificationMethods: Joi.array().items(Joi.string().valid('in_app')).min(1),
    isActive: Joi.boolean(), expiresAt: Joi.date().greater('now').allow(null), drawingCondition: Joi.string().valid('crosses_above', 'crosses_below', 'touches', 'enters', 'exits', 'crosses_upper', 'crosses_lower'),
    triggerMode: Joi.string().valid('realtime', 'candle_close')
}).min(1);

function validId(id) { return mongoose.Types.ObjectId.isValid(id); }
function normalizeLegacy(value) {
    const condition = ({ 'crossing up': 'crosses_above', 'crossing down': 'crosses_below', crossing: 'crosses_above' })[value.condition] || value.condition;
    return {
        ...value,
        name: value.name || (value.symbol ? `${String(value.symbol).toUpperCase()} price alert` : undefined),
        condition,
        targetValue: value.targetValue ?? value.price,
        price: undefined,
        type: undefined
    };
}

async function createAlert(req, res) {
    const { value, error } = createSchema.validate(normalizeLegacy(req.body), { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message });
    if (value.tradeId && !await Trade.exists({ _id: value.tradeId, userId: req.user._id })) return res.status(404).json({ error: 'Linked trade not found' });
    if (value.alertType === 'drawing') {
        const drawing = await ChartDrawing.findOne({ _id: value.drawingId, userId: req.user._id });
        if (!drawing) return res.status(404).json({ error: 'Drawing not found' });
        value.exchange = drawing.exchange;
        value.symbol = drawing.symbol;
        value.timeframe = drawing.timeframe;
    }
    let previousPrice = null;
    try { previousPrice = await marketData[value.exchange].getCurrentPrice(value.symbol); }
    catch (priceError) {
        if (value.isActive) return res.status(502).json({ error: 'Unable to obtain current market price' });
    }
    const referencePrice = value.condition?.startsWith('percentage_') ? previousPrice : null;
    const alert = await Alert.create({ ...value, userId: req.user._id, previousPrice, referencePrice, schemaVersion: 5 });
    if (alert.isActive) addAlertToCache(alert);
    return res.status(201).json(alert);
}

async function getAlerts(req, res) { return res.json(await Alert.find({ userId: req.user._id }).sort({ createdAt: -1 })); }

async function updateAlert(req, res) {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Alert not found' });
    const existing = await Alert.findOne({ _id: req.params.id, userId: req.user._id });
    if (!existing) return res.status(404).json({ error: 'Alert not found' });
    const { value, error } = updateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(400).json({ error: error.details[0].message });
    if (value.targetValue !== undefined && existing.condition?.startsWith('percentage_') && existing.referencePrice == null) {
        value.referencePrice = await marketData[existing.exchange].getCurrentPrice(existing.symbol);
    }
    const alert = await Alert.findOneAndUpdate({ _id: req.params.id, userId: req.user._id }, { $set: value }, { new: true, runValidators: true });
    removeAlertFromCache(existing._id, existing.exchange, existing.symbol, existing.timeframe);
    if (alert.isActive) addAlertToCache(alert);
    return res.json(alert);
}

async function deleteAlert(req, res) {
    if (!validId(req.params.id)) return res.status(404).json({ error: 'Alert not found' });
    const alert = await Alert.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!alert) return res.status(404).json({ error: 'Alert not found' });
    removeAlertFromCache(alert._id, alert.exchange, alert.symbol, alert.timeframe);
    return res.json(alert);
}

module.exports = { createAlert, getAlerts, updateAlert, deleteAlert, createSchema, updateSchema };
