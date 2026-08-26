// One-time migration for the confluence required/optional feature.
//
// Old shape:
//   Setup.items:      [String]
//   Trade.checklist:  [{ label, checked }]            (no `required`)
// New shape:
//   Setup.items:      [{ label, required }]
//   Trade.checklist:  [{ label, checked, required }]
//
// Idempotent — safe to run more than once. Run against a dev DB copy first.
// Usage: node backend/scripts/migrateConfluenceRequired.js [--dry-run]

const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });

const mongoose = require('mongoose');
const { Setup } = require('../models/setups');
const { Trade } = require('../models/trades');

const dryRun = process.argv.includes('--dry-run');

async function migrateSetups() {
    const setups = await Setup.find({}).lean();
    let changed = 0;

    for (const setup of setups) {
        const items = setup.items || [];
        const needsMigration = items.some((item) => typeof item === 'string');
        if (!needsMigration) continue;

        const migratedItems = items.map((item) =>
            typeof item === 'string' ? { label: item, required: true } : item
        );

        changed++;
        if (!dryRun) {
            await Setup.updateOne({ _id: setup._id }, { $set: { items: migratedItems } });
        }
    }

    console.log(`Setups: ${changed}/${setups.length} needed migration${dryRun ? ' (dry run, not written)' : ''}`);
}

async function migrateTrades() {
    const trades = await Trade.find({ 'checklist.0': { $exists: true } }).lean();
    let changed = 0;

    for (const trade of trades) {
        const checklist = trade.checklist || [];
        const needsMigration = checklist.some((item) => item.required === undefined);
        if (!needsMigration) continue;

        const migratedChecklist = checklist.map((item) => ({
            ...item,
            required: item.required === undefined ? true : item.required,
        }));

        changed++;
        if (!dryRun) {
            await Trade.updateOne({ _id: trade._id }, { $set: { checklist: migratedChecklist } });
        }
    }

    console.log(`Trades: ${changed}/${trades.length} needed migration${dryRun ? ' (dry run, not written)' : ''}`);
}

async function main() {
    await mongoose.connect(`${process.env.MONGODB_URI}`);
    console.log(`Connected to MongoDB${dryRun ? ' — DRY RUN, no writes will happen' : ''}`);

    await migrateSetups();
    await migrateTrades();

    await mongoose.disconnect();
    console.log('Done.');
}

main().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
