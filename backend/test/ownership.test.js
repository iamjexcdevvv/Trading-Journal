const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');

const trades = require('../models/trades');
const tags = require('../models/tags');
const strategies = require('../models/strategies');
const alerts = require('../models/alerts');
const setups = require('../models/setups');
const tradingRules = require('../models/tradingRules');
const connections = require('../models/exchangeConnections');

const OWNER = '507f191e810c19729de860ea';
const STRANGER = '507f191e810c19729de860eb';
const RESOURCE_ID = '507f1f77bcf86cd799439011';

async function verifyScopedMutation(t, modelName, method, invoke) {
    const Model = mongoose.model(modelName);
    const original = Model[method];
    const filters = [];
    t.after(() => { Model[method] = original; });

    Model[method] = async (filter) => {
        filters.push(filter);
        return String(filter.userId) === OWNER ? { _id: RESOURCE_ID, userId: OWNER } : null;
    };

    assert.ok(await invoke(OWNER));
    assert.equal(await invoke(STRANGER), null);
    assert.equal(filters.length, 2);
    for (const filter of filters) {
        assert.equal(String(filter._id), RESOURCE_ID);
        assert.ok(filter.userId);
    }
}

async function verifyScopedList(t, modelName, invoke) {
    const Model = mongoose.model(modelName);
    const original = Model.find;
    const filters = [];
    t.after(() => { Model.find = original; });

    Model.find = (filter) => {
        filters.push(filter);
        return { sort: async () => [], then(resolve) { resolve([]); } };
    };

    await invoke(OWNER);
    await invoke(STRANGER);
    assert.deepEqual(filters.map((filter) => String(filter.userId)), [OWNER, STRANGER]);
}

test('trade reads, updates, and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'Trade', trades.getTradesByUserId);
    await verifyScopedMutation(t, 'Trade', 'findOneAndUpdate', (userId) => trades.updateTradeById(RESOURCE_ID, userId, { notes: 'updated' }));
    await verifyScopedMutation(t, 'Trade', 'findOneAndDelete', (userId) => trades.deleteTradeById(RESOURCE_ID, userId));
});

test('tag reads, updates, and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'Tag', tags.getUserTagsById);
    await verifyScopedMutation(t, 'Tag', 'findOneAndUpdate', (userId) => tags.updateTagById(RESOURCE_ID, userId, 'updated'));
    await verifyScopedMutation(t, 'Tag', 'findOneAndDelete', (userId) => tags.deleteTagById(RESOURCE_ID, userId));
});

test('strategy reads, updates, and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'Strategy', strategies.getStrategiesByUserId);
    await verifyScopedMutation(t, 'Strategy', 'findOneAndUpdate', (userId) => strategies.updateStrategyById(RESOURCE_ID, userId, { name: 'updated', direction: 'Long' }));
    await verifyScopedMutation(t, 'Strategy', 'findOneAndDelete', (userId) => strategies.deleteStrategyById(RESOURCE_ID, userId));
});

test('alert reads and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'Alert', alerts.getAlertsByUserId);
    await verifyScopedMutation(t, 'Alert', 'findOneAndDelete', (userId) => alerts.deleteAlertById(RESOURCE_ID, userId));
});

test('setup reads, updates, and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'Setup', setups.getSetupsByUserId);
    await verifyScopedMutation(t, 'Setup', 'findOneAndUpdate', (userId) => setups.updateSetupById(RESOURCE_ID, userId, { name: 'updated' }));
    await verifyScopedMutation(t, 'Setup', 'findOneAndDelete', (userId) => setups.deleteSetupById(RESOURCE_ID, userId));
});

test('trading-rule reads, updates, and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'TradingRule', tradingRules.getTradingRulesByUserId);
    await verifyScopedMutation(t, 'TradingRule', 'findOneAndUpdate', (userId) => tradingRules.updateTradingRuleById(RESOURCE_ID, userId, { text: 'updated' }));
    await verifyScopedMutation(t, 'TradingRule', 'findOneAndDelete', (userId) => tradingRules.deleteTradingRuleById(RESOURCE_ID, userId));
});

test('exchange-connection reads and deletes require ownership', async (t) => {
    await verifyScopedList(t, 'ExchangeConnection', connections.getConnectionsByUserId);
    await verifyScopedMutation(t, 'ExchangeConnection', 'findOne', (userId) => connections.getConnectionById(RESOURCE_ID, userId));
    await verifyScopedMutation(t, 'ExchangeConnection', 'findOneAndDelete', (userId) => connections.deleteConnectionById(RESOURCE_ID, userId));
});
