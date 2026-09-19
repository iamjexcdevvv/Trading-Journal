const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });
const mongoose = require('mongoose');
const { Alert } = require('../models/alerts');
const { AlertEvent } = require('../models/alertEvents');

async function migrate(apply) {
    const alertFilter = { exchange: { $exists: false } };
    const eventFilter = { exchange: { $exists: false } };
    const [alertCount, eventCount] = await Promise.all([
        Alert.countDocuments(alertFilter),
        AlertEvent.countDocuments(eventFilter)
    ]);
    console.log(`${apply ? 'Applying' : 'Dry run:'} ${alertCount} alert(s), ${eventCount} event(s)`);
    if (!apply) return;
    const alerts = await Alert.collection.find(alertFilter, { projection: { _id: 1, schemaVersion: 1 } }).toArray();
    if (alerts.length) {
        await Alert.bulkWrite(alerts.map((alert) => ({ updateOne: {
            filter: { _id: alert._id, exchange: { $exists: false } },
            update: { $set: {
                exchange: 'bitunix', schemaVersion: 3, migratedExchangeDefault: true,
                preExchangeSchemaVersion: alert.schemaVersion ?? null
            } }
        } })), { ordered: false });
    }
    if (eventCount) await AlertEvent.updateMany(eventFilter, { $set: { exchange: 'bitunix', migratedExchangeDefault: true } });
    console.log(`Migrated ${alerts.length} alert(s), ${eventCount} event(s)`);
}

async function rollback(apply) {
    const filter = { schemaVersion: 3, migratedExchangeDefault: true, exchange: 'bitunix' };
    const alerts = await Alert.collection.find(filter, { projection: { _id: 1, preExchangeSchemaVersion: 1 } }).toArray();
    console.log(`${apply ? 'Rolling back' : 'Rollback dry run:'} ${alerts.length} alert(s)`);
    if (!apply) return;
    for (const alert of alerts) {
        const update = { $unset: { exchange: '', migratedExchangeDefault: '', preExchangeSchemaVersion: '' } };
        if (alert.preExchangeSchemaVersion === null || alert.preExchangeSchemaVersion === undefined) update.$unset.schemaVersion = '';
        else update.$set = { schemaVersion: alert.preExchangeSchemaVersion };
        await Alert.collection.updateOne({ _id: alert._id, migratedExchangeDefault: true }, update);
    }
    const eventResult = await AlertEvent.updateMany(
        { exchange: 'bitunix', migratedExchangeDefault: true },
        { $unset: { exchange: '', migratedExchangeDefault: '' } }
    );
    console.log(`Rolled back ${alerts.length} alert(s), ${eventResult.modifiedCount} event(s).`);
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
