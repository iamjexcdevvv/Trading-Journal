const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });
const mongoose = require('mongoose');
const { Alert } = require('../models/alerts');

async function migrate(apply) {
    const filter = { $or: [{ schemaVersion: { $lt: 4 } }, { schemaVersion: { $exists: false } }] };
    const alerts = await Alert.collection.find(filter, { projection: { _id: 1, schemaVersion: 1 } }).toArray();
    const count = alerts.length;
    console.log(`${apply ? 'Applying' : 'Dry run:'} ${count} alert(s)`);
    if (!apply || !count) return;
    const result = await Alert.bulkWrite(alerts.map((alert) => ({ updateOne: {
        filter: { _id: alert._id, migratedPhase2: { $ne: true } },
        update: { $set: { schemaVersion: 4, conditionLogic: 'AND', evaluateOnClose: true, migratedPhase2: true, prePhase2SchemaVersion: alert.schemaVersion ?? null } }
    } })), { ordered: false });
    console.log(`Migrated ${result.modifiedCount} alert(s)`);
}

async function rollback(apply) {
    const filter = { schemaVersion: 4, migratedPhase2: true };
    const alerts = await Alert.collection.find(filter, { projection: { _id: 1, prePhase2SchemaVersion: 1 } }).toArray();
    const count = alerts.length;
    console.log(`${apply ? 'Rolling back' : 'Rollback dry run:'} ${count} Phase 1 alert(s)`);
    if (!apply || !count) return;
    for (const alert of alerts) {
        const update = { $unset: { conditionLogic: '', evaluateOnClose: '', timeframe: '', lastCheckedAt: '', lastEvaluatedCandleTime: '', migratedPhase2: '', prePhase2SchemaVersion: '' } };
        if (alert.prePhase2SchemaVersion === null || alert.prePhase2SchemaVersion === undefined) update.$unset.schemaVersion = '';
        else update.$set = { schemaVersion: alert.prePhase2SchemaVersion };
        await Alert.collection.updateOne({ _id: alert._id, migratedPhase2: true }, update);
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

main().catch((error) => { console.error(error); process.exitCode = 1; });
