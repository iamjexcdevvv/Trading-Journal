const test = require('node:test');
const assert = require('node:assert/strict');

const { User } = require('../models/users');
const adminMiddleware = require('../middleware/admin');
const { hasAdminRole } = require('../utils/access');

function response() {
    return {
        statusCode: 200,
        body: undefined,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

test('administrator authorization trusts stored role only', async (t) => {
    const originalFindById = User.findById;
    t.after(() => { User.findById = originalFindById; });

    const formerAdminEmail = `dublasandrei${'@'}gmail.com`;
    const normalUser = { _id: '507f191e810c19729de860ea', email: formerAdminEmail, role: 'user' };
    User.findById = async () => normalUser;

    let normalNextCalled = false;
    const denied = response();
    await adminMiddleware({ user: { _id: normalUser._id } }, denied, () => { normalNextCalled = true; });
    assert.equal(denied.statusCode, 403);
    assert.equal(normalNextCalled, false);
    assert.equal(hasAdminRole(normalUser), false);

    const storedAdmin = { _id: '507f191e810c19729de860eb', email: 'admin@example.com', role: 'admin' };
    User.findById = async () => storedAdmin;
    const request = { user: { _id: storedAdmin._id } };
    let adminNextCalled = false;
    await adminMiddleware(request, response(), (error) => {
        assert.equal(error, undefined);
        adminNextCalled = true;
    });
    assert.equal(adminNextCalled, true);
    assert.equal(request.adminUser, storedAdmin);
    assert.equal(hasAdminRole(storedAdmin), true);
});
