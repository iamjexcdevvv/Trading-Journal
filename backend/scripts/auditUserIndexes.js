const dns = require('node:dns');
const net = require('node:net');
const mongoose = require('mongoose');

class IndexMigrationError extends Error {}

const DESIRED_INDEXES = [
    { key: { email: 1 }, name: 'users_email_unique', unique: true, partialFilterExpression: { email: { $type: 'string' } } },
    { key: { googleId: 1 }, name: 'users_google_id_unique', unique: true, partialFilterExpression: { googleId: { $type: 'string' } } },
    {
        key: { username: 1 }, name: 'users_local_username_unique', unique: true,
        partialFilterExpression: { username: { $type: 'string' }, hashedPassword: { $type: 'string' } }
    }
];

function parseArguments(args) {
    const options = { apply: false };
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === '--apply') options.apply = true;
        else if (argument === '--dns-server') options.dnsServer = args[++index];
        else if (argument.startsWith('--dns-server=')) options.dnsServer = argument.slice('--dns-server='.length);
        else throw new IndexMigrationError(`Unknown argument: ${argument}`);
    }
    if (args.includes('--dns-server') && !options.dnsServer) throw new IndexMigrationError('--dns-server requires a value');
    if (options.dnsServer && net.isIP(options.dnsServer) === 0) throw new IndexMigrationError('DNS server must be a valid IPv4 or IPv6 address');
    return options;
}

function relevantIndex(index) {
    return Object.keys(index.key || {}).some((field) => ['email', 'googleId', 'username'].includes(field));
}

function publicIndex(index) {
    return {
        name: index.name,
        key: index.key,
        unique: Boolean(index.unique),
        ...(index.sparse ? { sparse: true } : {}),
        ...(index.partialFilterExpression ? { partialFilterExpression: index.partialFilterExpression } : {})
    };
}

async function duplicateSummary(collection, field, { caseInsensitive = false, additionalMatch = {} } = {}) {
    const value = caseInsensitive ? { $toLower: `$${field}` } : `$${field}`;
    const groups = await collection.aggregate([
        { $match: { [field]: { $type: 'string', $ne: '' }, ...additionalMatch } },
        { $group: { _id: value, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
        { $group: { _id: null, duplicateGroups: { $sum: 1 }, affectedRecords: { $sum: '$count' } } },
        { $project: { _id: 0 } }
    ]).toArray();
    return groups[0] || { duplicateGroups: 0, affectedRecords: 0 };
}

function sameKey(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
function samePartial(left, right) { return JSON.stringify(left || null) === JSON.stringify(right || null); }
function satisfies(current, desired) {
    return sameKey(current.key, desired.key)
        && Boolean(current.unique) === Boolean(desired.unique)
        && samePartial(current.partialFilterExpression, desired.partialFilterExpression);
}

async function inspect(collection) {
    const currentIndexes = (await collection.indexes()).filter(relevantIndex);
    const duplicates = {
        email: await duplicateSummary(collection, 'email', { caseInsensitive: true }),
        googleId: await duplicateSummary(collection, 'googleId'),
        usernameAllAccounts: await duplicateSummary(collection, 'username'),
        usernamePasswordAccounts: await duplicateSummary(collection, 'username', { additionalMatch: { hashedPassword: { $type: 'string' } } })
    };
    const missingEmail = await collection.countDocuments({ $or: [{ email: { $exists: false } }, { email: null }, { email: '' }] });
    const safe = duplicates.email.duplicateGroups === 0
        && duplicates.googleId.duplicateGroups === 0
        && duplicates.usernamePasswordAccounts.duplicateGroups === 0;
    const changes = DESIRED_INDEXES.map((desired) => {
        const matching = currentIndexes.find((index) => satisfies(index, desired));
        const conflicting = currentIndexes.filter((index) => sameKey(index.key, desired.key) && !satisfies(index, desired)).map((index) => index.name);
        return { index: desired, action: matching ? 'retain' : 'create', conflictingIndexesToDrop: conflicting };
    });
    return { currentIndexes: currentIndexes.map(publicIndex), proposedIndexes: DESIRED_INDEXES, changes, duplicates, missingEmail, safe };
}

function report(result, output = console.log) {
    output('Mode: DRY RUN');
    output(`Current relevant indexes: ${JSON.stringify(result.currentIndexes)}`);
    output(`Proposed indexes: ${JSON.stringify(result.proposedIndexes)}`);
    output(`Proposed changes: ${JSON.stringify(result.changes)}`);
    output(`Duplicate summary (values suppressed): ${JSON.stringify(result.duplicates)}`);
    output(`Legacy records without a usable email (allowed, but should be reviewed): ${result.missingEmail}`);
    output(`Migration safe: ${result.safe ? 'YES' : 'NO'}`);
}

async function applyMigration(collection, result) {
    if (!result.safe) throw new IndexMigrationError('Migration is unsafe: resolve duplicate or missing identity data first');
    for (const change of result.changes) {
        if (change.action === 'create') {
            const { key, ...options } = change.index;
            await collection.createIndex(key, options);
        }
        // Create protection first. If creation fails, legacy indexes remain intact.
        for (const name of change.conflictingIndexesToDrop) await collection.dropIndex(name);
    }
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
    require('dotenv').config({ path: envFile, quiet: true });
    if (options.dnsServer) dns.setServers([options.dnsServer]);
    await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false });
    try {
        const collection = mongoose.connection.collection('users');
        const result = await inspect(collection);
        report(result);
        if (!options.apply) return;
        await applyMigration(collection, result);
        console.log('Result: index migration applied.');
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch((error) => {
        if (error instanceof IndexMigrationError) console.error(error.message);
        else console.error(`User index audit failed: ${error.name}: ${error.message}`);
        process.exitCode = 1;
    });
}

module.exports = { IndexMigrationError, DESIRED_INDEXES, parseArguments, duplicateSummary, satisfies, inspect, report, applyMigration };
