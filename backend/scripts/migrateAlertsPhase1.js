const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });
const mongoose = require('mongoose');
const { Alert } = require('../models/alerts');

function phase1Condition(alert) {
    if (alert.condition === 'crossing up') return 'crosses_above';
    if (alert.condition === 'crossing down') return 'crosses_below';
    return Number(alert.currentPrice) <= Number(alert.price) ? 'crosses_above' : 'crosses_below';
}

async function migrate(apply) {
    const legacy = await Alert.find({ schemaVersion: { $nin: [2, 3] }, type: { $in: ['horizontal', 'trendline'] } })
        .select('+price +type +currentPrice +startPrice +startTime +endPrice +endTime');
    console.log(`${apply ? 'Applying' : 'Dry run:'} ${legacy.length} legacy alert(s)`);
    if (!apply || !legacy.length) return;

    const operations = legacy.map((alert) => {
        const horizontal = alert.type === 'horizontal';
        const target = horizontal ? alert.price : (alert.endPrice || alert.startPrice);
        return {
            updateOne: {
                filter: { _id: alert._id, schemaVersion: { $ne: 2 } },
                update: { $set: {
                    name: `${alert.symbol} price alert`,
                    exchange: 'bitunix',
                    alertType: 'price',
                    condition: horizontal ? phase1Condition(alert) : 'crosses_above',
                    targetValue: target,
                    frequency: 'once',
                    notificationMethods: ['in_app'],
                    isActive: horizontal && alert.status === 'active',
                    referencePrice: null,
                    previousPrice: alert.currentPrice || null,
                    conditionMet: false,
                    triggerCount: alert.status === 'triggered' ? 1 : 0,
                    schemaVersion: 3,
                    migratedFromLegacy: true,
                    legacyStatus: alert.status,
                    legacyCondition: alert.condition,
                    migrationNote: horizontal ? null : 'Legacy trendline retained but disabled; edit before enabling.'
                } }
            }
        };
    });
    const result = await Alert.bulkWrite(operations, { ordered: false });
    console.log(`Migrated ${result.modifiedCount} alert(s)`);
}

async function rollback(apply) {
    const filter = { schemaVersion: 3, migratedFromLegacy: true };
    const count = await Alert.countDocuments(filter);
    console.log(`${apply ? 'Rolling back' : 'Rollback dry run:'} ${count} migrated alert(s)`);
    if (!apply || !count) return;
    const alerts = await Alert.find(filter);
    for (const alert of alerts) {
        await Alert.collection.updateOne(
            { _id: alert._id, schemaVersion: 3, migratedFromLegacy: true },
            { $set: { status: alert.legacyStatus, condition: alert.legacyCondition }, $unset: {
                name: '', exchange: '', alertType: '', targetValue: '', frequency: '', notificationMethods: '', isActive: '',
                expiresAt: '', lastTriggeredAt: '', triggerCount: '', referencePrice: '', previousPrice: '',
                conditionMet: '', lastTriggeredCandle: '', schemaVersion: '', migratedFromLegacy: '', legacyStatus: '', legacyCondition: '', migrationNote: ''
            } }
        );
    }
    console.log(`Rolled back ${alerts.length} alert(s)`);
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const apply = process.argv.includes('--apply');
    if (process.argv.includes('--rollback')) await rollback(apply);
    else await migrate(apply);
    await mongoose.disconnect();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
