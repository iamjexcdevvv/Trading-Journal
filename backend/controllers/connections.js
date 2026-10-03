const Joi = require('joi');
const mongoose = require('mongoose');
const { getUserById } = require('../models/users');
const {
    createConnection,
    getConnectionsByUserId,
    getConnectionById,
    deleteConnectionById
} = require('../models/exchangeConnections');
const { encrypt } = require('../utils/encryption');
const { getAdapter, supportedExchanges } = require('../services/exchanges');
const { addConnectionToSync, removeConnectionFromSync, syncConnectionNow, importConnectionHistory } = require('../services/exchangeSyncService');

const connectionSchema = Joi.object({
    exchange: Joi.string().valid(...supportedExchanges).required(),
    label: Joi.string().trim().min(1).max(80).required(),
    apiKey: Joi.string().trim().min(1).max(512).required(),
    apiSecret: Joi.string().trim().min(1).max(512).required(),
    passphrase: Joi.string().trim().min(1).max(512).when('exchange', {
        is: 'okx',
        then: Joi.required(),
        otherwise: Joi.forbidden()
    })
});

function validId(id) {
    return mongoose.isObjectIdOrHexString(id);
}

function safeCredentialError(error) {
    if (/read-only permission|read permission/i.test(error.message)) return error.message;
    return 'Credentials were rejected or the exchange could not be reached';
}

function sanitize(connection) {
    const { apiKeyEnc, apiSecretEnc, passphraseEnc, ...rest } = connection.toObject();
    return rest;
}

async function createExchangeConnection(req, res) {
    const { error, value } = connectionSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const { exchange, label, apiKey, apiSecret, passphrase } = value;
    const adapter = getAdapter(exchange);

    try {
        await adapter.testConnection({ apiKey, apiSecret, passphrase });
    } catch (err) {
        return res.status(400).json({ error: `Could not verify ${exchange} credentials: ${safeCredentialError(err)}` });
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
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ error: 'Invalid connection ID' });

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const connection = await getConnectionById(id, user._id);
    if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
    }

    await deleteConnectionById(id, user._id);
    removeConnectionFromSync(connection._id);

    return res.status(200).json({ message: 'Connection removed' });
}

async function syncExchangeConnectionNow(req, res) {
    const { id } = req.params;
    if (!validId(id)) return res.status(400).json({ error: 'Invalid connection ID' });

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);
    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const connection = await getConnectionById(id, user._id);
    if (!connection) {
        return res.status(404).json({ error: 'Connection not found' });
    }

    try {
        await syncConnectionNow(connection);
        return res.status(200).json({ message: 'Sync complete' });
    } catch (err) {
        return res.status(502).json({ error: 'Exchange synchronization failed; connection marked as error' });
    }
}

async function importExchangeHistory(req, res) {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid connection ID' });
    const user = await getUserById(req.user._id);
    if (!user || !user.refreshToken) return res.status(401).json({ error: 'Invalid refresh token' });
    const connection = await getConnectionById(req.params.id, user._id);
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    if (connection.status === 'disabled') return res.status(409).json({ error: 'This connection is disabled' });
    try {
        return res.status(200).json(await importConnectionHistory(connection));
    } catch {
        return res.status(502).json({ error: 'Trade history import failed. Some trades may already have been imported; retry safely.' });
    }
}

module.exports = {
    createExchangeConnection,
    getExchangeConnections,
    deleteExchangeConnection,
    syncExchangeConnectionNow,
    importExchangeHistory
};
