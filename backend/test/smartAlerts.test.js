const test = require('node:test');
const assert = require('node:assert/strict');
const { sma, ema, rsi, macd, bollingerBands } = require('../services/indicators');
const { compare, buildMarketContext, evaluateCondition, evaluateGroup } = require('../services/smartAlertEvaluator');
const { fetchClosedCandles, processSmartAlert, addAlertToCache, removeAlertFromCache, smartAlertsCache } = require('../services/alertService');
const { Alert } = require('../models/alerts');
const { AlertEvent } = require('../models/alertEvents');
const { Trade } = require('../models/trades');

function candles(closes, volumes = []) {
    return closes.map((close, index) => ({ time: index * 60, open: index ? closes[index - 1] : close, high: close + 1, low: close - 1, close, volume: volumes[index] ?? 100 }));
}

test('SMA and EMA calculate deterministic values', () => {
    assert.equal(sma([1, 2, 3, 4, 5], 3), 4);
    assert.equal(ema([1, 2, 3, 4, 5], 3), 4);
    assert.equal(sma([1, 2], 3), null);
});

test('RSI uses Wilder smoothing and handles one-way markets', () => {
    assert.equal(rsi([1, 2, 3, 4, 5, 6], 5), 100);
    assert.equal(rsi([6, 5, 4, 3, 2, 1], 5), 0);
    assert.equal(rsi([1, 2], 14), null);
});

test('MACD returns line, signal, and histogram', () => {
    const value = macd(Array.from({ length: 50 }, (_, index) => index + 1));
    assert.ok(Number.isFinite(value.line));
    assert.ok(Number.isFinite(value.signal));
    assert.ok(Math.abs(value.histogram - (value.line - value.signal)) < 1e-12);
});

test('Bollinger Bands use population deviation', () => {
    const bands = bollingerBands([1, 2, 3, 4, 5], 5, 2);
    assert.equal(bands.middle, 3);
    assert.ok(Math.abs(bands.upper - (3 + 2 * Math.sqrt(2))) < 1e-12);
    assert.ok(Math.abs(bands.lower - (3 - 2 * Math.sqrt(2))) < 1e-12);
});

test('crosses above and below require a true transition', () => {
    assert.equal(compare(1, 3, 2, 2, 'crosses_above'), true);
    assert.equal(compare(3, 4, 2, 2, 'crosses_above'), false);
    assert.equal(compare(3, 1, 2, 2, 'crosses_below'), true);
});

test('EMA and MACD crossover conditions trigger once at crossover', () => {
    const emaContext = buildMarketContext(candles([1, 1, 1, 1, 1, 2]));
    assert.equal(evaluateCondition({ type: 'crossover', leftIndicator: 'ema', leftPeriod: 3, rightIndicator: 'ema', rightPeriod: 5, operator: 'crosses_above' }, emaContext).met, true);
    const macdContext = buildMarketContext(candles([...Array(40).fill(1), 2]));
    assert.equal(evaluateCondition({ type: 'crossover', leftIndicator: 'macd_line', rightIndicator: 'macd_signal', operator: 'crosses_above' }, macdContext).met, true);
});

test('AND and OR groups combine reusable conditions', () => {
    const context = buildMarketContext(candles(Array.from({ length: 20 }, (_, index) => index + 1)));
    const bullish = { type: 'candle', pattern: 'bullish' };
    const highRsi = { type: 'indicator', indicator: 'rsi', period: 14, operator: 'gt', value: 70 };
    const lowRsi = { ...highRsi, operator: 'lt', value: 30 };
    assert.equal(evaluateGroup({ operator: 'AND', conditions: [bullish, highRsi] }, context).met, true);
    assert.equal(evaluateGroup({ operator: 'OR', conditions: [bullish, lowRsi] }, context).met, true);
    assert.equal(evaluateGroup({ operator: 'AND', conditions: [bullish, lowRsi] }, context).met, false);
});

test('candle, volume, and trade conditions expose trigger context', () => {
    const context = buildMarketContext(candles([100, 101, 105], [100, 100, 250]));
    assert.equal(evaluateCondition({ type: 'candle', operator: 'closes_above', comparison: 'level', value: 104 }, context).met, true);
    assert.equal(evaluateCondition({ type: 'volume', comparison: 'average_multiplier', operator: 'gt', value: 2, period: 2 }, context).met, true);
    assert.equal(evaluateCondition({ type: 'trade', level: 'entry', operator: 'reaches', value: 103 }, context).met, true);
    assert.equal(evaluateCondition({ type: 'trade', level: 'take_profit', operator: 'crosses_above', value: 103 }, context).met, true);
    assert.equal(evaluateCondition({ type: 'trade', level: 'stop_loss_warning', value: 104, warningPercent: 1 }, context).met, true);
});

test('closed-candle fetch excludes unfinished candle and stops on exhausted history', async () => {
    const calls = [];
    const provider = { getCandles: async (_symbol, _timeframe, limit, endTime) => {
        calls.push({ limit, endTime });
        if (!endTime) return candles([1, 2, 3]).map((item, index) => ({ ...item, time: 60 + index * 60 }));
        return [];
    } };
    const result = await fetchClosedCandles(provider, 'BTCUSDT', '1m', 5, new Date(210_000));
    assert.deepEqual(result.map((item) => item.time), [60, 120]);
    assert.equal(calls.length, 1);
});

test('smart engine prevents duplicate candle triggers and skips deleted linked trades', async (t) => {
    const originals = { findOneAndUpdate: Alert.findOneAndUpdate, updateOne: Alert.updateOne, create: AlertEvent.create, exists: Trade.exists };
    t.after(() => { Alert.findOneAndUpdate = originals.findOneAndUpdate; Alert.updateOne = originals.updateOne; AlertEvent.create = originals.create; Trade.exists = originals.exists; });
    const item = { _id: 'smart-1', userId: 'user-1', exchange: 'bitunix', symbol: 'BTCUSDT', alertType: 'indicator', name: 'RSI', timeframe: '15m', conditions: [{ type: 'indicator', indicator: 'rsi', period: 5, operator: 'gt', value: 70 }], conditionLogic: 'AND', frequency: 'recurring', conditionMet: false, notificationMethods: ['in_app'], triggerCount: 0 };
    const context = buildMarketContext(candles([1, 2, 3, 4, 5, 6, 7]));
    let claimCount = 0;
    let eventCount = 0;
    Alert.findOneAndUpdate = async (_filter, update) => {
        if (update.$set.lastEvaluatedCandleTime !== undefined) return claimCount++ === 0 ? item : null;
        return { ...item, triggerCount: 1 };
    };
    Alert.updateOne = async () => ({});
    AlertEvent.create = async (event) => { eventCount += 1; return event; };
    Trade.exists = async () => true;
    await processSmartAlert(item, context, context.current.time, new Date());
    await processSmartAlert(item, context, context.current.time, new Date());
    assert.equal(eventCount, 1);

    const deletedTrade = { ...item, _id: 'smart-2', tradeId: 'trade-1' };
    Trade.exists = async () => false;
    await processSmartAlert(deletedTrade, context, context.current.time, new Date());
    assert.equal(claimCount, 2);
    assert.equal(eventCount, 1);
});

test('smart alerts share one exchange-symbol-timeframe group', (t) => {
    const base = { exchange: 'binance', symbol: 'BTCUSDT', timeframe: '15m', alertType: 'indicator', conditions: [{ type: 'indicator' }] };
    t.after(() => { removeAlertFromCache('group-1', 'binance', 'BTCUSDT', '15m'); removeAlertFromCache('group-2', 'binance', 'BTCUSDT', '15m'); });
    addAlertToCache({ ...base, _id: 'group-1' });
    addAlertToCache({ ...base, _id: 'group-2' });
    assert.equal(smartAlertsCache.get('binance:BTCUSDT:15m').length, 2);
});
