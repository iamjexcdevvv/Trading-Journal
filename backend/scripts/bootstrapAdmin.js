const mongoose = require('mongoose');
const dns = require('node:dns');
const net = require('node:net');

class BootstrapInputError extends Error {}

function parseArguments(args) {
    const apply = args.includes('--apply');
    const inlineId = args.find((arg) => arg.startsWith('--user-id='));
    const idFlagIndex = args.indexOf('--user-id');
    const userId = inlineId?.slice('--user-id='.length)
        || (idFlagIndex >= 0 ? args[idFlagIndex + 1] : undefined);
    const inlineDnsServer = args.find((arg) => arg.startsWith('--dns-server='));
    const dnsServerFlagIndex = args.indexOf('--dns-server');
    const dnsServer = inlineDnsServer?.slice('--dns-server='.length)
        || (dnsServerFlagIndex >= 0 ? args[dnsServerFlagIndex + 1] : undefined);

    const allowed = new Set(['--apply', '--user-id', '--dns-server']);
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg.startsWith('--user-id=') || arg.startsWith('--dns-server=')) continue;
        if (allowed.has(arg)) {
            if (arg === '--user-id' || arg === '--dns-server') index += 1;
            continue;
        }
        throw new BootstrapInputError(`Unknown argument: ${arg}`);
    }

    if (!userId) {
        throw new BootstrapInputError('Required argument missing: --user-id <MongoDB ObjectId>');
    }
    if (!mongoose.Types.ObjectId.isValid(userId) || String(new mongoose.Types.ObjectId(userId)) !== userId.toLowerCase()) {
        throw new BootstrapInputError('Supplied user ID is not a valid MongoDB ObjectId');
    }
    if (dnsServer && net.isIP(dnsServer) === 0) {
        throw new BootstrapInputError('Supplied DNS server is not a valid IPv4 or IPv6 address');
    }

    return { apply, userId, dnsServer };
}

function maskEmail(email) {
    if (!email || !email.includes('@')) return '(not set)';
    const [local, domain] = email.split('@');
    const visible = local.slice(0, 2);
    return `${visible}${'*'.repeat(Math.max(3, local.length - visible.length))}@${domain}`;
}

function displayAccount(user, output = console.log) {
    output(`User ID: ${user._id}`);
    output(`Username: ${user.username || '(not set)'}`);
    output(`Email: ${maskEmail(user.email)}`);
    output(`Created: ${user.createdAt ? new Date(user.createdAt).toISOString() : '(unknown)'}`);
    output(`Current role: ${user.role || 'user'}`);
    output('Proposed role: admin');
}

async function bootstrapAdmin(UserModel, { apply, userId }, output = console.log) {
    const users = await UserModel.find({ _id: userId })
        .select('_id username email role approvalStatus createdAt')
        .limit(2)
        .lean();

    if (users.length !== 1) {
        if (users.length === 0) throw new BootstrapInputError('No existing user matches supplied user ID. No changes made.');
        throw new BootstrapInputError('Expected exactly one matching user. No changes made.');
    }

    const user = users[0];
    displayAccount(user, output);

    if (user.role === 'admin') {
        output('Result: user is already an administrator. No changes made.');
        return { changed: false, alreadyAdmin: true };
    }

    if (!apply) {
        output('Result: DRY RUN. No changes made. Review this account before using --apply.');
        return { changed: false, alreadyAdmin: false };
    }

    const updated = await UserModel.findOneAndUpdate(
        { _id: userId, role: { $ne: 'admin' } },
        { $set: { role: 'admin', approvalStatus: 'approved', approvedAt: new Date() } },
        { returnDocument: 'after', runValidators: true }
    ).select('_id role approvalStatus');

    if (!updated || updated.role !== 'admin') {
        throw new BootstrapInputError('Administrator promotion was not confirmed. Check database state before retrying.');
    }

    output('Result: stored role changed to admin and approval status changed to approved.');
    return { changed: true, alreadyAdmin: false };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
    require('dotenv').config({ path: envFile });
    const { User } = require('../models/users');

    if (options.dnsServer) dns.setServers([options.dnsServer]);
    await mongoose.connect(process.env.MONGODB_URI);
    try {
        await bootstrapAdmin(User, options);
    } finally {
        await mongoose.disconnect();
    }
}

if (require.main === module) {
    main().catch((error) => {
        if (error instanceof BootstrapInputError) console.error(error.message);
        else console.error('Admin bootstrap failed. No result was confirmed.');
        process.exitCode = 1;
    });
}

module.exports = { BootstrapInputError, parseArguments, maskEmail, displayAccount, bootstrapAdmin };
