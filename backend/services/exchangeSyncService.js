const { Trade, createTrade, updateTradeById, findSyncedTrade, closeSyncedTrade } = require('../models/trades');
const { ExchangeConnection, updateConnectionStatus, updateLastSyncedAt } = require('../models/exchangeConnections');
const { decrypt } = require('../utils/encryption');
const { getAdapter } = require('./exchanges');
const crypto = require('node:crypto');

let io = null;
const streamHandles = new Map(); // connectionId -> { stop() }
let sweepTimer = null;
let sweepTickCount = 0;
const connectionLocks = new Map();

const POLL_SWEEP_MS = 10 * 1000;
const REALTIME_SAFETY_NET_EVERY_N_TICKS = 6; // ~60s at a 10s tick

function initExchangeSyncService(ioInstance) {
    io = ioInstance;
    console.log('Exchange sync service initialized');
}

function decryptCreds(connection) {
    return {
        apiKey: decrypt(connection.apiKeyEnc),
        apiSecret: decrypt(connection.apiSecretEnc),
        passphrase: connection.passphraseEnc ? decrypt(connection.passphraseEnc) : undefined
    };
}

function emitSync(userId, trade) {
    if (io) {
        io.to(`user:${userId}`).emit('trade-synced', trade);
    }
}

async function handleConnectionError(connection, err) {
    console.error(`Exchange sync error for connection ${connection._id} (${connection.exchange}):`, err.name || 'Error');
    await updateConnectionStatus(connection._id, 'error', 'Exchange synchronization failed');
}

function validatePosition(position) {
    if (!position || typeof position !== 'object') throw new Error('Exchange returned an invalid position');
    if (!position.externalId || !position.symbol || !['Long', 'Short'].includes(position.direction)) {
        throw new Error('Exchange returned an invalid position');
    }
    for (const field of ['entryPrice', 'qty']) {
        if (!Number.isFinite(position[field]) || position[field] < 0) throw new Error('Exchange returned an invalid position');
    }
    if (position.leverage != null && (!Number.isFinite(position.leverage) || position.leverage <= 0)) {
        throw new Error('Exchange returned an invalid position');
    }
}

function withConnectionLock(connectionId, operation) {
    const key = connectionId.toString();
    const previous = connectionLocks.get(key) || Promise.resolve();
    const current = previous.catch(() => {}).then(operation);
    connectionLocks.set(key, current);
    current.finally(() => {
        if (connectionLocks.get(key) === current) connectionLocks.delete(key);
    }).catch(() => {});
    return current;
}

async function closePosition(connection, trade) {
    const adapter = getAdapter(connection.exchange);
    const creds = decryptCreds(connection);
    const sinceMs = trade.date ? trade.date.getTime() : Date.now() - 24 * 60 * 60 * 1000;

    let fills;
    try {
        fills = await adapter.getFillsSince(
            creds,
            trade.symbol,
            sinceMs,
            trade.sourceExternalId || trade.externalId
        );
    } catch (err) {
        console.error(`Failed to fetch closing fills for trade ${trade._id}; will retry:`, err.name || 'Error');
        throw err;
    }

    if (!Array.isArray(fills)) throw new Error('Exchange returned invalid closing data');
    const closingFills = fills.filter(f => Number.isFinite(f.time)
        && f.time >= sinceMs
        && Number.isFinite(f.price)
        && Number.isFinite(f.pnl)
        && Number.isFinite(f.fee)
        && (!f.side || f.side === trade.direction));
    if (closingFills.length === 0) throw new Error('Closing trade data is not available yet');
    const pnl = closingFills.reduce((sum, f) => sum + (f.pnl || 0), 0);
    const fee = closingFills.reduce((sum, f) => sum + (f.fee || 0), 0);
    const lastFill = closingFills[closingFills.length - 1];

    const updated = await closeSyncedTrade(trade._id, connection.userId, {
        exitPrice: lastFill ? lastFill.price : trade.entryPrice,
        pnl,
        fee
    });

    if (updated) emitSync(connection.userId, updated);
}

async function handlePositionUpdate(connection, position) {
    validatePosition(position);
    const sameExchangeConnections = await ExchangeConnection.countDocuments({
        userId: connection.userId,
        exchange: connection.exchange,
        status: { $ne: 'disabled' }
    });
    const existing = await findSyncedTrade(
        connection.userId,
        connection._id,
        connection.exchange,
        position.externalId,
        sameExchangeConnections === 1
    );

    if (!position.qty) {
        if (existing && existing.status === 'open') {
            await closePosition(connection, existing);
        }
        return;
    }

    if (!existing) {
        const trade = await createTrade({
            userId: connection.userId,
            exchange: connection.exchange,
            connectionId: connection._id,
            sourceExternalId: position.externalId,
            externalId: `${connection._id}:${position.externalId}:${crypto.randomUUID()}`,
            symbol: position.symbol,
            direction: position.direction,
            entryPrice: position.entryPrice,
            qty: position.qty,
            leverage: position.leverage,
            status: 'open',
            date: position.openedAt ? new Date(position.openedAt) : new Date(),
            strategy: 'Synced'
        });
        emitSync(connection.userId, trade);
    } else {
        const trade = await updateTradeById(existing._id, connection.userId, {
            connectionId: connection._id,
            sourceExternalId: position.externalId,
            externalId: existing.connectionId
                ? existing.externalId
                : `${connection._id}:${position.externalId}:${existing._id}`,
            symbol: position.symbol,
            direction: position.direction,
            entryPrice: position.entryPrice,
            qty: position.qty,
            leverage: position.leverage,
            status: 'open'
        });
        emitSync(connection.userId, trade);
    }
}

async function sweepConnectionUnlocked(connection) {
    try {
        const adapter = getAdapter(connection.exchange);
        const creds = decryptCreds(connection);
        if (adapter.assertReadOnly) await adapter.assertReadOnly(creds);
        const openPositions = await adapter.getOpenPositions(creds);
        if (!Array.isArray(openPositions)) throw new Error('Exchange returned invalid position data');
        openPositions.forEach(validatePosition);
        const openExternalIds = new Set(openPositions.map(p => p.externalId));

        for (const position of openPositions) {
            await handlePositionUpdate(connection, position);
        }

        const sameExchangeConnections = await ExchangeConnection.countDocuments({
            userId: connection.userId,
            exchange: connection.exchange,
            status: { $ne: 'disabled' }
        });
        const connectionScope = sameExchangeConnections === 1
            ? { $or: [{ connectionId: connection._id }, { connectionId: { $exists: false } }] }
            : { connectionId: connection._id };
        const trackedOpenTrades = await Trade.find({
            userId: connection.userId,
            exchange: connection.exchange,
            status: 'open',
            ...connectionScope
        });
        for (const trade of trackedOpenTrades) {
            const sourceExternalId = trade.sourceExternalId || trade.externalId;
            if (!openExternalIds.has(sourceExternalId)) {
                await closePosition(connection, trade);
            }
        }

        await updateConnectionStatus(connection._id, 'connected', null);
        await updateLastSyncedAt(connection._id);
    } catch (err) {
        if (/read-only permission|read permission/i.test(err.message)) {
            stopConnectionSync(connection._id);
        }
        await handleConnectionError(connection, err);
        throw err;
    }
}

function sweepConnection(connection) {
    return withConnectionLock(connection._id, () => sweepConnectionUnlocked(connection));
}

async function startConnectionSync(connection) {
    try {
        const adapter = getAdapter(connection.exchange);
        if (!adapter.supportsRealtime) return;

        const creds = decryptCreds(connection);
        if (adapter.assertReadOnly) await adapter.assertReadOnly(creds);
        const handle = adapter.connectStream(creds, {
            onPositionUpdate: (position) => {
                withConnectionLock(connection._id, () => handlePositionUpdate(connection, position))
                    .catch(err => handleConnectionError(connection, err).catch(() => {}));
            },
            onError: (err) => {
                handleConnectionError(connection, err).catch(() => {});
            }
        });
        streamHandles.set(connection._id.toString(), handle);
    } catch (error) {
        handleConnectionError(connection, error).catch(() => {});
    }
}

function stopConnectionSync(connectionId) {
    const key = connectionId.toString();
    const handle = streamHandles.get(key);
    if (handle) {
        handle.stop();
        streamHandles.delete(key);
    }
}

function addConnectionToSync(connection) {
    startConnectionSync(connection);
}

function removeConnectionFromSync(connectionId) {
    stopConnectionSync(connectionId);
}

async function sweepAllConnections() {
    sweepTickCount++;
    const isSafetyNetTick = sweepTickCount % REALTIME_SAFETY_NET_EVERY_N_TICKS === 0;

    try {
        const connections = await ExchangeConnection.find({ status: { $ne: 'disabled' } });
        for (const connection of connections) {
            const adapter = getAdapter(connection.exchange);
            if (!adapter.supportsRealtime || isSafetyNetTick) {
                try {
                    await sweepConnection(connection);
                } catch {
                    // Status is recorded by sweepConnection; continue other connections.
                }
            }
        }
    } catch (err) {
        console.error('Error sweeping exchange connections:', err);
    }
}

async function loadActiveConnections() {
    try {
        const connections = await ExchangeConnection.find({ status: { $ne: 'disabled' } });
        connections.forEach(startConnectionSync);
        console.log(`Loaded ${connections.length} exchange connections for sync`);
    } catch (err) {
        console.error('Error loading exchange connections into sync service:', err);
    }

    if (!sweepTimer) {
        sweepTimer = setInterval(sweepAllConnections, POLL_SWEEP_MS);
    }
}

module.exports = {
    initExchangeSyncService,
    loadActiveConnections,
    addConnectionToSync,
    removeConnectionFromSync,
    syncConnectionNow: sweepConnection,
    _test: { validatePosition, withConnectionLock, handlePositionUpdate }
};
