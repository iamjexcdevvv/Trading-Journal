const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateCondition, shouldTrigger, isExpired, addAlertToCache, removeAlertFromCache, activeSubscriptions } = require('../services/alertService');
const marketData = require('../services/exchanges/publicMarketData');

function alert(condition, overrides = {}) {
    return { condition, targetValue: 100, referencePrice: 100, conditionMet: false, frequency: 'recurring', lastTriggeredCandle: null, ...overrides };
}

test('crosses above only on upward threshold transition', () => {
    assert.deepEqual(evaluateCondition(alert('crosses_above'), 99, 100), { met: true, triggered: true });
    assert.equal(evaluateCondition(alert('crosses_above'), 100, 101).triggered, false);
});

test('crosses below only on downward threshold transition', () => {
    assert.deepEqual(evaluateCondition(alert('crosses_below'), 101, 100), { met: true, triggered: true });
    assert.equal(evaluateCondition(alert('crosses_below'), 100, 99).triggered, false);
});

test('price comparisons trigger on first entry into matching state', () => {
    assert.equal(evaluateCondition(alert('price_gte'), 90, 100).triggered, true);
    assert.equal(evaluateCondition(alert('price_gte', { conditionMet: true }), 101, 102).triggered, false);
    assert.equal(evaluateCondition(alert('price_lte'), 110, 100).triggered, true);
});

test('percentage movement uses creation reference price', () => {
    const increase = evaluateCondition(alert('percentage_increase', { targetValue: 5 }), 104, 105);
    const decrease = evaluateCondition(alert('percentage_decrease', { targetValue: 5 }), 96, 95);
    assert.equal(increase.triggered, true);
    assert.equal(increase.change, 5);
    assert.equal(decrease.triggered, true);
    assert.equal(decrease.change, 5);
});

test('once and recurring require a fresh condition transition', () => {
    const met = { met: true, triggered: true };
    assert.equal(shouldTrigger(alert('price_gte', { frequency: 'once' }), met, 10), true);
    assert.equal(shouldTrigger(alert('price_gte', { frequency: 'recurring' }), met, 10), true);
    assert.equal(shouldTrigger(alert('price_gte'), { met: true, triggered: false }, 10), false);
});

test('once per candle prevents duplicates but permits next candle for level conditions', () => {
    const item = alert('price_gte', { frequency: 'once_per_candle', lastTriggeredCandle: 10 });
    assert.equal(shouldTrigger(item, { met: true, triggered: false }, 10), false);
    assert.equal(shouldTrigger(item, { met: true, triggered: false }, 11), true);
});

test('expiration compares exact date boundary', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    assert.equal(isExpired({ expiresAt: '2026-09-15T11:59:59Z' }, now), true);
    assert.equal(isExpired({ expiresAt: '2026-09-15T12:00:01Z' }, now), false);
    assert.equal(isExpired({ expiresAt: null }, now), false);
});

test('subscriptions isolate identical symbols across exchanges', (t) => {
    const originalBinance = marketData.binance.connectTicker;
    const originalBybit = marketData.bybit.connectTicker;
    marketData.binance.connectTicker = () => ({ stop() {} });
    marketData.bybit.connectTicker = () => ({ stop() {} });
    t.after(() => {
        removeAlertFromCache('binance-alert', 'binance', 'BTCUSDT');
        removeAlertFromCache('bybit-alert', 'bybit', 'BTCUSDT');
        marketData.binance.connectTicker = originalBinance;
        marketData.bybit.connectTicker = originalBybit;
    });
    addAlertToCache({ _id: 'binance-alert', exchange: 'binance', symbol: 'BTCUSDT' });
    addAlertToCache({ _id: 'bybit-alert', exchange: 'bybit', symbol: 'BTCUSDT' });
    assert.equal(activeSubscriptions.has('binance:BTCUSDT'), true);
    assert.equal(activeSubscriptions.has('bybit:BTCUSDT'), true);
});
