const test = require('node:test');
const assert = require('node:assert/strict');
const { User } = require('../models/users');
const { DESIRED_INDEXES, parseArguments, satisfies, applyMigration } = require('../scripts/auditUserIndexes');

test('user schema declares explicit identity uniqueness without automatic production changes', () => {
    assert.equal(User.schema.options.autoIndex, false);
    const indexes = User.schema.indexes().map(([key, options]) => ({ key, ...options }));
    for (const desired of DESIRED_INDEXES) assert.equal(indexes.some((index) => satisfies(index, desired)), true);
});

test('user index audit is dry-run by default and validates optional DNS server', () => {
    assert.deepEqual(parseArguments([]), { apply: false });
    assert.deepEqual(parseArguments(['--dns-server', '1.1.1.1']), { apply: false, dnsServer: '1.1.1.1' });
    assert.deepEqual(parseArguments(['--dns-server=2606:4700:4700::1111', '--apply']), { apply: true, dnsServer: '2606:4700:4700::1111' });
    assert.throws(() => parseArguments(['--dns-server', 'not-an-ip']), /valid IPv4 or IPv6/);
    assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
});

test('index comparison rejects the legacy non-partial googleId index', () => {
    const desired = DESIRED_INDEXES.find((index) => index.key.googleId);
    assert.equal(satisfies({ key: { googleId: 1 }, unique: true }, desired), false);
    assert.equal(satisfies(desired, desired), true);
});

test('index migration creates replacement protection before dropping a legacy index', async () => {
    const calls = [];
    const collection = {
        createIndex: async () => calls.push('create'),
        dropIndex: async () => calls.push('drop')
    };
    await applyMigration(collection, {
        safe: true,
        changes: [{ action: 'create', index: DESIRED_INDEXES[0], conflictingIndexesToDrop: ['email_1'] }]
    });
    assert.deepEqual(calls, ['create', 'drop']);
});
