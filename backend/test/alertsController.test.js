const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { Alert } = require('../models/alerts');
const { Trade } = require('../models/trades');
const { ChartDrawing } = require('../models/chartDrawings');
const marketData = require('../services/exchanges/publicMarketData');
const controller = require('../controllers/alerts');
const authMiddleware = require('../middleware/auth');

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        send(body) { this.body = body; return this; }
    };
}

test('create alert validates input and assigns authenticated owner', async (t) => {
    const originalCreate = Alert.create;
    const originalPrice = marketData.bitunix.getCurrentPrice;
    const originalBinancePrice = marketData.binance.getCurrentPrice;
    t.after(() => { Alert.create = originalCreate; marketData.bitunix.getCurrentPrice = originalPrice; marketData.binance.getCurrentPrice = originalBinancePrice; });
    marketData.bitunix.getCurrentPrice = async () => 119950;
    marketData.binance.getCurrentPrice = async () => 120050;
    let saved;
    Alert.create = async (value) => {
        saved = value;
        return { ...value, _id: 'alert-1', toObject() { return this; } };
    };

    const res = response();
    await controller.createAlert({ user: { _id: 'user-1' }, body: { name: 'BTC breakout', exchange: 'bitunix', symbol: 'btcusdt', condition: 'crosses_above', targetValue: 120000, frequency: 'once', notificationMethods: ['in_app'], isActive: false } }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(saved.userId, 'user-1');
    assert.equal(saved.exchange, 'bitunix');
    assert.equal(saved.symbol, 'BTCUSDT');
    assert.equal(saved.previousPrice, 119950);

    const binanceResponse = response();
    await controller.createAlert({ user: { _id: 'user-1' }, body: { name: 'Binance breakout', exchange: 'binance', symbol: 'BTCUSDT', condition: 'price_gte', targetValue: 121000, isActive: false } }, binanceResponse);
    assert.equal(binanceResponse.statusCode, 201);
    assert.equal(saved.exchange, 'binance');
    assert.equal(saved.previousPrice, 120050);

    const invalid = response();
    await controller.createAlert({ user: { _id: 'user-1' }, body: { symbol: 'BTCUSDT' } }, invalid);
    assert.equal(invalid.statusCode, 400);
});

test('edit and delete always scope database queries to authenticated owner', async (t) => {
    const originals = { findOne: Alert.findOne, findOneAndUpdate: Alert.findOneAndUpdate, findOneAndDelete: Alert.findOneAndDelete };
    const originalPrice = marketData.bitunix.getCurrentPrice;
    t.after(() => { Object.assign(Alert, originals); marketData.bitunix.getCurrentPrice = originalPrice; });
    marketData.bitunix.getCurrentPrice = async () => 100;
    const id = '507f1f77bcf86cd799439011';
    const owner = '507f191e810c19729de860ea';
    const existing = { _id: id, userId: owner, exchange: 'bitunix', symbol: 'BTCUSDT', condition: 'price_gte', referencePrice: null, isActive: false, status: 'active' };
    const filters = [];
    Alert.findOne = async (filter) => { filters.push(filter); return existing; };
    Alert.findOneAndUpdate = async (filter, update) => { filters.push(filter); return { ...existing, ...update.$set }; };
    Alert.findOneAndDelete = async (filter) => { filters.push(filter); return existing; };

    const editRes = response();
    await controller.updateAlert({ user: { _id: owner }, params: { id }, body: { name: 'Updated' } }, editRes);
    assert.equal(editRes.statusCode, 200);
    const deleteRes = response();
    await controller.deleteAlert({ user: { _id: owner }, params: { id } }, deleteRes);
    assert.equal(deleteRes.statusCode, 200);
    assert.ok(filters.every((filter) => String(filter.userId) === owner));
});

test('auth middleware rejects missing and invalid tokens, accepts valid token', () => {
    process.env.JWT_SECRET = 'alert-auth-test-secret';
    const missing = response();
    authMiddleware({ headers: {} }, missing, () => assert.fail('missing token called next'));
    assert.equal(missing.statusCode, 401);

    const invalid = response();
    authMiddleware({ headers: { authorization: 'Bearer invalid' } }, invalid, () => assert.fail('invalid token called next'));
    assert.equal(invalid.statusCode, 401);

    const req = { headers: { authorization: `Bearer ${jwt.sign({ _id: 'user-1' }, process.env.JWT_SECRET)}` } };
    let called = false;
    authMiddleware(req, response(), () => { called = true; });
    assert.equal(called, true);
    assert.equal(req.user._id, 'user-1');
});

test('smart alert validation rejects bad periods and linked trades from another user', async (t) => {
    const originalCreate = Alert.create;
    const originalExists = Trade.exists;
    const originalPrice = marketData.bitunix.getCurrentPrice;
    t.after(() => { Alert.create = originalCreate; Trade.exists = originalExists; marketData.bitunix.getCurrentPrice = originalPrice; });
    marketData.bitunix.getCurrentPrice = async () => 100;
    Alert.create = async (value) => ({ ...value, _id: 'smart-1', toObject() { return this; } });
    const base = { name: 'RSI alert', symbol: 'BTCUSDT', alertType: 'indicator', timeframe: '15m', conditions: [{ type: 'indicator', indicator: 'rsi', period: 14, operator: 'lt', value: 30 }], isActive: false };

    const bad = response();
    await controller.createAlert({ user: { _id: 'user-1' }, body: { ...base, conditions: [{ ...base.conditions[0], period: 0 }] } }, bad);
    assert.equal(bad.statusCode, 400);

    Trade.exists = async () => null;
    const forbidden = response();
    await controller.createAlert({ user: { _id: 'user-1' }, body: { ...base, tradeId: '507f1f77bcf86cd799439011' } }, forbidden);
    assert.equal(forbidden.statusCode, 404);

    Trade.exists = async (filter) => filter.userId === 'user-1';
    const valid = response();
    await controller.createAlert({ user: { _id: 'user-1' }, body: { ...base, tradeId: '507f1f77bcf86cd799439011' } }, valid);
    assert.equal(valid.statusCode, 201);
    assert.equal(valid.body.schemaVersion, 5);
});

test('drawing alerts require owned drawing and inherit its market scope', async (t) => {
    const originals = { create: Alert.create, drawingFind: ChartDrawing.findOne, price: marketData.bitunix.getCurrentPrice };
    t.after(() => { Alert.create = originals.create; ChartDrawing.findOne = originals.drawingFind; marketData.bitunix.getCurrentPrice = originals.price; });
    const drawingId = '507f1f77bcf86cd799439011';
    const body = { name: 'Resistance break', symbol: 'ETHUSDT', exchange: 'binance', timeframe: '1h', alertType: 'drawing', drawingId, drawingCondition: 'crosses_above', triggerMode: 'realtime', isActive: false };
    ChartDrawing.findOne = async () => null;
    const denied = response();
    await controller.createAlert({ user: { _id: 'owner-1' }, body }, denied);
    assert.equal(denied.statusCode, 404);

    ChartDrawing.findOne = async (filter) => filter.userId === 'owner-1' ? { _id: drawingId, exchange: 'bitunix', symbol: 'BTCUSDT', timeframe: '15m', drawingType: 'trendline' } : null;
    marketData.bitunix.getCurrentPrice = async () => 100;
    let saved;
    Alert.create = async (value) => { saved = value; return { ...value, _id: 'drawing-alert' }; };
    const valid = response();
    await controller.createAlert({ user: { _id: 'owner-1' }, body }, valid);
    assert.equal(valid.statusCode, 201);
    assert.equal(saved.exchange, 'bitunix');
    assert.equal(saved.symbol, 'BTCUSDT');
    assert.equal(saved.timeframe, '15m');
});
