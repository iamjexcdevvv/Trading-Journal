const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'socket-security-test-secret';

const { createSocketAuthenticator } = require('../services/socketService');
const {
    createPriceFeedService,
    MAX_SUBSCRIPTIONS_PER_USER,
    MAX_SUBSCRIPTION_ATTEMPTS_PER_MINUTE
} = require('../services/priceFeedService');

const USER_ID = '507f191e810c19729de860ea';
const OTHER_USER_ID = '507f191e810c19729de860eb';

function socket(id, userId) {
    return {
        id,
        userId,
        handshake: { auth: {}, query: {} },
        rooms: new Set(),
        join(room) { this.rooms.add(room); },
        leave(room) { this.rooms.delete(room); }
    };
}

function connector() {
    const state = { connections: 0, stops: 0 };
    return {
        state,
        async getSymbols() { return ['BTCUSDT', 'ETHUSDT']; },
        connectTicker() {
            state.connections += 1;
            return { stop() { state.stops += 1; } };
        }
    };
}

function authenticate(authenticator, client) {
    return new Promise((resolve) => authenticator(client, resolve));
}

function validUser(id = USER_ID) {
    return { _id: id, approvalStatus: 'approved', role: 'user', refreshToken: 'stored-hash' };
}

test('unauthenticated socket cannot authenticate or allocate a feed', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const client = socket('unauthenticated');
    const error = await authenticate(createSocketAuthenticator(), client);
    assert.equal(error.message, 'Authentication failed');
    assert.deepEqual(await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT' }), { ok: false, error: 'Authentication required' });
    assert.equal(market.state.connections, 0);
});

test('invalid and malformed tokens are rejected', async () => {
    const authenticator = createSocketAuthenticator({ findUser: async () => validUser() });
    for (const token of ['not-a-jwt', '', null]) {
        const client = socket(`invalid-${String(token)}`);
        client.handshake.auth.token = token;
        const error = await authenticate(authenticator, client);
        assert.equal(error.message, 'Authentication failed');
    }
});

test('expired token is rejected', async () => {
    const client = socket('expired');
    client.handshake.auth.token = jwt.sign({ _id: USER_ID }, process.env.JWT_SECRET, { expiresIn: -1 });
    const error = await authenticate(createSocketAuthenticator({ findUser: async () => validUser() }), client);
    assert.equal(error.message, 'Authentication failed');
});

test('non-expiring token is rejected', async () => {
    const client = socket('non-expiring');
    client.handshake.auth.token = jwt.sign({ _id: USER_ID }, process.env.JWT_SECRET);
    const error = await authenticate(createSocketAuthenticator({ findUser: async () => validUser() }), client);
    assert.equal(error.message, 'Authentication failed');
});

test('authenticated identity comes from verified token and MongoDB user', async () => {
    const client = socket('authenticated');
    client.handshake.auth = {
        token: jwt.sign({ _id: USER_ID }, process.env.JWT_SECRET, { expiresIn: '5m' }),
        userId: OTHER_USER_ID
    };
    client.handshake.query = { token: 'must-not-be-used', userId: OTHER_USER_ID };
    const error = await authenticate(createSocketAuthenticator({ findUser: async (id) => validUser(id) }), client);
    assert.equal(error, undefined);
    assert.equal(client.userId, USER_ID);
    assert.equal(client.authExpiresAt > Date.now(), true);
    assert.equal(client.rooms.has(`user:${USER_ID}`), true);
    assert.equal(client.rooms.has(`user:${OTHER_USER_ID}`), false);
});

test('authenticated user can subscribe to a supported public feed', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const client = socket('permitted', USER_ID);
    assert.deepEqual(await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT' }), { ok: true });
    assert.deepEqual(service.inspect(), { feeds: 1, sockets: 1, users: 1 });
    assert.equal(market.state.connections, 1);
});

test('invalid exchange, symbol, interval, channel, and user ID fields are rejected', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const client = socket('invalid-payload', USER_ID);
    assert.equal((await service.subscribe(client, { exchange: 'unknown', symbol: 'BTCUSDT' })).ok, false);
    assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: '../BTC' })).ok, false);
    assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: 'FAKEUSDT' })).ok, false);
    assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT', interval: '1m' })).ok, false);
    assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT', channel: 'private' })).ok, false);
    assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT', userId: OTHER_USER_ID })).ok, false);
    assert.equal(market.state.connections, 0);
});

test('per-user subscription limit is enforced across sockets', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const clients = [];
    for (let index = 0; index < MAX_SUBSCRIPTIONS_PER_USER; index += 1) {
        const client = socket(`limited-${index}`, USER_ID);
        clients.push(client);
        assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT' })).ok, true);
    }
    const rejected = await service.subscribe(socket('limited-extra', USER_ID), { exchange: 'binance', symbol: 'BTCUSDT' });
    assert.deepEqual(rejected, { ok: false, error: 'Subscription limit reached' });
    assert.equal(market.state.connections, 1);
    await Promise.all(clients.map((client) => service.disconnect(client)));
});

test('per-socket event rate limit prevents unbounded subscription attempts', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const client = socket('rate-limited', USER_ID);
    for (let index = 0; index < MAX_SUBSCRIPTION_ATTEMPTS_PER_MINUTE; index += 1) {
        assert.equal((await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT' })).ok, true);
    }
    assert.deepEqual(
        await service.subscribe(client, { exchange: 'binance', symbol: 'BTCUSDT' }),
        { ok: false, error: 'Subscription rate limit reached' }
    );
    assert.equal(market.state.connections, 1);
});

test('duplicate subscriptions share one feed until final unsubscribe', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const first = socket('duplicate-1', USER_ID);
    const second = socket('duplicate-2', OTHER_USER_ID);
    await service.subscribe(first, { exchange: 'binance', symbol: 'BTCUSDT' });
    assert.deepEqual(await service.subscribe(first, { exchange: 'binance', symbol: 'BTCUSDT' }), { ok: true, duplicate: true });
    await service.subscribe(second, { exchange: 'binance', symbol: 'BTCUSDT' });
    assert.equal(market.state.connections, 1);

    await service.unsubscribe(first);
    assert.equal(market.state.stops, 0);
    assert.equal(service.inspect().feeds, 1);
    await service.unsubscribe(second);
    assert.equal(market.state.stops, 1);
    assert.deepEqual(service.inspect(), { feeds: 0, sockets: 0, users: 0 });
});

test('disconnect releases socket reference and closes final feed', async () => {
    const market = connector();
    const service = createPriceFeedService({ binance: market });
    const client = socket('disconnect', USER_ID);
    await service.subscribe(client, { exchange: 'binance', symbol: 'ETHUSDT' });
    await service.disconnect(client);
    assert.equal(market.state.stops, 1);
    assert.deepEqual(service.inspect(), { feeds: 0, sockets: 0, users: 0 });
});

test('frontend sends credentials only through Socket.IO handshake auth', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'frontend', 'src', 'composables', 'useSocket.js'), 'utf8');
    assert.match(source, /socket\.auth = newToken \? \{ token: newToken \} : \{\}/);
    assert.doesNotMatch(source, /query\s*:/);
    assert.doesNotMatch(source, /emit\(['"]authenticate['"]/);
    assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*token/i);
});
