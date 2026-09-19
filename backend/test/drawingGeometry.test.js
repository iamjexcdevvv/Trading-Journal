const test = require('node:test');
const assert = require('node:assert/strict');
const { getDrawingValueAtTime, getChannelBoundariesAtTime, evaluateDrawingCondition } = require('../services/drawingGeometry');

function drawing(drawingType, points) { return { drawingType, geometry: { points } }; }
function evaluate(item, condition, previous, current) { return evaluateDrawingCondition(item, condition, previous, current); }

test('horizontal line detects cross above, cross below, and touch transitions', () => {
    const line = drawing('horizontal_line', [{ time: 1, price: 100 }]);
    assert.equal(evaluate(line, 'crosses_above', { time: 1, price: 99 }, { time: 2, price: 101 }).triggered, true);
    assert.equal(evaluate(line, 'crosses_below', { time: 1, price: 101 }, { time: 2, price: 99 }).triggered, true);
    assert.equal(evaluate(line, 'touches', { time: 1, price: 99 }, { time: 2, price: 100 }).triggered, true);
    assert.equal(evaluate(line, 'crosses_above', { time: 1, price: 101 }, { time: 2, price: 102 }).triggered, false);
});

test('ascending and descending trendlines project dynamic boundaries', () => {
    const ascending = drawing('trendline', [{ time: 0, price: 100 }, { time: 10, price: 110 }]);
    const descending = drawing('trendline', [{ time: 0, price: 110 }, { time: 10, price: 100 }]);
    assert.equal(getDrawingValueAtTime(ascending, 5), 105);
    assert.equal(evaluate(ascending, 'crosses_above', { time: 5, price: 104 }, { time: 6, price: 107 }).triggered, true);
    assert.equal(evaluate(descending, 'crosses_below', { time: 5, price: 106 }, { time: 6, price: 103 }).triggered, true);
});

test('ray projects only at and after first anchor', () => {
    const ray = drawing('ray', [{ time: 10, price: 100 }, { time: 20, price: 110 }]);
    assert.equal(getDrawingValueAtTime(ray, 9), null);
    assert.equal(getDrawingValueAtTime(ray, 30), 120);
});

test('rectangle detects zone entry and exit without repeated entry', () => {
    const zone = drawing('rectangle', [{ time: 1, price: 100 }, { time: 2, price: 110 }]);
    assert.equal(evaluate(zone, 'enters', { time: 1, price: 95 }, { time: 2, price: 105 }).triggered, true);
    assert.equal(evaluate(zone, 'enters', { time: 2, price: 105 }, { time: 3, price: 106 }).triggered, false);
    assert.equal(evaluate(zone, 'exits', { time: 2, price: 105 }, { time: 3, price: 111 }).triggered, true);
});

test('parallel channel calculates and crosses changing boundaries', () => {
    const channel = drawing('parallel_channel', [{ time: 0, price: 100 }, { time: 10, price: 110 }, { time: 0, price: 90 }]);
    assert.deepEqual(getChannelBoundariesAtTime(channel, 5), { lower: 95, upper: 105 });
    assert.equal(evaluate(channel, 'crosses_upper', { time: 5, price: 104 }, { time: 6, price: 107 }).triggered, true);
    assert.equal(evaluate(channel, 'crosses_lower', { time: 5, price: 96 }, { time: 6, price: 94 }).triggered, true);
});
