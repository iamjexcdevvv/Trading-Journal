const crypto = require('crypto');
const WebSocket = require('ws');
const { fetchJson } = require('./http');
const { completedPositions } = require('./binanceHistory');

const BASE_URL = 'https://fapi.binance.com';
const WALLET_BASE_URL = 'https://api.binance.com';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';
const LISTEN_KEY_KEEPALIVE_MS = 30 * 60 * 1000;
const RECONNECT_DELAY_MS = 5000;

function sign(queryString, secret) {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function signedRequest(method, path, params, creds) {
    const query = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 5000 }).toString();
    const signature = sign(query, creds.apiSecret);
    const { response, data } = await fetchJson(`${BASE_URL}${path}?${query}&signature=${signature}`, {
        method,
        headers: { 'X-MBX-APIKEY': creds.apiKey }
    }, 'Binance');
    if (!response.ok) {
        throw new Error(data.msg || `Binance API error (${response.status})`);
    }
    return data;
}

async function getApiRestrictions(creds) {
    const query = new URLSearchParams({ timestamp: Date.now(), recvWindow: 5000 }).toString();
    const signature = sign(query, creds.apiSecret);
    const { response, data } = await fetchJson(
        `${WALLET_BASE_URL}/sapi/v1/account/apiRestrictions?${query}&signature=${signature}`,
        { method: 'GET', headers: { 'X-MBX-APIKEY': creds.apiKey } },
        'Binance'
    );
    if (!response.ok) throw new Error(data.msg || `Binance API error (${response.status})`);
    return data;
}

function normalizePosition(symbol, positionSide, positionAmt, entryPrice, leverage) {
    const amt = parseFloat(positionAmt);
    const direction = positionSide !== 'BOTH'
        ? (positionSide === 'LONG' ? 'Long' : 'Short')
        : (amt >= 0 ? 'Long' : 'Short');
    return {
        externalId: `${symbol}-${positionSide}`,
        symbol,
        direction,
        entryPrice: parseFloat(entryPrice) || 0,
        qty: Math.abs(amt),
        leverage: leverage ? parseInt(leverage, 10) : null
    };
}

async function assertReadOnly(creds) {
    const permissions = await getApiRestrictions(creds);
    const dangerousPermissions = [
        'enableWithdrawals',
        'enableMargin',
        'enableFutures',
        'enableVanillaOptions',
        'enableSpotAndMarginTrading',
        'enablePortfolioMarginTrading',
        'enableFixApiTrade'
    ];
    if (!permissions.enableReading) throw new Error('API key does not have read permission');
    if (dangerousPermissions.some(permission => permissions[permission] === true)) {
        throw new Error('API key must have read-only permission');
    }
}

async function testConnection(creds) {
    await assertReadOnly(creds);
    await signedRequest('GET', '/fapi/v1/positionInformation', {}, creds);
}

async function getOpenPositions(creds) {
    const positions = await signedRequest('GET', '/fapi/v1/positionInformation', {}, creds);
    return positions
        .filter(p => parseFloat(p.positionAmt) !== 0)
        .map(p => normalizePosition(p.symbol, p.positionSide, p.positionAmt, p.entryPrice, p.leverage));
}

async function getFillsSince(creds, symbol, sinceMs) {
    const fills = [];
    let params = { symbol, startTime: sinceMs, limit: 1000 };
    for (let page = 0; page < 20; page += 1) {
        const batch = await signedRequest('GET', '/fapi/v1/userTrades', params, creds);
        if (!Array.isArray(batch)) throw new Error('Unexpected Binance trade history response');
        fills.push(...batch);
        if (batch.length < 1000) break;
        if (page === 19) throw new Error('Binance trade history exceeds safe pagination limit');
        const lastId = Number(batch[batch.length - 1]?.id);
        if (!Number.isSafeInteger(lastId)) throw new Error('Unexpected Binance trade history response');
        params = { symbol, fromId: lastId + 1, limit: 1000 };
    }

    return fills.map(f => ({
        price: parseFloat(f.price),
        qty: parseFloat(f.qty),
        pnl: parseFloat(f.realizedPnl),
        fee: parseFloat(f.commission),
        time: f.time,
        side: f.positionSide === 'LONG' ? 'Long' : f.positionSide === 'SHORT' ? 'Short' : null
    }));
}

async function getClosedTrades(creds, sinceMs, untilMs) {
    const startingSnapshot = await getOpenPositions(creds);
    const symbols = new Set();
    // Income includes commission events, so zero-PnL closes are discoverable too.
    for (let page = 1; page <= 100; page += 1) {
        const batch = await signedRequest('GET', '/fapi/v1/income', {
            startTime: sinceMs, endTime: untilMs, page, limit: 1000,
        }, creds);
        if (!Array.isArray(batch)) throw new Error('Invalid Binance income history');
        batch.forEach(row => { if (row.symbol) symbols.add(row.symbol); });
        if (batch.length < 1000) break;
        if (page === 100) throw new Error('Binance history exceeds pagination limit');
    }
    const fills = [];
    for (const symbol of symbols) {
        let params = { symbol, startTime: sinceMs, endTime: untilMs, limit: 1000 };
        const ids = new Set();
        for (let page = 0; page < 100; page += 1) {
            const batch = await signedRequest('GET', '/fapi/v1/userTrades', params, creds);
            if (!Array.isArray(batch)) throw new Error('Invalid Binance trade history');
            for (const row of batch) {
                if (ids.has(row.id)) throw new Error('Binance history pagination did not advance');
                ids.add(row.id);
                if (Number(row.time) >= sinceMs && Number(row.time) <= untilMs) fills.push(row);
            }
            if (batch.length < 1000 || Number(batch[batch.length - 1]?.time) > untilMs) break;
            const lastId = batch[batch.length - 1]?.id;
            if (!Number.isSafeInteger(lastId) || page === 99) throw new Error('Invalid Binance history pagination');
            // Binance forbids fromId together with startTime or endTime.
            params = { symbol, fromId: lastId + 1, limit: 1000 };
        }
    }
    const endingSnapshot = await getOpenPositions(creds);
    const inventoryKey = positions => JSON.stringify(positions.map(position =>
        [position.externalId, position.direction, position.qty]).sort((a, b) => a[0].localeCompare(b[0])));
    if (inventoryKey(startingSnapshot) !== inventoryKey(endingSnapshot)) {
        throw new Error('Binance positions changed during import; retry');
    }
    return completedPositions(fills, endingSnapshot);
}

async function startListenKey(creds) {
    const { response, data } = await fetchJson(`${BASE_URL}/fapi/v1/listenKey`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': creds.apiKey }
    }, 'Binance');
    if (!response.ok) throw new Error(data.msg || 'Failed to create Binance listenKey');
    if (typeof data.listenKey !== 'string' || !data.listenKey) throw new Error('Binance returned an invalid listenKey');
    return data.listenKey;
}

async function keepAliveListenKey(creds) {
    const { response, data } = await fetchJson(`${BASE_URL}/fapi/v1/listenKey`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': creds.apiKey }
    }, 'Binance');
    if (!response.ok) throw new Error(data.msg || 'Binance listenKey keepalive failed');
}

function connectStream(creds, { onPositionUpdate, onError }) {
    let ws = null;
    let keepAliveTimer = null;
    let reconnectTimer = null;
    let stopped = false;

    async function connect() {
        try {
            const listenKey = await startListenKey(creds);
            ws = new WebSocket(`${WS_BASE_URL}/${listenKey}`, { handshakeTimeout: 10_000, maxPayload: 64 * 1024 });

            ws.on('open', () => {
                keepAliveTimer = setInterval(() => {
                    keepAliveListenKey(creds).catch(error => {
                        onError(error);
                        ws?.close();
                    });
                }, LISTEN_KEY_KEEPALIVE_MS);
            });

            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw);
                    if (msg.e === 'listenKeyExpired') {
                        onError(new Error('Binance listenKey expired'));
                        ws?.close();
                    } else if (msg.e === 'ACCOUNT_UPDATE') {
                        (msg.a?.P || []).forEach(p => {
                            onPositionUpdate(normalizePosition(p.s, p.ps, p.pa, p.ep, null));
                        });
                    }
                } catch (err) {
                    onError(err);
                }
            });

            ws.on('error', (err) => onError(err));

            ws.on('close', () => {
                clearInterval(keepAliveTimer);
                if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
            });
        } catch (err) {
            onError(err);
            if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        }
    }

    connect();

    return {
        stop() {
            stopped = true;
            clearInterval(keepAliveTimer);
            clearTimeout(reconnectTimer);
            if (ws) ws.close();
        }
    };
}

module.exports = {
    id: 'binance',
    requiresPassphrase: false,
    supportsRealtime: true,
    assertReadOnly,
    testConnection,
    getOpenPositions,
    getFillsSince,
    getClosedTrades,
    connectStream
};
