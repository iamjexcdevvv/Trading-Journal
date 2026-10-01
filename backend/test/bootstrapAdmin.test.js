const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArguments, maskEmail, bootstrapAdmin } = require('../scripts/bootstrapAdmin');

const USER_ID = '507f191e810c19729de860ea';

function fakeUserModel(users) {
    const updates = [];
    return {
        updates,
        find(filter) {
            this.findFilter = filter;
            return {
                select() { return this; },
                limit() { return this; },
                async lean() { return users; }
            };
        },
        findOneAndUpdate(filter, update) {
            updates.push({ filter, update });
            return {
                async select() {
                    return { _id: USER_ID, role: 'admin', approvalStatus: 'approved' };
                }
            };
        }
    };
}

test('bootstrap requires one valid immutable ObjectId', () => {
    assert.deepEqual(parseArguments(['--user-id', USER_ID]), { apply: false, userId: USER_ID, dnsServer: undefined });
    assert.deepEqual(parseArguments([`--user-id=${USER_ID}`, '--apply']), { apply: true, userId: USER_ID, dnsServer: undefined });
    assert.throws(() => parseArguments([]), /Required argument missing/);
    assert.throws(() => parseArguments(['--user-id', 'not-an-object-id']), /not a valid MongoDB ObjectId/);
    assert.throws(() => parseArguments(['--email', 'admin@example.com']), /Unknown argument/);
});

test('optional DNS server accepts only IPv4 or IPv6 addresses', () => {
    assert.deepEqual(
        parseArguments(['--user-id', USER_ID, '--dns-server', '1.1.1.1']),
        { apply: false, userId: USER_ID, dnsServer: '1.1.1.1' }
    );
    assert.deepEqual(
        parseArguments([`--user-id=${USER_ID}`, '--dns-server=2606:4700:4700::1111']),
        { apply: false, userId: USER_ID, dnsServer: '2606:4700:4700::1111' }
    );
    assert.throws(
        () => parseArguments(['--user-id', USER_ID, '--dns-server', 'resolver.example.com']),
        /not a valid IPv4 or IPv6 address/
    );
});

test('dry run shows safe identity fields and never updates database', async () => {
    const model = fakeUserModel([{ _id: USER_ID, username: 'Verified Admin', email: 'verified@example.com', role: 'user', createdAt: '2026-01-01T00:00:00.000Z' }]);
    const output = [];
    const result = await bootstrapAdmin(model, { apply: false, userId: USER_ID }, (line) => output.push(line));

    assert.equal(result.changed, false);
    assert.equal(model.updates.length, 0);
    assert.ok(output.includes(`User ID: ${USER_ID}`));
    assert.ok(output.includes('Current role: user'));
    assert.ok(output.includes('Proposed role: admin'));
    assert.ok(output.some((line) => line.includes('ve******@example.com')));
    assert.equal(output.some((line) => /password|token|secret/i.test(line)), false);
});

test('missing user stops without update', async () => {
    const model = fakeUserModel([]);
    await assert.rejects(() => bootstrapAdmin(model, { apply: true, userId: USER_ID }, () => {}), /No existing user/);
    assert.equal(model.updates.length, 0);
});

test('existing administrator causes no update', async () => {
    const model = fakeUserModel([{ _id: USER_ID, username: 'Admin', email: 'admin@example.com', role: 'admin' }]);
    const result = await bootstrapAdmin(model, { apply: true, userId: USER_ID }, () => {});
    assert.equal(result.alreadyAdmin, true);
    assert.equal(model.updates.length, 0);
});

test('apply updates only supplied immutable ID after verification', async () => {
    const model = fakeUserModel([{ _id: USER_ID, username: 'Admin', email: 'admin@example.com', role: 'user' }]);
    const result = await bootstrapAdmin(model, { apply: true, userId: USER_ID }, () => {});

    assert.equal(result.changed, true);
    assert.equal(model.updates.length, 1);
    assert.equal(model.updates[0].filter._id, USER_ID);
    assert.deepEqual(model.updates[0].filter.role, { $ne: 'admin' });
    assert.equal(model.updates[0].update.$set.role, 'admin');
    assert.equal(model.updates[0].update.$set.approvalStatus, 'approved');
});

test('email masking exposes only minimal identifying information', () => {
    assert.equal(maskEmail('verified@example.com'), 've******@example.com');
    assert.equal(maskEmail(undefined), '(not set)');
});
