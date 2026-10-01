const Joi = require('joi');
const { getUserById } = require('../models/users');
const {
    createConnection,
    getConnectionsByUserId,
    getConnectionById,
    deleteConnectionById
} = require('../models/exchangeConnections');
const { encrypt } = require('../utils/encryption');
const { getAdapter, supportedExchanges } = require('../services/exchanges');
const { addConnectionToSync, removeConnectionFromSync, syncConnectionNow } = require('../services/exchangeSyncService');

const connectionSchema = Joi.object({
    exchange: Joi.string().valid(...supportedExchanges).required(),
    label: Joi.string().required(),
    apiKey: Joi.string().required(),
    apiSecret: Joi.string().required(),
    passphrase: Joi.string().when('exchange', { is: 'okx', then: Joi.required(), otherwise: Joi.optional() })
});

function sanitize(connection) {
    const { apiKeyEnc, apiSecretEnc, passphraseEnc, ...rest } = connection.toObject();
    return rest;
}

async function createExchangeConnection(req, res) {
    const { error } = connectionSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { exchange, label, apiKey, apiSecret, passphrase } = req.body;
    const adapter = getAdapter(exchange);

    try {
        await adapter.testConnection({ apiKey, apiSecret, passphrase });
    } catch (err) {
        return res.status(400).json({ error: `Could not verify ${exchange} credentials: ${err.message}` });
    }

    const connection = await createConnection({
        userId: user._id,
        exchange,
        label,
        apiKeyEnc: encrypt(apiKey),
        apiSecretEnc: encrypt(apiSecret),
        passphraseEnc: passphrase ? encrypt(passphrase) : undefined
    });

    addConnectionToSync(connection);

    return res.status(201).json(sanitize(connection));
}

async function getExchangeConnections(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const connections = await getConnectionsByUserId(user._id);
    return res.status(200).json(connections.map(sanitize));
}

async function deleteExchangeConnection(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { id } = req.params;
    const connection = await getConnectionById(id, user._id);
    if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
    }

    await deleteConnectionById(id, user._id);
    removeConnectionFromSync(connection._id);

    return res.status(200).json({ message: 'Connection removed' });
}

async function syncExchangeConnectionNow(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { id } = req.params;
    const connection = await getConnectionById(id, user._id);
    if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
    }

    try {
        await syncConnectionNow(connection);
        return res.status(200).json({ message: 'Sync complete' });
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
}

module.exports = {
    createExchangeConnection,
    getExchangeConnections,
    deleteExchangeConnection,
    syncExchangeConnectionNow
};
