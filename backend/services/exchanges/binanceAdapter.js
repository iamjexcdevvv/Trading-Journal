const crypto = require('crypto');
const WebSocket = require('ws');

const BASE_URL = 'https://fapi.binance.com';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';
const LISTEN_KEY_KEEPALIVE_MS = 30 * 60 * 1000;
const RECONNECT_DELAY_MS = 5000;

function sign(queryString, secret) {
    return crypto.createHmac('sha256', secret).update(queryString).digest('hex');
}

async function signedRequest(method, path, params, creds) {
    const query = new URLSearchParams({ ...params, timestamp: Date.now(), recvWindow: 5000 }).toString();
    const signature = sign(query, creds.apiSecret);
    const response = await fetch(`${BASE_URL}${path}?${query}&signature=${signature}`, {
        method,
        headers: { 'X-MBX-APIKEY': creds.apiKey }
    });
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.msg || `Binance API error (${response.status})`);
    }
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

async function testConnection(creds) {
    await signedRequest('GET', '/fapi/v1/positionInformation', {}, creds);
}

async function getOpenPositions(creds) {
    const positions = await signedRequest('GET', '/fapi/v1/positionInformation', {}, creds);
    return positions
        .filter(p => parseFloat(p.positionAmt) !== 0)
        .map(p => normalizePosition(p.symbol, p.positionSide, p.positionAmt, p.entryPrice, p.leverage));
}

async function getFillsSince(creds, symbol, sinceMs) {
    const fills = await signedRequest('GET', '/fapi/v1/userTrades', { symbol, startTime: sinceMs, limit: 1000 }, creds);
    return fills.map(f => ({
        price: parseFloat(f.price),
        qty: parseFloat(f.qty),
        pnl: parseFloat(f.realizedPnl),
        fee: parseFloat(f.commission),
        time: f.time,
        side: f.positionSide === 'LONG' ? 'Long' : f.positionSide === 'SHORT' ? 'Short' : null
    }));
}

async function startListenKey(creds) {
    const response = await fetch(`${BASE_URL}/fapi/v1/listenKey`, {
        method: 'POST',
        headers: { 'X-MBX-APIKEY': creds.apiKey }
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.msg || 'Failed to create Binance listenKey');
    return data.listenKey;
}

function keepAliveListenKey(creds) {
    fetch(`${BASE_URL}/fapi/v1/listenKey`, {
        method: 'PUT',
        headers: { 'X-MBX-APIKEY': creds.apiKey }
    }).catch(err => console.error('Binance listenKey keepalive failed:', err.message));
}

function connectStream(creds, { onPositionUpdate, onError }) {
    let ws = null;
    let keepAliveTimer = null;
    let reconnectTimer = null;
    let stopped = false;

    async function connect() {
        try {
            const listenKey = await startListenKey(creds);
            ws = new WebSocket(`${WS_BASE_URL}/${listenKey}`);

            ws.on('open', () => {
                keepAliveTimer = setInterval(() => keepAliveListenKey(creds), LISTEN_KEY_KEEPALIVE_MS);
            });

            ws.on('message', (raw) => {
                try {
                    const msg = JSON.parse(raw);
                    if (msg.e === 'ACCOUNT_UPDATE') {
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
    testConnection,
    getOpenPositions,
    getFillsSince,
    connectStream
};
