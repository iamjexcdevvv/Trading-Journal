const crypto = require('crypto');

const BASE_URL = 'https://fapi.bitunix.com';

function sha256Hex(input) {
    return crypto.createHash('sha256').update(input).digest('hex');
}

// Bitunix docs: double-SHA256 over nonce+timestamp+apiKey+sortedQueryParams+body, then that hash+secretKey.
// Exact query-param concatenation format isn't fully specified in their public docs; this follows the
// common "sorted key+value, no separators" convention used by similar exchange APIs.
function buildSignature(nonce, timestamp, apiKey, queryParams, bodyStr, secretKey) {
    const sortedQuery = Object.keys(queryParams || {})
        .sort()
        .map(key => `${key}${queryParams[key]}`)
        .join('');
    const firstHash = sha256Hex(`${nonce}${timestamp}${apiKey}${sortedQuery}${bodyStr}`);
    return sha256Hex(`${firstHash}${secretKey}`);
}

async function signedRequest(method, path, queryParams, body, creds) {
    const nonce = crypto.randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();
    const bodyStr = body ? JSON.stringify(body).replace(/\s+/g, '') : '';
    const signature = buildSignature(nonce, timestamp, creds.apiKey, queryParams, bodyStr, creds.apiSecret);

    const query = queryParams && Object.keys(queryParams).length
        ? '?' + new URLSearchParams(queryParams).toString()
        : '';

    const response = await fetch(`${BASE_URL}${path}${query}`, {
        method,
        headers: {
            'api-key': creds.apiKey,
            'sign': signature,
            'nonce': nonce,
            'timestamp': timestamp,
            'language': 'en-US',
            'Content-Type': 'application/json'
        },
        body: bodyStr || undefined
    });
    const data = await response.json();
    if (!response.ok || (data.code !== undefined && data.code !== 0)) {
        throw new Error(data.msg || `Bitunix API error (${response.status})`);
    }
    return data.data;
}

async function testConnection(creds) {
    await signedRequest('GET', '/api/v1/futures/position/get_pending_positions', {}, null, creds);
}

async function getOpenPositions(creds) {
    const positions = await signedRequest('GET', '/api/v1/futures/position/get_pending_positions', {}, null, creds);
    return (positions || []).map(p => ({
        externalId: p.positionId,
        symbol: p.symbol,
        direction: p.side === 'LONG' ? 'Long' : 'Short',
        entryPrice: parseFloat(p.avgOpenPrice) || 0,
        qty: parseFloat(p.qty),
        leverage: parseInt(p.leverage, 10) || null
    }));
}

async function getFillsSince(creds, symbol, sinceMs) {
    const trades = await signedRequest('GET', '/api/v1/futures/trade/get_history_trades', {
        symbol,
        startTime: sinceMs,
        limit: 100
    }, null, creds);
    return (trades || []).map(t => ({
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        pnl: parseFloat(t.realizedPNL),
        fee: parseFloat(t.fee),
        time: t.ctime
    }));
}

module.exports = {
    id: 'bitunix',
    requiresPassphrase: false,
    // No confirmed private account/position WebSocket in Bitunix's public docs (only a public
    // market-data WS exists, already used by alertService.js) — falls back to fast REST polling.
    supportsRealtime: false,
    testConnection,
    getOpenPositions,
    getFillsSince
};
