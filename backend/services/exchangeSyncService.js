const { Trade, createTrade, updateTradeById, findSyncedTrade, closeSyncedTrade } = require('../models/trades');
const { ExchangeConnection, updateConnectionStatus, updateLastSyncedAt } = require('../models/exchangeConnections');
const { decrypt } = require('../utils/encryption');
const { getAdapter } = require('./exchanges');

let io = null;
const streamHandles = new Map(); // connectionId -> { stop() }
let sweepTimer = null;
let sweepTickCount = 0;

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
    console.error(`Exchange sync error for connection ${connection._id} (${connection.exchange}):`, err.message);
    await updateConnectionStatus(connection._id, 'error', err.message);
}

async function closePosition(connection, trade) {
    const adapter = getAdapter(connection.exchange);
    const creds = decryptCreds(connection);
    const sinceMs = trade.date ? trade.date.getTime() : Date.now() - 24 * 60 * 60 * 1000;

    let fills;
    try {
        fills = await adapter.getFillsSince(creds, trade.symbol, sinceMs);
    } catch (err) {
        console.error(`Failed to fetch closing fills for trade ${trade._id}, will retry:`, err.message);
        return;
    }

    const closingFills = fills.filter(f => f.time >= sinceMs && (!f.side || f.side === trade.direction));
    const pnl = closingFills.reduce((sum, f) => sum + (f.pnl || 0), 0);
    const fee = closingFills.reduce((sum, f) => sum + (f.fee || 0), 0);
    const lastFill = closingFills[closingFills.length - 1];

    const updated = await closeSyncedTrade(trade._id, connection.userId, {
        exitPrice: lastFill ? lastFill.price : trade.entryPrice,
        pnl,
        fee
    });

    emitSync(connection.userId, updated);
}

async function handlePositionUpdate(connection, position) {
    const existing = await findSyncedTrade(connection.userId, connection.exchange, position.externalId);

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
            externalId: position.externalId,
            symbol: position.symbol,
            direction: position.direction,
            entryPrice: position.entryPrice,
            qty: position.qty,
            leverage: position.leverage,
            status: 'open',
            date: new Date(),
            strategy: 'Synced'
        });
        emitSync(connection.userId, trade);
    } else if (existing.status !== 'open') {
        // externalId isn't guaranteed unique per position lifecycle on every exchange
        // (e.g. Binance reuses `${symbol}-${positionSide}`), so a reopened position on the
        // same symbol/side maps back to this already-closed row. Reset it instead of creating
        // a new one, or the unique {userId, exchange, externalId} index would reject the insert.
        const trade = await updateTradeById(existing._id, connection.userId, {
            symbol: position.symbol,
            direction: position.direction,
            entryPrice: position.entryPrice,
            qty: position.qty,
            leverage: position.leverage,
            status: 'open',
            date: new Date(),
            exitPrice: null,
            pnl: null,
            fee: null
        });
        emitSync(connection.userId, trade);
    }
}

async function sweepConnection(connection) {
    const adapter = getAdapter(connection.exchange);
    const creds = decryptCreds(connection);

    try {
        const openPositions = await adapter.getOpenPositions(creds);
        const openExternalIds = new Set(openPositions.map(p => p.externalId));

        for (const position of openPositions) {
            await handlePositionUpdate(connection, position);
        }

        const trackedOpenTrades = await Trade.find({ userId: connection.userId, exchange: connection.exchange, status: 'open' });
        for (const trade of trackedOpenTrades) {
            if (!openExternalIds.has(trade.externalId)) {
                await closePosition(connection, trade);
            }
        }

        await updateConnectionStatus(connection._id, 'connected', null);
        await updateLastSyncedAt(connection._id);
    } catch (err) {
        await handleConnectionError(connection, err);
    }
}

function startConnectionSync(connection) {
    const adapter = getAdapter(connection.exchange);
    if (!adapter.supportsRealtime) return;

    const creds = decryptCreds(connection);
    const handle = adapter.connectStream(creds, {
        onPositionUpdate: (position) => {
            handlePositionUpdate(connection, position).catch(err => console.error('Error handling position update:', err));
        },
        onError: (err) => {
            handleConnectionError(connection, err).catch(console.error);
        }
    });
    streamHandles.set(connection._id.toString(), handle);
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
                await sweepConnection(connection);
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
    syncConnectionNow: sweepConnection
};
