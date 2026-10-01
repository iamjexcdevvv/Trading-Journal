const test = require('node:test');
const assert = require('node:assert/strict');

const binance = require('../services/exchanges/binanceAdapter');
const okx = require('../services/exchanges/okxAdapter');
const trades = require('../models/trades');

test('Binance rejects API keys with trading permission before storing them', async (t) => {
    const originalFetch = global.fetch;
    let requests = 0;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => {
        requests += 1;
        return {
            ok: true,
            json: async () => ({ enableReading: true, enableFutures: true, enableWithdrawals: false })
        };
    };

    await assert.rejects(
        binance.testConnection({ apiKey: 'key', apiSecret: 'secret' }),
        /read-only permission/
    );
    assert.equal(requests, 1);
});

test('OKX rejects API keys with trading or withdrawal permission', async (t) => {
    const originalFetch = global.fetch;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async () => ({
        ok: true,
        json: async () => ({ code: '0', data: [{ perm: 'read_only,trade' }] })
    });

    await assert.rejects(
        okx.testConnection({ apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' }),
        /read-only permission/
    );
});

test('Binance paginates fill history instead of silently truncating it', async (t) => {
    const originalFetch = global.fetch;
    const urls = [];
    t.after(() => { global.fetch = originalFetch; });
    const firstPage = Array.from({ length: 1000 }, (_, id) => ({
        id,
        price: '100',
        qty: '1',
        realizedPnl: '0',
        commission: '0.01',
        time: 1700000000000 + id,
        positionSide: 'LONG'
    }));
    global.fetch = async (url) => {
        urls.push(String(url));
        return { ok: true, json: async () => urls.length === 1 ? firstPage : [] };
    };

    const fills = await binance.getFillsSince(
        { apiKey: 'key', apiSecret: 'secret' },
        'BTCUSDT',
        1700000000000
    );
    assert.equal(fills.length, 1000);
    assert.match(urls[1], /fromId=1000/);
    assert.doesNotMatch(urls[1], /startTime=/);
});

test('OKX closure lookup is scoped to exact position ID', async (t) => {
    const originalFetch = global.fetch;
    let url;
    t.after(() => { global.fetch = originalFetch; });
    global.fetch = async (value) => {
        url = String(value);
        return {
            ok: true,
            json: async () => ({ code: '0', data: [
                { posId: 'position-1', uTime: '1700000000100', closeAvgPx: '101', closeTotalPos: '1', pnl: '2', fee: '-0.1', posSide: 'long' },
                { posId: 'position-2', uTime: '1700000000200', closeAvgPx: '102', closeTotalPos: '1', pnl: '3', fee: '-0.1', posSide: 'long' }
            ] })
        };
    };

    const fills = await okx.getFillsSince(
        { apiKey: 'key', apiSecret: 'secret', passphrase: 'pass' },
        'BTC-USDT-SWAP',
        1700000000000,
        'position-1'
    );
    assert.match(url, /posId=position-1/);
    assert.equal(fills.length, 1);
    assert.equal(fills[0].pnl, 2);
});

test('synced-trade lookup is connection-scoped and open-only', async (t) => {
    const originalFindOne = trades.Trade.findOne;
    const filters = [];
    t.after(() => { trades.Trade.findOne = originalFindOne; });
    trades.Trade.findOne = async (filter) => {
        filters.push(filter);
        return { _id: 'trade-1' };
    };

    await trades.findSyncedTrade('user-1', 'connection-1', 'binance', 'BTCUSDT-BOTH');
    assert.deepEqual(filters[0], {
        userId: 'user-1',
        connectionId: 'connection-1',
        exchange: 'binance',
        sourceExternalId: 'BTCUSDT-BOTH',
        status: 'open'
    });
});

test('closing a synced trade is idempotent', async (t) => {
    const originalUpdate = trades.Trade.findOneAndUpdate;
    let filter;
    t.after(() => { trades.Trade.findOneAndUpdate = originalUpdate; });
    trades.Trade.findOneAndUpdate = async (value) => { filter = value; return null; };

    await trades.closeSyncedTrade('trade-1', 'user-1', { pnl: 4 });
    assert.deepEqual(filter, { _id: 'trade-1', userId: 'user-1', status: 'open' });
});

test('exchange position validation rejects malformed numeric data', () => {
    const { validatePosition } = require('../services/exchangeSyncService')._test;
    assert.throws(() => validatePosition({
        externalId: 'position-1', symbol: 'BTCUSDT', direction: 'Long',
        entryPrice: Number.NaN, qty: 1, leverage: 5
    }), /invalid position/);
});

test('connection lock serializes overlapping sync operations', async () => {
    const { withConnectionLock } = require('../services/exchangeSyncService')._test;
    const events = [];
    let releaseFirst;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });

    const first = withConnectionLock('connection-1', async () => {
        events.push('first-start');
        await firstGate;
        events.push('first-end');
    });
    const second = withConnectionLock('connection-1', async () => {
        events.push('second');
    });

    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['first-start']);
    releaseFirst();
    await Promise.all([first, second]);
    assert.deepEqual(events, ['first-start', 'first-end', 'second']);
});

test('connection request validation rejects unexpected secrets and invalid IDs', async () => {
    const controller = require('../controllers/connections');
    const response = () => ({
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    });

    const invalidBody = response();
    await controller.createExchangeConnection({
        user: { _id: '507f191e810c19729de860ea' },
        body: { exchange: 'binance', label: 'Main', apiKey: 'key', apiSecret: 'secret', passphrase: 'unexpected' }
    }, invalidBody);
    assert.equal(invalidBody.statusCode, 400);

    const invalidId = response();
    await controller.syncExchangeConnectionNow({
        user: { _id: '507f191e810c19729de860ea' },
        params: { id: 'not-an-object-id' }
    }, invalidId);
    assert.equal(invalidId.statusCode, 400);
});

test('manual sync failure returns a safe error instead of false success', async (t) => {
    const users = require('../models/users');
    const connections = require('../models/exchangeConnections');
    const syncService = require('../services/exchangeSyncService');
    const controllerPath = require.resolve('../controllers/connections');
    const originals = {
        getUserById: users.getUserById,
        getConnectionById: connections.getConnectionById,
        syncConnectionNow: syncService.syncConnectionNow
    };
    t.after(() => {
        Object.assign(users, { getUserById: originals.getUserById });
        Object.assign(connections, { getConnectionById: originals.getConnectionById });
        Object.assign(syncService, { syncConnectionNow: originals.syncConnectionNow });
        delete require.cache[controllerPath];
    });

    users.getUserById = async () => ({ _id: '507f191e810c19729de860ea', refreshToken: 'present' });
    connections.getConnectionById = async () => ({ _id: '507f1f77bcf86cd799439011' });
    syncService.syncConnectionNow = async () => { throw new Error('secret provider detail'); };
    delete require.cache[controllerPath];
    const controller = require(controllerPath);
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };

    await controller.syncExchangeConnectionNow({
        user: { _id: '507f191e810c19729de860ea' },
        params: { id: '507f1f77bcf86cd799439011' }
    }, res);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error, 'Exchange synchronization failed; connection marked as error');
    assert.doesNotMatch(res.body.error, /secret provider detail/);
});

test('existing open synced trade updates position data without erasing its history', async (t) => {
    const connections = require('../models/exchangeConnections');
    const servicePath = require.resolve('../services/exchangeSyncService');
    const originals = {
        findSyncedTrade: trades.findSyncedTrade,
        updateTradeById: trades.updateTradeById,
        countDocuments: connections.ExchangeConnection.countDocuments
    };
    let update;
    t.after(() => {
        trades.findSyncedTrade = originals.findSyncedTrade;
        trades.updateTradeById = originals.updateTradeById;
        connections.ExchangeConnection.countDocuments = originals.countDocuments;
        delete require.cache[servicePath];
    });

    trades.findSyncedTrade = async () => ({
        _id: 'trade-1', connectionId: 'connection-1', externalId: 'record-1', date: new Date(1)
    });
    trades.updateTradeById = async (_id, _userId, value) => { update = value; return value; };
    connections.ExchangeConnection.countDocuments = async () => 1;
    delete require.cache[servicePath];
    const service = require(servicePath);

    await service._test.handlePositionUpdate(
        { _id: 'connection-1', userId: 'user-1', exchange: 'binance' },
        { externalId: 'BTCUSDT-BOTH', symbol: 'BTCUSDT', direction: 'Long', entryPrice: 101, qty: 2, leverage: 10 }
    );

    assert.equal(update.qty, 2);
    assert.equal(update.entryPrice, 101);
    assert.equal(update.externalId, 'record-1');
    assert.equal(Object.hasOwn(update, 'date'), false);
    assert.equal(Object.hasOwn(update, 'pnl'), false);
});
