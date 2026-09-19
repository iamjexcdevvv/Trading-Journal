const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';
require('dotenv').config({ path: envFile });
const mongoose = require('mongoose');
const { Alert } = require('../models/alerts');

async function migrate(apply) {
    const filter = { $or: [{ schemaVersion: { $lt: 5 } }, { schemaVersion: { $exists: false } }] };
    const alerts = await Alert.collection.find(filter, { projection: { _id: 1, schemaVersion: 1 } }).toArray();
    console.log(`${apply ? 'Applying' : 'Dry run:'} ${alerts.length} alert(s)`);
    if (!apply || !alerts.length) return;
    const result = await Alert.bulkWrite(alerts.map((alert) => ({ updateOne: {
        filter: { _id: alert._id, migratedDrawingAlerts: { $ne: true } },
        update: { $set: { schemaVersion: 5, migratedDrawingAlerts: true, preDrawingAlertSchemaVersion: alert.schemaVersion ?? null } }
    } })), { ordered: false });
    console.log(`Migrated ${result.modifiedCount} alert(s)`);
}

async function rollback(apply) {
    const alerts = await Alert.collection.find({ schemaVersion: 5, migratedDrawingAlerts: true }, { projection: { _id: 1, preDrawingAlertSchemaVersion: 1 } }).toArray();
    console.log(`${apply ? 'Rolling back' : 'Rollback dry run:'} ${alerts.length} alert(s)`);
    if (!apply || !alerts.length) return;
    for (const alert of alerts) {
        const update = { $unset: { migratedDrawingAlerts: '', preDrawingAlertSchemaVersion: '' } };
        if (alert.preDrawingAlertSchemaVersion == null) update.$unset.schemaVersion = '';
        else update.$set = { schemaVersion: alert.preDrawingAlertSchemaVersion };
        await Alert.collection.updateOne({ _id: alert._id, migratedDrawingAlerts: true }, update);
    }
    console.log(`Rolled back ${alerts.length} alert(s)`);
}

async function main() {
    await mongoose.connect(process.env.MONGODB_URI);
    const apply = process.argv.includes('--apply');
    if (process.argv.includes('--rollback')) await rollback(apply); else await migrate(apply);
    await mongoose.disconnect();
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
