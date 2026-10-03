const test = require('node:test');
const assert = require('node:assert/strict');
const { completedPositions } = require('../services/exchanges/binanceHistory');
const binance = require('../services/exchanges/binanceAdapter');
const okx = require('../services/exchanges/okxAdapter');
const bitunix = require('../services/exchanges/bitunixAdapter');
const { Trade } = require('../models/trades');
const { ExchangeConnection } = require('../models/exchangeConnections');
const { User } = require('../models/users');
const { encrypt } = require('../utils/encryption');
const { importConnectionHistory } = require('../services/exchangeSyncService');
const controller = require('../controllers/connections');
const OWNER = '507f191e810c19729de860ea';
const OTHER = '507f191e810c19729de860eb';
const CONNECTION = '507f1f77bcf86cd799439011';
const NOW = 1800000000000;
const WEEK = 7 * 86400000;

function fill(id, side, qty, price, pnl = 0, positionSide = 'BOTH') {
    return { id, side, qty: String(qty), price: String(price), realizedPnl: String(pnl),
        commission: '0.1', positionSide, symbol: 'BTCUSDT', time: NOW - 10000 + id };
}

test('Binance reconstructs long, short, partial exits, and separate cycles', () => {
    const records = completedPositions([
        fill(1, 'BUY', 2, 100), fill(2, 'SELL', 1, 110, 10), fill(3, 'SELL', 1, 120, 20),
        fill(4, 'SELL', 1, 150), fill(5, 'BUY', 1, 140, 10),
        fill(6, 'BUY', 1, 130), // Still open; do not import it as closed.
    ], [{ externalId: 'BTCUSDT-BOTH', direction: 'Long', qty: 1 }]);
    assert.equal(records.length, 2);
    assert.deepEqual(records.map(row => [row.direction, row.entryPrice, row.exitPrice, row.pnl]),
        [['Long', 100, 115, 30], ['Short', 150, 140, 10]]);
    assert.equal(records[0].qty, 2);
    assert.ok(Math.abs(records[0].fee - 0.3) < 1e-9);
    assert.notEqual(records[0].historyId, records[1].historyId);
});

test('Binance handles hedge mode, reversal fills, and positions opened before the window', () => {
    const records = completedPositions([fill(1, 'BUY', 1, 100), fill(2, 'SELL', 2, 110, 10),
        fill(3, 'BUY', 1, 100, 10)], []);
    assert.deepEqual(records.map(row => row.direction), ['Long', 'Short']);
    const earlier = completedPositions([fill(4, 'SELL', 1, 110, 10, 'LONG')], []);
    assert.equal(earlier[0].openedAt, null);
    assert.equal(earlier[0].entryPrice, 100);
    const hedge = completedPositions([fill(1, 'SELL', 1, 150, 0, 'SHORT'),
        fill(2, 'BUY', 1, 140, 10, 'SHORT')], []);
    assert.equal(hedge[0].direction, 'Short');
    assert.throws(() => completedPositions([fill(1, 'BUY', 1, 100, 5)],
        [{ externalId: 'BTCUSDT-BOTH', direction: 'Long', qty: 1 }]), /changed during import/);
    assert.throws(() => completedPositions([{ ...fill(1, 'BUY', 1, 100), price: 'invalid' }], []), /Invalid/);
});

function mockFetch(t, handler) {
    t.mock.method(global, 'fetch', async value => ({ ok: true, json: async () => handler(new URL(value)) }));
}

test('Bitunix pages all position history and includes older openings closed within seven days', async t => {
    const urls = [];
    const position = (id, closedAt) => ({ positionId: String(id), symbol: 'BTCUSDT', side: 'LONG',
        entryPrice: '100', closePrice: '110', maxQty: '1', realizedPNL: '10', fee: '0.1',
        leverage: 10, ctime: NOW - WEEK - 1000, mtime: closedAt });
    mockFetch(t, url => {
        urls.push(url);
        return { code: 0, data: { positionList: urls.length === 1
            ? Array.from({ length: 100 }, (_, i) => position(i + 1, NOW - WEEK - 1))
            : [position(101, NOW - 1)], total: 101 } };
    });
    const records = await bitunix.getClosedTrades({ apiKey: 'key', apiSecret: 'secret' }, NOW - WEEK, NOW);
    assert.equal(records.length, 1);
    assert.equal(records[0].sourceExternalId, '101');
    assert.equal(urls[1].searchParams.get('skip'), '100');
    assert.equal(urls[0].searchParams.has('startTime'), false);
});

test('OKX pages by uTime, imports only full closes, and normalizes net direction', async t => {
    const urls = [];
    const position = (id, type, time) => ({ posId: String(id), instId: 'BTC-USDT-SWAP', type,
        posSide: 'net', direction: 'short', cTime: String(NOW - WEEK - 1000), uTime: String(time),
        openAvgPx: '150', closeAvgPx: '140', closeTotalPos: '1', pnl: '10', fee: '-0.1', lever: '5' });
    mockFetch(t, url => {
        urls.push(url);
        return { code: '0', data: urls.length === 1
            ? Array.from({ length: 100 }, (_, i) => position(i + 1, '1', NOW - i - 1))
            : [position(101, '2', NOW - 101), position(102, '3', NOW - WEEK - 1)] };
    });
    const records = await okx.getClosedTrades({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' }, NOW - WEEK, NOW);
    assert.equal(records.length, 1);
    assert.equal(records[0].direction, 'Short');
    assert.equal(records[0].entryPrice, 150);
    assert.equal(urls[1].searchParams.get('after'), String(NOW - 100));
});

test('Binance discovers symbols from income and uses fill IDs without incompatible time parameters', async t => {
    const urls = [];
    let fillPages = 0;
    mockFetch(t, url => {
        urls.push(url);
        if (url.pathname.includes('positionInformation')) return [];
        if (url.pathname.endsWith('/income')) return [{ symbol: 'BTCUSDT', incomeType: 'COMMISSION' }];
        fillPages++;
        return fillPages === 1 ? Array.from({ length: 1000 }, (_, i) => i % 2 === 0
            ? fill(i + 1, 'BUY', 1, 100) : fill(i + 1, 'SELL', 1, 100)) : [];
    });
    const records = await binance.getClosedTrades({ apiKey: 'key', apiSecret: 'secret' }, NOW - WEEK, NOW);
    assert.equal(records.length, 500); // Zero-PnL positions are still trades.
    const page2 = urls.filter(url => url.pathname.endsWith('/userTrades'))[1];
    assert.equal(page2.searchParams.get('fromId'), '1001');
    assert.equal(page2.searchParams.has('startTime'), false);
    assert.equal(page2.searchParams.has('endTime'), false);
});

function historyFixture(t) {
    const oldKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = 'a'.repeat(64);
    t.after(() => { if (oldKey === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = oldKey; });
    t.mock.method(Date, 'now', () => NOW);
    const connection = { _id: CONNECTION, userId: OWNER, exchange: 'bitunix', status: 'connected',
        apiKeyEnc: encrypt('key'), apiSecretEnc: encrypt('secret') };
    const record = { historyId: 'position-1', sourceExternalId: 'position-1', symbol: 'BTCUSDT', direction: 'Long',
        openedAt: NOW - 10000, closedAt: NOW - 1000, entryPrice: 100, exitPrice: 110,
        qty: 1, pnl: 10, fee: 0.1, leverage: 5 };
    const stored = [];
    const filters = [];
    t.mock.method(ExchangeConnection, 'countDocuments', async () => 2);
    t.mock.method(bitunix, 'getClosedTrades', async (_creds, from, to) => {
        assert.equal(from, NOW - WEEK); assert.equal(to, NOW); return [record];
    });
    t.mock.method(Trade, 'findOne', async filter => {
        filters.push(filter);
        const scope = filter.$and[0];
        const sourceExternalId = filter.$and[1].$or[1].$and[0].$or[0].sourceExternalId;
        return stored.find(row => String(row.userId) === String(filter.userId) &&
            (String(row.connectionId) === String(scope.connectionId ?? scope.$or?.[0].connectionId) ||
                (scope.$or && !row.connectionId)) && row.exchange === filter.exchange &&
            (String(row._id) === String(filter.$and[1].$or[0]._id) ||
                ((row.sourceExternalId === sourceExternalId || (!row.connectionId && row.externalId === sourceExternalId)) && row.date >= new Date(record.openedAt) &&
                    row.date <= new Date(record.closedAt))));
    });
    t.mock.method(Trade, 'updateOne', async (filter, update) => {
        if (stored.some(row => String(row._id) === String(filter._id))) return { upsertedCount: 0 };
        stored.push({ _id: filter._id, ...update.$setOnInsert });
        return { upsertedCount: 1 };
    });
    t.mock.method(Trade, 'findOneAndUpdate', async (filter, update) => {
        const row = stored.find(row => row._id === filter._id && row.userId === filter.userId && row.status === 'open');
        if (!row) return null;
        Object.assign(row, update.$set); return row;
    });
    return { connection, record, stored, filters };
}

test('history import is bounded, isolated by account/connection, repeatable, and preserves notes', async t => {
    const { connection, record, stored, filters } = historyFixture(t);
    const first = await importConnectionHistory(connection);
    assert.equal(first.imported, 1);
    stored[0].notes = 'My journal notes';
    assert.equal((await importConnectionHistory(connection)).skipped, 1);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].notes, 'My journal notes');
    assert.equal(stored[0].closedAt.getTime(), record.closedAt);
    await importConnectionHistory({ ...connection, userId: OTHER });
    await importConnectionHistory({ ...connection, _id: '507f1f77bcf86cd799439012' });
    assert.equal(stored.length, 3);
    assert.ok(filters.every(filter => filter.userId && filter.$and[0].connectionId && filter.exchange));
});

test('history import closes an already tracked trade without overwriting personal fields', async t => {
    const { connection, record, stored } = historyFixture(t);
    stored.push({ _id: 'tracked', userId: OWNER, connectionId: CONNECTION, exchange: 'bitunix',
        sourceExternalId: record.sourceExternalId, date: new Date(record.openedAt), status: 'open',
        strategy: 'TRBO', notes: 'Keep me', checklist: [{ label: 'My rule', checked: true }] });
    const summary = await importConnectionHistory(connection);
    assert.equal(summary.updated, 1);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].status, 'closed');
    assert.equal(stored[0].notes, 'Keep me');
    assert.equal(stored[0].strategy, 'TRBO');
    assert.deepEqual(stored[0].checklist, [{ label: 'My rule', checked: true }]);
});

test('invalid history fails before writes; out-of-window records are excluded', async t => {
    const { connection, record, stored } = historyFixture(t);
    t.mock.method(bitunix, 'getClosedTrades', async () => [record, { ...record, qty: NaN }]);
    await assert.rejects(importConnectionHistory(connection), /invalid trade history/);
    assert.equal(stored.length, 0);
    t.mock.method(bitunix, 'getClosedTrades', async () => [
        { ...record, openedAt: NOW - WEEK - 2000, closedAt: NOW - WEEK - 1 },
        { ...record, closedAt: NOW + 1 }, record,
    ]);
    assert.equal((await importConnectionHistory(connection)).imported, 1);
    assert.equal(stored.length, 1);
});

test('legacy synced records are reused only when the exchange has one eligible connection', async t => {
    const { connection, record, stored } = historyFixture(t);
    stored.push({ _id: 'legacy', userId: OWNER, exchange: 'bitunix', symbol: record.symbol,
        direction: record.direction, externalId: record.sourceExternalId,
        date: new Date(record.openedAt), status: 'closed', notes: 'Legacy notes' });
    t.mock.method(ExchangeConnection, 'countDocuments', async () => 1);
    assert.equal((await importConnectionHistory(connection)).skipped, 1);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].notes, 'Legacy notes');
    t.mock.method(ExchangeConnection, 'countDocuments', async () => 2);
    assert.equal((await importConnectionHistory(connection)).imported, 1);
    assert.equal(stored.length, 2);
});

test('partial database failure can retry without duplicating previous inserts', async t => {
    const { connection, record, stored } = historyFixture(t);
    t.mock.method(bitunix, 'getClosedTrades', async () => [record, { ...record, historyId: 'position-2', sourceExternalId: 'position-2' }]);
    const original = Trade.updateOne;
    let writes = 0;
    t.mock.method(Trade, 'updateOne', async (...args) => {
        writes++;
        if (writes === 2) throw new Error('database unavailable');
        return original(...args);
    });
    await assert.rejects(importConnectionHistory(connection), /database unavailable/);
    assert.equal(stored.length, 1);
    const summary = await importConnectionHistory(connection);
    assert.equal(summary.imported, 1);
    assert.equal(summary.skipped, 1);
    assert.equal(stored.length, 2);
});

function response() {
    return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; } };
}

test('import endpoint rejects malformed IDs and another account connection', async t => {
    const { connection } = historyFixture(t);
    t.mock.method(User, 'findById', async id => ({ _id: id, refreshToken: 'present' }));
    t.mock.method(ExchangeConnection, 'findOne', async filter => {
        assert.equal(filter._id, CONNECTION);
        return filter.userId === OWNER ? connection : null;
    });
    const invalid = response();
    await controller.importExchangeHistory({ params: { id: 'invalid' }, user: { _id: OWNER } }, invalid);
    assert.equal(invalid.statusCode, 400);
    const other = response();
    await controller.importExchangeHistory({ params: { id: CONNECTION }, user: { _id: OTHER } }, other);
    assert.equal(other.statusCode, 404);
    const result = response();
    await controller.importExchangeHistory({ params: { id: CONNECTION }, user: { _id: OWNER } }, result);
    assert.equal(result.statusCode, 200);
    assert.equal(result.body.imported, 1);
});

test('provider errors remain private and the user can safely retry', async t => {
    const { connection, stored } = historyFixture(t);
    t.mock.method(User, 'findById', async () => ({ _id: OWNER, refreshToken: 'present' }));
    t.mock.method(ExchangeConnection, 'findOne', async () => connection);
    t.mock.method(bitunix, 'getClosedTrades', async () => { throw new Error('secret credential details'); });
    const result = response();
    await controller.importExchangeHistory({ params: { id: CONNECTION }, user: { _id: OWNER } }, result);
    assert.equal(result.statusCode, 502);
    assert.doesNotMatch(result.body.error, /secret credential details/);
    assert.equal(stored.length, 0);
});

test('concurrent history imports serialize and create one journal record', async t => {
    const { connection, stored } = historyFixture(t);
    const results = await Promise.all([importConnectionHistory(connection), importConnectionHistory(connection)]);
    assert.equal(stored.length, 1);
    assert.equal(results.reduce((sum, result) => sum + result.imported, 0), 1);
    assert.equal(results.reduce((sum, result) => sum + result.skipped, 0), 1);
});

test('cross-process duplicate-key races are accepted only for the same owner and deterministic ID', async t => {
    const { connection } = historyFixture(t);
    t.mock.method(Trade, 'updateOne', async () => { throw Object.assign(new Error('duplicate'), { code: 11000 }); });
    t.mock.method(Trade, 'exists', async filter => {
        assert.equal(filter.userId, OWNER);
        assert.ok(filter._id); return { _id: filter._id };
    });
    assert.equal((await importConnectionHistory(connection)).skipped, 1);
    t.mock.method(Trade, 'exists', async () => null);
    await assert.rejects(importConnectionHistory(connection), /duplicate/);
});

test('disabled connections and invalid user sessions cannot import', async t => {
    const { connection, stored } = historyFixture(t);
    t.mock.method(User, 'findById', async () => ({ _id: OWNER, refreshToken: 'present' }));
    t.mock.method(ExchangeConnection, 'findOne', async () => ({ ...connection, status: 'disabled' }));
    const disabled = response();
    await controller.importExchangeHistory({ params: { id: CONNECTION }, user: { _id: OWNER } }, disabled);
    assert.equal(disabled.statusCode, 409);
    t.mock.method(User, 'findById', async () => null);
    const invalid = response();
    await controller.importExchangeHistory({ params: { id: CONNECTION }, user: { _id: OWNER } }, invalid);
    assert.equal(invalid.statusCode, 401);
    assert.equal(stored.length, 0);
});

test('OKX rejects a cursor that does not advance instead of silently dropping history', async t => {
    mockFetch(t, () => ({ code: '0', data: Array.from({ length: 100 }, () => ({ uTime: String(NOW - 1), type: '1' })) }));
    await assert.rejects(okx.getClosedTrades({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' }, NOW - WEEK, NOW), /pagination/);
});

test('Binance rejects an inventory change during history retrieval', async t => {
    let snapshots = 0;
    mockFetch(t, url => {
        if (!url.pathname.includes('positionInformation')) return [];
        snapshots++;
        return snapshots === 1 ? [] : [{ symbol: 'BTCUSDT', positionSide: 'LONG', positionAmt: '1', entryPrice: '100' }];
    });
    await assert.rejects(binance.getClosedTrades({ apiKey: 'key', apiSecret: 'secret' }, NOW - WEEK, NOW), /changed during import/);
});
