const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const { User } = require('../models/users');
require('../models/strategies');
require('../models/setups');
const { premadeStrategies, withGlobalStrategies, withGlobalSetups, normalizedName } = require('../services/premadePlaybook');
const strategiesController = require('../controllers/strategies');
const setupsController = require('../controllers/setups');
const OWNER = '507f191e810c19729de860ea';
const OTHER = '507f191e810c19729de860eb';

function response() {
    return { statusCode: 200, body: null,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

function mockReads(t, personalStrategies = [], personalSetups = []) {
    const filters = [];
    t.mock.method(User, 'findById', async id => ({ _id: id, refreshToken: 'valid' }));
    for (const [name, rows] of [['Strategy', personalStrategies], ['Setup', personalSetups]]) {
        const Model = mongoose.model(name);
        t.mock.method(Model, 'find', async filter => {
            filters.push(filter);
            return rows.filter(row => row.userId === String(filter.userId));
        });
        for (const method of ['updateOne', 'findOneAndUpdate', 'findOneAndDelete']) {
            t.mock.method(Model, method, () => { throw new Error('Unexpected database mutation'); });
        }
    }
    t.mock.method(User, 'updateOne', () => { throw new Error('Unexpected user mutation'); });
    return filters;
}

test('empty accounts receive six globals with no user ownership or database writes', async t => {
    const filters = mockReads(t);
    for (const userId of [OWNER, OTHER]) {
        const req = { user: { _id: userId } };
        const strategies = response();
        const setups = response();
        await strategiesController.getUserStrategies(req, strategies);
        await setupsController.getUserSetups(req, setups);
        assert.equal(strategies.statusCode, 200);
        assert.equal(setups.statusCode, 200);
        assert.equal(strategies.body.length, 6);
        assert.equal(setups.body.length, 6);
        assert.ok([...strategies.body, ...setups.body].every(row => row.isGlobal && !('userId' in row)));
        assert.deepEqual(strategies.body.filter(row => row.direction === 'Long').map(row => row.name),
            ['TRBO', 'Bounce Play', 'Tabo Paakyat']);
        assert.deepEqual(strategies.body.filter(row => row.direction === 'Short').map(row => row.name),
            ['TLSBD', 'Correction Play', 'Tabo Pababa']);
    }
    assert.deepEqual(filters.map(filter => String(filter.userId)), [OWNER, OWNER, OWNER, OTHER, OTHER, OTHER]);
});

test('existing personal strategies and confluences override globals without duplication or changes', async t => {
    const strategies = premadeStrategies.map(({ name, direction }, index) =>
        ({ _id: `personal-strategy-${index}`, userId: OWNER, name, direction }));
    const setups = premadeStrategies.map(({ name }, index) =>
        ({ _id: `personal-setup-${index}`, userId: OWNER, name,
            items: [{ label: `Custom ${index}`, required: false }] }));
    const before = structuredClone({ strategies, setups });
    mockReads(t, strategies, setups);
    const strategyResult = response();
    const setupResult = response();
    await strategiesController.getUserStrategies({ user: { _id: OWNER } }, strategyResult);
    await setupsController.getUserSetups({ user: { _id: OWNER } }, setupResult);
    assert.deepEqual(strategyResult.body, strategies);
    assert.deepEqual(setupResult.body, setups);
    assert.deepEqual({ strategies, setups }, before);
    const other = response();
    await setupsController.getUserSetups({ user: { _id: OTHER } }, other);
    assert.ok(other.body.every(row => row.isGlobal && !row.userId));
});

test('partial personal matches suppress only matching globals, ignoring case and outer whitespace', () => {
    const strategies = [{ _id: 'custom', name: ' trbo ', direction: 'Long' }];
    const setups = [{ _id: 'custom-setup', name: ' bounce play ', items: [] }];
    const mergedStrategies = withGlobalStrategies(strategies);
    const mergedSetups = withGlobalSetups(setups, strategies);
    assert.equal(mergedStrategies.length, 6);
    assert.equal(mergedStrategies[0], strategies[0]);
    assert.equal(mergedSetups.length, 5);
    assert.equal(mergedSetups[0], setups[0]);
    assert.equal(mergedSetups.find(row => row._id === 'global:setup:trbo'), undefined);
    // Directions remain separate, while one confluence checklist is shared by name.
    assert.equal(withGlobalStrategies([{ name: 'TRBO', direction: 'Short' }]).length, 7);
});

test('long-form aliases suppress global strategies and setups in every letter case', () => {
    for (const [alias, abbreviation, direction] of [
        ['Trendline Breakout', 'TRBO', 'Long'],
        ['Trendline Breakdown', 'TLSBD', 'Short'],
    ]) {
        for (const name of [alias, alias.toUpperCase(), alias.toLowerCase(), ` ${alias} `,
            abbreviation, abbreviation.toLowerCase()]) {
            const strategy = { _id: 'personal', name, direction };
            const setup = { _id: 'personal-setup', name, items: [{ label: 'My rule', required: false }] };
            const strategies = withGlobalStrategies([strategy]);
            const setups = withGlobalSetups([setup], [strategy]);
            assert.equal(strategies.length, 6);
            assert.equal(setups.length, 6);
            assert.equal(strategies[0], strategy);
            assert.equal(setups[0], setup);
            assert.ok(!strategies.some(row => row._id === `global:strategy:${abbreviation.toLowerCase()}`));
            assert.ok(!setups.some(row => row._id === `global:setup:${abbreviation.toLowerCase()}`));
            const fallback = withGlobalSetups([], [strategy])
                .find(row => row._id === `global:setup:${abbreviation.toLowerCase()}`);
            assert.equal(fallback, undefined);
        }
    }
});

test('personal strategy overrides global confluences even without a personal setup', async t => {
    const strategies = [{ _id: 'personal', userId: OWNER, name: 'Trendline Breakout', direction: 'Long' }];
    const setups = [];
    mockReads(t, strategies, setups);
    const read = async () => {
        const res = response();
        await setupsController.getUserSetups({ user: { _id: OWNER } }, res);
        assert.equal(res.statusCode, 200);
        return res.body;
    };
    let result = await read();
    assert.equal(result.length, 5);
    assert.ok(!result.some(row => normalizedName(row.name) === 'trbo'));
    const personal = { _id: 'personal-setup', userId: OWNER, name: 'trbo',
        items: [{ label: 'Personal confirmation', required: false }] };
    setups.push(personal);
    result = await read();
    assert.equal(result.length, 6);
    assert.equal(result.find(row => normalizedName(row.name) === 'trbo'), personal);
    // Removing the personal strategy restores its global fallback when no personal setup remains.
    strategies.length = 0;
    setups.length = 0;
    result = await read();
    assert.equal(result.length, 6);
    assert.ok(result.find(row => row._id === 'global:setup:trbo'));
});

test('every personal preset strategy suppresses its global setup', () => {
    for (const { name, direction } of premadeStrategies) {
        const result = withGlobalSetups([], [{ name: name.toUpperCase(), direction }]);
        assert.equal(result.length, 5);
        assert.ok(!result.some(row => normalizedName(row.name) === normalizedName(name)));
    }
});

test('trade forms and playbook match aliases to abbreviations consistently with backend', async () => {
    const { normalizeStrategyName } = await import('../../frontend/src/utils/strategyNames.js');
    for (const [abbreviation, alias] of [['TRBO', 'Trendline Breakout'], ['TLSBD', 'Trendline Breakdown']]) {
        for (const name of [abbreviation, abbreviation.toLowerCase(), alias, alias.toUpperCase(), ` ${alias.toLowerCase()} `]) {
            assert.equal(normalizedName(name), abbreviation.toLowerCase());
            assert.equal(normalizeStrategyName(name), normalizedName(name));
        }
        const personalSetup = { name: alias.toUpperCase(), items: [{ label: 'Personal confirmation' }] };
        const setups = withGlobalSetups([personalSetup]);
        assert.equal(setups.find(row => normalizeStrategyName(row.name) === normalizeStrategyName(abbreviation)), personalSetup);
    }
    assert.equal(normalizeStrategyName('Bounce Play'), normalizedName('Bounce Play'));
});

test('supplied checklists retain exact labels, ordering, and optional flags', () => {
    const byName = Object.fromEntries(withGlobalSetups([]).map(row => [row.name, row.items]));
    assert.deepEqual(byName['Tabo Paakyat'], [
        { label: 'Is it uptrend?', required: true },
        { label: 'Is there a breakout happened?', required: true },
        { label: 'Is there a significant buying volume?', required: true },
    ]);
    assert.deepEqual(byName['Tabo Pababa'], [
        { label: 'Is it downtrend?', required: true },
        { label: 'Is there a breakdown happened?', required: true },
        { label: 'Is there a significant selling volume?', required: true },
    ]);
    assert.deepEqual(byName.TRBO, [
        { label: 'IS THE TRENDLINE RESISTANCE MULTI WEEK/MONTH/YEAR', required: true },
        { label: 'IS THERE RIGHT HAND?', required: true },
        { label: 'IS THERE CCC (W/MACD CONFIRMATIONS)', required: true },
        { label: 'IS IT ON KEY LEVEL SUPPORT (Historical levels, .382, .5, .618)', required: true },
        { label: 'IS IT ON RSI 30@30', required: false },
        { label: 'IS THERE REVERSAL PATTERN?', required: false },
    ]);
    assert.deepEqual(byName.TLSBD, [
        { label: 'IS THE TRENDLINE SUPPORT MULTI WEEK/MONTH/YEAR', required: true },
        { label: 'IS THERE LEFT HAND', required: true },
        { label: 'IS THERE CCC (W/MACD CONFIRMATIONS)', required: true },
        { label: 'IS IT ON KEY LEVEL RESISTANCE (Historical levels, .382, .5, .618)', required: true },
        { label: 'IS THERE REVERSAL PATTERN?', required: false },
        { label: 'IS IT ON RSI 70@30', required: false },
    ]);
    assert.deepEqual(byName['Bounce Play'], [
        { label: 'IS IT UPTREND?', required: true },
        { label: 'IS THERE CCC?', required: true },
        { label: 'IS IT ON KEY LEVEL SUPPORT (Historical levels, .382, .5, .382)', required: true },
        { label: 'IS IT ON OVERSOLD TERRITORY', required: false },
        { label: 'IS THERE BIG BUYING VOLUME ON HIGHER TF', required: true },
    ]);
    assert.deepEqual(byName['Correction Play'], [
        { label: 'IS IT DOWNTREND', required: true },
        { label: 'IS IT ON KEY LEVEL RESISTANCE (Historical levels, .382, .5, .618)', required: true },
        { label: 'IS THERE CCC', required: true },
        { label: 'IS IT ON OVERBOUGHT TERRITORY', required: false },
        { label: 'IS THERE BIG SELLING VOLUME ON HIGHER TF', required: true },
    ]);
});

test('global responses are independent and stable across users and repeated requests', () => {
    const first = withGlobalSetups([]);
    const second = withGlobalSetups([]);
    assert.deepEqual(first, second);
    first[0].items[0].label = 'Changed';
    assert.notEqual(second[0].items[0].label, 'Changed');
    assert.deepEqual(withGlobalSetups([]), second);
});

test('global presets reject editing and deletion without database mutations', async t => {
    mockReads(t);
    for (const [controller, methods, id] of [
        [strategiesController, ['updateStrategy', 'deleteStrategy'], 'global:strategy:trbo'],
        [setupsController, ['updateSetup', 'deleteSetup'], 'global:setup:trbo'],
    ]) {
        for (const method of methods) {
            const res = response();
            await controller[method]({ user: { _id: OWNER }, params: { id },
                body: controller === strategiesController
                    ? { name: 'TRBO', direction: 'Long' }
                    : { name: 'TRBO', items: [] } }, res);
            assert.equal(res.statusCode, 403);
            assert.match(res.body.error, /read-only/);
        }
    }
});

test('unauthenticated account state receives no catalogue', async t => {
    mockReads(t);
    t.mock.method(User, 'findById', async () => null);
    for (const handler of [strategiesController.getUserStrategies, setupsController.getUserSetups]) {
        const res = response();
        await handler({ user: { _id: OWNER } }, res);
        assert.equal(res.statusCode, 401);
    }
});
