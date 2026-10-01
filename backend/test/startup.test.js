const test = require('node:test');
const assert = require('node:assert/strict');

const { ConfigurationError, validateEnvironment, loadAndValidateEnvironment } = require('../config/environment');
const { createReadinessState } = require('../startups/health');
const { StartupError, start } = require('../startup');

function productionEnvironment(overrides = {}) {
    return {
        NODE_ENV: 'production',
        PORT: '3000',
        MONGODB_URI: 'mongodb://database.example.com/app',
        JWT_SECRET: 'a'.repeat(32),
        ENCRYPTION_KEY: 'b'.repeat(64),
        BACKEND_URL: 'https://api.example.com',
        FRONTEND_URL: 'https://app.example.com',
        GOOGLE_CLIENT_ID: 'google-client-id',
        GOOGLE_CLIENT_SECRET: 'google-client-secret',
        EXCHANGE_WS_URL: 'wss://stream.example.com',
        ...overrides
    };
}

function response() {
    return {
        statusCode: undefined,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

function fakeRuntime(events) {
    return {
        logger: {},
        readiness: {
            markReady() { events.push('ready'); },
            markNotReady() { events.push('not-ready'); }
        },
        async startBackgroundServices() { events.push('background'); },
        async listen() { events.push('listen'); }
    };
}

test('production environment requires secure complete configuration', () => {
    const config = validateEnvironment(productionEnvironment({ TRUST_PROXY_HOPS: '1' }));
    assert.equal(config.isProduction, true);
    assert.equal(config.frontendUrl, 'https://app.example.com');
    assert.equal(config.trustProxyHops, 1);

    assert.throws(
        () => validateEnvironment(productionEnvironment({ JWT_SECRET: '' })),
        (error) => error instanceof ConfigurationError && /JWT_SECRET/.test(error.message)
    );
    assert.throws(
        () => validateEnvironment(productionEnvironment({ FRONTEND_URL: 'http://localhost:5173' })),
        /must use HTTPS in production/
    );
    assert.throws(
        () => validateEnvironment(productionEnvironment({ FRONTEND_URL: 'https://[::1]:5173' })),
        /must not use a local address/
    );
    assert.throws(
        () => validateEnvironment({ ...productionEnvironment(), NODE_ENV: undefined }),
        /NODE_ENV must be supplied/
    );
});

test('startup does not infer development when NODE_ENV is absent', () => {
    const previousMode = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
        assert.throws(() => loadAndValidateEnvironment(), /NODE_ENV must be supplied/);
    } finally {
        if (previousMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousMode;
    }
});

test('database failure prevents background services and listening', async () => {
    const events = [];
    await assert.rejects(
        () => start({
            config: validateEnvironment(productionEnvironment()),
            connectDatabase: async () => { events.push('database'); throw new Error('connection refused'); },
            runtimeFactory: () => fakeRuntime(events),
            installHandlers: () => {}
        }),
        (error) => error instanceof StartupError && /server was not started/.test(error.message)
    );
    assert.deepEqual(events, ['database', 'not-ready']);
});

test('database succeeds before services become ready and server listens', async () => {
    const events = [];
    await start({
        config: validateEnvironment(productionEnvironment({ PORT: '0' })),
        connectDatabase: async () => { events.push('database'); },
        runtimeFactory: () => fakeRuntime(events),
        installHandlers: () => {}
    });
    assert.deepEqual(events, ['database', 'background', 'ready', 'listen']);
});

test('health and readiness responses disclose only state', () => {
    const readiness = createReadinessState();
    const health = response();
    readiness.health({}, health);
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.body, { status: 'ok' });

    const before = response();
    readiness.ready({}, before);
    assert.equal(before.statusCode, 503);
    assert.deepEqual(before.body, { status: 'not_ready' });

    readiness.markReady();
    const after = response();
    readiness.ready({}, after);
    assert.equal(after.statusCode, 200);
    assert.deepEqual(after.body, { status: 'ready' });
});
