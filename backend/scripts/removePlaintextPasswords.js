const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const dns = require('node:dns');
const net = require('node:net');
const { User } = require('../models/users');

const apply = process.argv.includes('--apply');
const dnsFlagIndex = process.argv.indexOf('--dns-server');
const inlineDnsServer = process.argv.find((arg) => arg.startsWith('--dns-server='));
const dnsServer = inlineDnsServer?.slice('--dns-server='.length)
    || (dnsFlagIndex >= 0 ? process.argv[dnsFlagIndex + 1] : undefined);
const bcryptHash = /^\$2[aby]\$\d{2}\$/;

async function main() {
    if (dnsServer && net.isIP(dnsServer) === 0) {
        throw new Error('Supplied DNS server is not a valid IPv4 or IPv6 address');
    }
    if (dnsServer) dns.setServers([dnsServer]);
    await mongoose.connect(process.env.MONGODB_URI);

    const withPlaintext = await User.countDocuments({ password: { $exists: true } });
    const safeToClean = await User.countDocuments({
        password: { $exists: true },
        hashedPassword: bcryptHash
    });
    const missingHash = withPlaintext - safeToClean;

    console.log(`${apply ? 'Apply' : 'Dry run'}: ${withPlaintext} user record(s) contain the legacy plaintext field.`);
    console.log(`${safeToClean} record(s) have a bcrypt hash and can be cleaned safely.`);

    if (missingHash > 0) {
        throw new Error(`${missingHash} record(s) contain plaintext without a bcrypt hash. Reset those passwords before cleanup.`);
    }

    if (apply && safeToClean > 0) {
        const result = await User.updateMany(
            { password: { $exists: true }, hashedPassword: bcryptHash },
            { $unset: { password: '' } }
        );
        console.log(`Removed legacy plaintext field from ${result.modifiedCount} record(s).`);
    }

    const remaining = await User.countDocuments({ password: { $exists: true } });
    console.log(`${remaining} record(s) still contain the legacy plaintext field.`);
}

main()
    .catch((error) => {
        console.error(`Plaintext password cleanup failed: ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
