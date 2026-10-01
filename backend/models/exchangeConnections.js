const mongoose = require('mongoose');

const exchangeConnectionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    exchange: { type: String, enum: ['binance', 'okx', 'bitunix'], required: true },
    label: { type: String, required: true },
    apiKeyEnc: { type: String, required: true },
    apiSecretEnc: { type: String, required: true },
    passphraseEnc: { type: String },
    status: { type: String, enum: ['connected', 'error', 'disabled'], default: 'connected', required: true },
    lastError: { type: String },
    lastSyncedAt: { type: Date }
}, { timestamps: true });

const ExchangeConnection = mongoose.model('ExchangeConnection', exchangeConnectionSchema);

async function createConnection(connectionData) {
    const connection = new ExchangeConnection(connectionData);
    await connection.save();
    return connection;
}

async function getConnectionsByUserId(userId) {
    return await ExchangeConnection.find({ userId }).sort({ createdAt: -1 });
}

async function getConnectionById(id, userId) {
    return await ExchangeConnection.findOne({ _id: id, userId });
}

async function deleteConnectionById(id, userId) {
    return await ExchangeConnection.findOneAndDelete({ _id: id, userId });
}

async function updateConnectionStatus(id, status, lastError = null) {
    return await ExchangeConnection.findByIdAndUpdate(id, { $set: { status, lastError } });
}

async function updateLastSyncedAt(id) {
    return await ExchangeConnection.findByIdAndUpdate(id, { $set: { lastSyncedAt: new Date() } });
}

module.exports = {
    ExchangeConnection,
    createConnection,
    getConnectionsByUserId,
    getConnectionById,
    deleteConnectionById,
    updateConnectionStatus,
    updateLastSyncedAt
};
