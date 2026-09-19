const test = require('node:test');
const assert = require('node:assert/strict');
const { ChartDrawing } = require('../models/chartDrawings');
const { Alert } = require('../models/alerts');
const controller = require('../controllers/chartDrawings');

function response() { return { statusCode: 200, body: undefined, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
const id = '507f1f77bcf86cd799439011';
const payload = { drawingId: 'drawing-1', exchange: 'bitunix', symbol: 'BTCUSDT', timeframe: '15m', drawingType: 'trendline', geometry: { points: [{ time: 100, price: 100 }, { time: 200, price: 110 }] }, label: 'Resistance' };

test('drawing persistence assigns authenticated owner', async (t) => {
    const original = ChartDrawing.create;
    t.after(() => { ChartDrawing.create = original; });
    let saved;
    ChartDrawing.create = async (value) => { saved = value; return { ...value, _id: id }; };
    const res = response();
    await controller.createDrawing({ user: { _id: 'owner-1' }, body: payload }, res);
    assert.equal(res.statusCode, 201);
    assert.equal(saved.userId, 'owner-1');
    assert.equal(saved.geometry.points.length, 2);
});

test('drawing update scopes lookup to owner and refreshes geometry', async (t) => {
    const originals = { findOne: ChartDrawing.findOne, findOneAndUpdate: ChartDrawing.findOneAndUpdate };
    t.after(() => Object.assign(ChartDrawing, originals));
    let filter;
    const existing = { ...payload, _id: id, userId: 'owner-1', toObject() { return { ...this }; } };
    ChartDrawing.findOne = async (value) => { filter = value; return existing; };
    ChartDrawing.findOneAndUpdate = async (_filter, update) => ({ ...existing, ...update.$set });
    const geometry = { points: [{ time: 100, price: 105 }, { time: 200, price: 120 }] };
    const res = response();
    await controller.updateDrawing({ user: { _id: 'owner-1' }, params: { id }, body: { geometry } }, res);
    assert.equal(filter.userId, 'owner-1');
    assert.deepEqual(res.body.geometry, geometry);

    ChartDrawing.findOne = async () => null;
    const denied = response();
    await controller.updateDrawing({ user: { _id: 'stranger' }, params: { id }, body: { geometry } }, denied);
    assert.equal(denied.statusCode, 404);
});

test('drawing deletion requires explicit cascade and removes linked alerts', async (t) => {
    const originals = { findOne: ChartDrawing.findOne, deleteOne: ChartDrawing.deleteOne, find: Alert.find, deleteMany: Alert.deleteMany };
    t.after(() => { ChartDrawing.findOne = originals.findOne; ChartDrawing.deleteOne = originals.deleteOne; Alert.find = originals.find; Alert.deleteMany = originals.deleteMany; });
    const existing = { ...payload, _id: id, userId: 'owner-1' };
    const linked = { _id: 'alert-1', drawingId: id, userId: 'owner-1', isActive: true, status: 'active', exchange: 'bitunix', symbol: 'BTCUSDT', timeframe: '15m' };
    let deleted = false;
    ChartDrawing.findOne = async (filter) => { assert.equal(filter.userId, 'owner-1'); return existing; };
    ChartDrawing.deleteOne = async () => { deleted = true; };
    Alert.find = async () => [linked];
    Alert.deleteMany = async () => ({ deletedCount: 1 });
    const blocked = response();
    await controller.deleteDrawing({ user: { _id: 'owner-1' }, params: { id }, query: {} }, blocked);
    assert.equal(blocked.statusCode, 409);
    assert.equal(deleted, false);
    const cascaded = response();
    await controller.deleteDrawing({ user: { _id: 'owner-1' }, params: { id }, query: { cascade: 'true' } }, cascaded);
    assert.equal(cascaded.body.deletedAlerts, 1);
    assert.equal(deleted, true);
});
