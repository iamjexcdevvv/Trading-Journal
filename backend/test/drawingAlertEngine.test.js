const test = require('node:test');
const assert = require('node:assert/strict');
const { Alert } = require('../models/alerts');
const { AlertEvent } = require('../models/alertEvents');
const { processDrawingRealtime, processDrawingEvaluation, refreshDrawingInCache, activeAlertsCache } = require('../services/alertService');

function alert(overrides = {}) {
    return { _id: 'drawing-alert-1', userId: 'owner-1', exchange: 'bitunix', symbol: 'BTCUSDT', timeframe: '15m', alertType: 'drawing', drawingId: 'drawing-1', drawingCondition: 'crosses_above', triggerMode: 'realtime', frequency: 'recurring', previousPrice: 99, previousEvaluationTime: 100, conditionMet: false, notificationMethods: ['in_app'], _drawing: { _id: 'drawing-1', drawingType: 'horizontal_line', label: 'Resistance', geometry: { points: [{ time: 1, price: 100 }] } }, ...overrides };
}

test('realtime drawing alert triggers once and stores drawing context', async (t) => {
    const originals = { updateOne: Alert.updateOne, findOneAndUpdate: Alert.findOneAndUpdate, create: AlertEvent.create };
    t.after(() => { Alert.updateOne = originals.updateOne; Alert.findOneAndUpdate = originals.findOneAndUpdate; AlertEvent.create = originals.create; });
    let events = 0;
    let stored;
    Alert.updateOne = async () => ({});
    Alert.findOneAndUpdate = async (_filter, update) => ({ ...alert(), triggerCount: update.$inc ? 1 : 0 });
    AlertEvent.create = async (value) => { events += 1; stored = value; return value; };
    const item = alert();
    await processDrawingRealtime(item, 101, new Date(101_000));
    await processDrawingRealtime(item, 102, new Date(102_000));
    assert.equal(events, 1);
    assert.equal(stored.drawingValueAtTrigger, 100);
    assert.equal(stored.drawingCondition, 'crosses_above');
});

test('candle-close drawing evaluation uses closed candle timestamps', async (t) => {
    const originals = { updateOne: Alert.updateOne, findOneAndUpdate: Alert.findOneAndUpdate, create: AlertEvent.create };
    t.after(() => { Alert.updateOne = originals.updateOne; Alert.findOneAndUpdate = originals.findOneAndUpdate; AlertEvent.create = originals.create; });
    let stored;
    Alert.updateOne = async () => ({});
    Alert.findOneAndUpdate = async () => ({ ...alert({ triggerMode: 'candle_close' }), triggerCount: 1 });
    AlertEvent.create = async (value) => { stored = value; return value; };
    await processDrawingEvaluation(alert({ triggerMode: 'candle_close' }), { time: 900, price: 99 }, { time: 1800, price: 101 }, new Date(2_000_000), 1800);
    assert.equal(stored.triggerContext.previousPosition, 'below');
    assert.equal(stored.triggeredAt.getTime(), 2_000_000);
});

test('drawing cache refresh changes geometry used by active alert', () => {
    const item = alert();
    activeAlertsCache.set('bitunix:BTCUSDT', [item]);
    refreshDrawingInCache({ _id: 'drawing-1', drawingType: 'horizontal_line', geometry: { points: [{ time: 1, price: 120 }] } });
    assert.equal(activeAlertsCache.get('bitunix:BTCUSDT')[0]._drawing.geometry.points[0].price, 120);
    activeAlertsCache.delete('bitunix:BTCUSDT');
});
