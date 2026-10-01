const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = 'auth-security-test-secret';
process.env.FRONTEND_URL = 'https://frontend.test';

const { User } = require('../models/users');
const { OAuthArtifact } = require('../models/oauthArtifacts');
const { registerUser, loginUser, googleAuth } = require('../controllers/auth');

function response() {
    return {
        statusCode: 200,
        body: undefined,
        cookieValue: undefined,
        redirectUrl: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
        cookie(name, value, options) { this.cookieValue = { name, value, options }; return this; },
        redirect(url) { this.redirectUrl = url; return this; }
    };
}

test('registration persists only a bcrypt password hash', async (t) => {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;
    let savedUser;
    t.after(() => {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    });

    User.findOne = async () => null;
    User.prototype.save = async function save() {
        savedUser = this.toObject();
        return this;
    };

    const res = response();
    await registerUser({ body: { username: 'secure-user', email: 'secure@example.com', password: 'correct horse battery staple' } }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(Object.hasOwn(savedUser, 'password'), false);
    assert.equal(savedUser.role, 'user');
    assert.equal(savedUser.approvalStatus, 'pending');
    assert.equal(await bcrypt.compare('correct horse battery staple', savedUser.hashedPassword), true);
});

test('password login succeeds with correct password and rejects incorrect password', async (t) => {
    const originalFindOne = User.findOne;
    t.after(() => { User.findOne = originalFindOne; });

    const hashedPassword = await bcrypt.hash('correct password', 4);
    const user = {
        _id: '507f191e810c19729de860ea',
        username: 'login-user',
        email: 'login@example.com',
        hashedPassword,
        approvalStatus: 'approved',
        role: 'user',
        save: async () => user
    };
    User.findOne = async () => user;

    const accepted = response();
    await loginUser({ body: { username: 'login-user', password: 'correct password' } }, accepted);
    assert.equal(accepted.statusCode, 200);
    assert.ok(accepted.body.accessToken);
    assert.equal(accepted.cookieValue.name, 'refreshToken');
    assert.equal(jwt.verify(accepted.body.accessToken, process.env.JWT_SECRET).role, 'user');
    assert.equal(user.role, 'user');

    const rejected = response();
    await loginUser({ body: { username: 'login-user', password: 'wrong password' } }, rejected);
    assert.equal(rejected.statusCode, 400);
    assert.equal(rejected.body.error, 'Invalid username or password');
});

test('OAuth-only account remains compatible without a password hash', async (t) => {
    const originalFindOne = User.findOne;
    const originalCreate = OAuthArtifact.create;
    t.after(() => {
        User.findOne = originalFindOne;
        OAuthArtifact.create = originalCreate;
    });

    const user = {
        _id: '507f191e810c19729de860eb',
        googleId: 'google-user-1',
        username: 'OAuth User',
        email: 'oauth@example.com',
        approvalStatus: 'approved',
        role: 'user',
        save: async () => user
    };
    User.findOne = async () => user;
    OAuthArtifact.create = async (artifact) => artifact;

    const res = response();
    await googleAuth({ user: { id: user.googleId, displayName: user.username, emails: [{ value: user.email }] } }, res);

    assert.equal(res.cookieValue, undefined);
    assert.match(res.redirectUrl, /^https:\/\/frontend\.test\/auth\/callback\?code=[A-Za-z0-9_-]{43}$/);
    assert.doesNotMatch(res.redirectUrl, /accessToken|refreshToken/i);
});

test('registration rejects client-controlled role fields', async () => {
    const res = response();
    await registerUser({ body: { username: 'attacker', email: 'attacker@example.com', password: 'long enough', role: 'admin' } }, res);
    assert.equal(res.statusCode, 400);
});

test('registration rejects client-controlled approval status', async () => {
    const res = response();
    await registerUser({ body: { username: 'attacker', email: 'attacker@example.com', password: 'long enough', approvalStatus: 'approved' } }, res);
    assert.equal(res.statusCode, 400);
});

test('formerly privileged email registers as pending normal user', async (t) => {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;
    let savedUser;
    t.after(() => {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    });

    User.findOne = async () => null;
    User.prototype.save = async function save() {
        savedUser = this.toObject();
        return this;
    };

    const formerAdminEmail = `dublasandrei${'@'}gmail.com`;
    const res = response();
    await registerUser({ body: { username: 'email-only-user', email: formerAdminEmail, password: 'long enough password' } }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(savedUser.role, 'user');
    assert.equal(savedUser.approvalStatus, 'pending');
});

test('OAuth registration never derives admin role from email', async (t) => {
    const originalFindOne = User.findOne;
    const originalSave = User.prototype.save;
    let savedUser;
    t.after(() => {
        User.findOne = originalFindOne;
        User.prototype.save = originalSave;
    });

    User.findOne = async () => null;
    User.prototype.save = async function save() {
        savedUser = this.toObject();
        return this;
    };

    const formerAdminEmail = `dublasandrei${'@'}gmail.com`;
    const res = response();
    await googleAuth({ user: { id: 'new-google-user', displayName: 'Email Only User', emails: [{ value: formerAdminEmail }] } }, res);

    assert.equal(savedUser.role, 'user');
    assert.equal(savedUser.approvalStatus, 'pending');
    assert.equal(res.redirectUrl, 'https://frontend.test/login?approval=pending');
    assert.equal(res.cookieValue, undefined);
});
