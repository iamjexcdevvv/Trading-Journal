const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const crypto = require('node:crypto');

process.env.JWT_SECRET = 'oauth-security-test-secret';
process.env.FRONTEND_URL = 'https://frontend.test';

const { User } = require('../models/users');
const {
    OAuthArtifact,
    OAUTH_CODE_TTL_MS,
    issueOAuthArtifact
} = require('../models/oauthArtifacts');
const {
    loginUser,
    refreshToken,
    logoutUser,
    googleAuth,
    exchangeOAuthCode,
    beginGoogleAuth,
    verifyGoogleState
} = require('../controllers/auth');

function response() {
    return {
        statusCode: 200,
        body: undefined,
        redirectUrl: undefined,
        cookies: [],
        clearedCookies: [],
        locals: {},
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        cookie(name, value, options) { this.cookies.push({ name, value, options }); return this; },
        clearCookie(name, options) { this.clearedCookies.push({ name, options }); return this; },
        redirect(url) { this.redirectUrl = url; return this; }
    };
}

function useMemoryArtifactStore(t) {
    const originalCreate = OAuthArtifact.create;
    const originalFindOneAndDelete = OAuthArtifact.findOneAndDelete;
    const records = new Map();

    t.after(() => {
        OAuthArtifact.create = originalCreate;
        OAuthArtifact.findOneAndDelete = originalFindOneAndDelete;
    });

    OAuthArtifact.create = async (record) => {
        const stored = { ...record };
        records.set(`${stored.kind}:${stored.tokenHash}`, stored);
        return stored;
    };
    OAuthArtifact.findOneAndDelete = async (filter) => {
        const key = `${filter.kind}:${filter.tokenHash}`;
        const record = records.get(key);
        if (!record || record.expiresAt <= filter.expiresAt.$gt) return null;
        records.delete(key);
        return record;
    };

    return records;
}

function approvedUser() {
    const user = {
        _id: '507f191e810c19729de860eb',
        googleId: 'google-user-1',
        username: 'OAuth User',
        email: 'oauth@example.com',
        approvalStatus: 'approved',
        role: 'user'
    };
    user.save = async () => user;
    return user;
}

async function createState(res) {
    let nextCalled = false;
    await beginGoogleAuth({}, res, (error) => {
        assert.equal(error, undefined);
        nextCalled = true;
    });
    assert.equal(nextCalled, true);
    return res.cookies.find((cookie) => cookie.name === 'oauthState').value;
}

test('OAuth redirect contains only a temporary code', async (t) => {
    useMemoryArtifactStore(t);
    const originalFindOne = User.findOne;
    t.after(() => { User.findOne = originalFindOne; });
    const user = approvedUser();
    User.findOne = async () => user;

    const res = response();
    await googleAuth({ user: { id: user.googleId, displayName: user.username, emails: [{ value: user.email }] } }, res);

    assert.match(res.redirectUrl, /^https:\/\/frontend\.test\/auth\/callback\?code=[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(res.redirectUrl, /accessToken|access_token|refreshToken|refresh_token/i);
    assert.equal(res.cookies.length, 0);
});

test('one-time code succeeds once and replay fails', async (t) => {
    useMemoryArtifactStore(t);
    const originalFindById = User.findById;
    t.after(() => { User.findById = originalFindById; });
    const user = approvedUser();
    User.findById = async () => user;
    const code = await issueOAuthArtifact('code', { userId: user._id, ttlMs: OAUTH_CODE_TTL_MS });

    const accepted = response();
    await exchangeOAuthCode({ body: { code } }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.ok(accepted.body.accessToken);

    const replayed = response();
    await exchangeOAuthCode({ body: { code } }, replayed);
    assert.equal(replayed.statusCode, 400);
    assert.equal(replayed.body.error, 'Invalid or expired authorization code');
});

test('expired one-time code is rejected', async (t) => {
    const records = useMemoryArtifactStore(t);
    const code = await issueOAuthArtifact('code', { userId: approvedUser()._id, ttlMs: OAUTH_CODE_TTL_MS });
    for (const record of records.values()) record.expiresAt = new Date(Date.now() - 1);

    const res = response();
    await exchangeOAuthCode({ body: { code } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid or expired authorization code');
});

test('invalid one-time code is rejected', async (t) => {
    useMemoryArtifactStore(t);
    const res = response();
    await exchangeOAuthCode({ body: { code: 'A'.repeat(43) } }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'Invalid or expired authorization code');
});

test('missing OAuth state is rejected', async (t) => {
    useMemoryArtifactStore(t);
    const res = response();
    await verifyGoogleState({ query: {}, cookies: {} }, res, () => assert.fail('must not continue'));
    assert.equal(res.redirectUrl, 'https://frontend.test/login?oauth=failed');
});

test('incorrect OAuth state is rejected', async (t) => {
    useMemoryArtifactStore(t);
    const setup = response();
    const state = await createState(setup);
    const res = response();
    await verifyGoogleState({ query: { state }, cookies: { oauthState: crypto.randomBytes(32).toString('base64url') } }, res, () => assert.fail('must not continue'));
    assert.equal(res.redirectUrl, 'https://frontend.test/login?oauth=failed');
});

test('correct OAuth state succeeds once and replay fails', async (t) => {
    useMemoryArtifactStore(t);
    const setup = response();
    const state = await createState(setup);
    const request = { query: { state }, cookies: { oauthState: state } };

    const accepted = response();
    let nextCalled = false;
    await verifyGoogleState(request, accepted, () => { nextCalled = true; });
    assert.equal(nextCalled, true);
    assert.equal(accepted.clearedCookies[0].options.path, '/api/auth/google/callback');

    const replayed = response();
    await verifyGoogleState(request, replayed, () => assert.fail('must not replay'));
    assert.equal(replayed.redirectUrl, 'https://frontend.test/login?oauth=failed');
});

test('refresh cookie has production attributes and reaches refresh endpoint', async (t) => {
    const originalMode = process.env.NODE_ENV;
    const originalFindOne = User.findOne;
    t.after(() => {
        if (originalMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalMode;
        User.findOne = originalFindOne;
    });
    process.env.NODE_ENV = 'production';
    const user = approvedUser();
    user.hashedPassword = await bcrypt.hash('correct password', 4);
    User.findOne = async () => user;

    const res = response();
    await loginUser({ body: { username: user.username, password: 'correct password' } }, res);
    const cookie = res.cookies.find((item) => item.name === 'refreshToken');
    assert.deepEqual(cookie.options, {
        httpOnly: true,
        secure: true,
        sameSite: 'none',
        path: '/api/auth',
        maxAge: 7 * 24 * 60 * 60 * 1000
    });
    assert.equal('/api/auth/refresh'.startsWith(`${cookie.options.path}/`), true);
});

test('logout clears refresh cookie with matching attributes', async (t) => {
    const originalMode = process.env.NODE_ENV;
    const originalFindById = User.findById;
    t.after(() => {
        if (originalMode === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = originalMode;
        User.findById = originalFindById;
    });
    process.env.NODE_ENV = 'production';
    const user = approvedUser();
    const refreshToken = require('../utils/token')({ _id: user._id }, '7d');
    user.refreshToken = await bcrypt.hash(refreshToken, 4);
    User.findById = async () => user;

    const res = response();
    await logoutUser({ cookies: { refreshToken } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(user.refreshToken, null);
    assert.deepEqual(res.clearedCookies[0], {
        name: 'refreshToken',
        options: { httpOnly: true, secure: true, sameSite: 'none', path: '/api/auth' }
    });
});

test('refresh sessions survive repeated refreshes and separate device logins', async (t) => {
    const originalFindOne = User.findOne;
    const originalFindById = User.findById;
    t.after(() => {
        User.findOne = originalFindOne;
        User.findById = originalFindById;
    });

    const user = approvedUser();
    user.hashedPassword = await bcrypt.hash('correct password', 4);
    User.findOne = async () => user;
    User.findById = async () => user;

    const firstLogin = response();
    const secondLogin = response();
    const request = { body: { username: user.username, password: 'correct password' } };
    await loginUser(request, firstLogin);
    await loginUser(request, secondLogin);

    const firstToken = firstLogin.cookies.find(cookie => cookie.name === 'refreshToken').value;
    const secondToken = secondLogin.cookies.find(cookie => cookie.name === 'refreshToken').value;
    assert.notEqual(firstToken, secondToken);
    assert.equal(user.refreshSessions.length, 2);

    const firstRefresh = response();
    const repeatedRefresh = response();
    await refreshToken({ cookies: { refreshToken: firstToken } }, firstRefresh);
    await refreshToken({ cookies: { refreshToken: firstToken } }, repeatedRefresh);
    assert.equal(firstRefresh.statusCode, 200);
    assert.equal(repeatedRefresh.statusCode, 200);
    assert.equal(user.refreshSessions.length, 2);

    await logoutUser({ cookies: { refreshToken: firstToken } }, response());
    assert.equal(user.refreshSessions.length, 1);

    const secondRefresh = response();
    await refreshToken({ cookies: { refreshToken: secondToken } }, secondRefresh);
    assert.equal(secondRefresh.statusCode, 200);
});

test('legacy refresh token upgrades to a session without forced login', async (t) => {
    const originalFindById = User.findById;
    t.after(() => { User.findById = originalFindById; });
    const user = approvedUser();
    const legacyToken = require('../utils/token')({ _id: user._id }, '7d');
    user.refreshToken = await bcrypt.hash(legacyToken, 4);
    User.findById = async () => user;

    const res = response();
    await refreshToken({ cookies: { refreshToken: legacyToken } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(res.body.accessToken);
    assert.equal(user.refreshSessions.length, 1);
    assert.ok(res.cookies.find(cookie => cookie.name === 'refreshToken'));
});
