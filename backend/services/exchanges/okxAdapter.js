const crypto = require('crypto');
const WebSocket = require('ws');

const BASE_URL = 'https://www.okx.com';
const WS_URL = 'wss://ws.okx.com:8443/ws/v5/private';
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAY_MS = 5000;

function sign(prehash, secret) {
    return crypto.createHmac('sha256', secret).update(prehash).digest('base64');
}

async function signedRequest(method, path, params, creds) {
    const query = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    const timestamp = new Date().toISOString();
    const signature = sign(`${timestamp}${method}${path}${query}`, creds.apiSecret);

    const response = await fetch(`${BASE_URL}${path}${query}`, {
        method,
        headers: {
            'OK-ACCESS-KEY': creds.apiKey,
            'OK-ACCESS-SIGN': signature,
            'OK-ACCESS-TIMESTAMP': timestamp,
            'OK-ACCESS-PASSPHRASE': creds.passphrase,
            'Content-Type': 'application/json'
        }
    });
    const data = await response.json();
    if (!response.ok || data.code !== '0') {
        throw new Error(data.msg || `OKX API error (${response.status})`);
    }
    return data.data;
}

function normalizePosition(p) {
    const pos = parseFloat(p.pos);
    return {
        externalId: p.posId || `${p.instId}-${p.posSide}`,
        symbol: p.instId,
        direction: p.posSide === 'long' || (p.posSide === 'net' && pos >= 0) ? 'Long' : 'Short',
        entryPrice: parseFloat(p.avgPx) || 0,
        qty: Math.abs(pos),
        leverage: parseFloat(p.lever) || null
    };
}

async function testConnection(creds) {
    await signedRequest('GET', '/api/v5/account/positions', { instType: 'SWAP' }, creds);
}

async function getOpenPositions(creds) {
    const positions = await signedRequest('GET', '/api/v5/account/positions', { instType: 'SWAP' }, creds);
    return positions.filter(p => parseFloat(p.pos) !== 0).map(normalizePosition);
}

async function getFillsSince(creds, symbol, sinceMs) {
    const records = await signedRequest('GET', '/api/v5/account/positions-history', {
        instType: 'SWAP',
        instId: symbol
    }, creds);
    return records
        .filter(r => Number(r.uTime) >= sinceMs)
        .map(r => ({
            price: parseFloat(r.closeAvgPx),
            qty: parseFloat(r.closeTotalPos),
            pnl: parseFloat(r.pnl),
            fee: parseFloat(r.fee),
            time: Number(r.uTime)
        }));
}

function connectStream(creds, { onPositionUpdate, onError }) {
    let ws = null;
    let pingTimer = null;
    let reconnectTimer = null;
    let stopped = false;

    function login() {
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const signature = sign(`${timestamp}GET/users/self/verify`, creds.apiSecret);
        ws.send(JSON.stringify({
            op: 'login',
            args: [{ apiKey: creds.apiKey, passphrase: creds.passphrase, timestamp, sign: signature }]
        }));
    }

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.on('open', () => login());

        ws.on('message', (raw) => {
            const text = raw.toString();
            if (text === 'pong') return;
            try {
                const msg = JSON.parse(text);
                if (msg.event === 'login' && msg.code === '0') {
                    ws.send(JSON.stringify({ op: 'subscribe', args: [{ channel: 'positions', instType: 'SWAP' }] }));
                    pingTimer = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
                    }, PING_INTERVAL_MS);
                } else if (msg.event === 'error') {
                    onError(new Error(msg.msg || 'OKX WS error'));
                } else if (msg.arg?.channel === 'positions' && Array.isArray(msg.data)) {
                    msg.data.forEach(p => onPositionUpdate(normalizePosition(p)));
                }
            } catch (err) {
                onError(err);
            }
        });

        ws.on('error', (err) => onError(err));

        ws.on('close', () => {
            clearInterval(pingTimer);
            if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        });
    }

    connect();

    return {
        stop() {
            stopped = true;
            clearInterval(pingTimer);
            clearTimeout(reconnectTimer);
            if (ws) ws.close();
        }
    };
}

module.exports = {
    id: 'okx',
    requiresPassphrase: true,
    supportsRealtime: true,
    testConnection,
    getOpenPositions,
    getFillsSince,
    connectStream
};
