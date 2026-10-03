const crypto = require('crypto');
const { fetchJson } = require('./http');

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

    const { response, data } = await fetchJson(`${BASE_URL}${path}${query}`, {
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
    }, 'Bitunix');
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
        direction: p.side === 'LONG' ? 'Long' : p.side === 'SHORT' ? 'Short' : null,
        entryPrice: parseFloat(p.avgOpenPrice) || 0,
        qty: parseFloat(p.qty),
        leverage: parseInt(p.leverage, 10) || null,
        openedAt: Number(p.ctime) || undefined
    }));
}

async function getFillsSince(creds, symbol, sinceMs, positionId) {
    if (positionId) {
        const result = await signedRequest('GET', '/api/v1/futures/position/get_history_positions', {
            symbol,
            positionId,
            startTime: sinceMs,
            limit: 100
        }, null, creds);
        const positions = result?.positionList;
        if (!Array.isArray(positions)) throw new Error('Unexpected Bitunix position history response');
        return positions
            .filter(position => String(position.positionId) === String(positionId))
            .map(position => ({
                price: parseFloat(position.closePrice) || 0,
                qty: parseFloat(position.maxQty) || 0,
                pnl: parseFloat(position.realizedPNL) || 0,
                fee: parseFloat(position.fee) || 0,
                time: Number(position.mtime),
                side: position.side === 'LONG' ? 'Long' : position.side === 'SHORT' ? 'Short' : null
            }));
    }

    const result = await signedRequest('GET', '/api/v1/futures/trade/get_history_trades', {
        symbol,
        startTime: sinceMs,
        limit: 100
    }, null, creds);
    const trades = Array.isArray(result) ? result : result?.tradeList;
    if (!Array.isArray(trades)) throw new Error('Unexpected Bitunix trade history response');
    return trades.map(t => ({
        price: parseFloat(t.price),
        qty: parseFloat(t.qty),
        pnl: parseFloat(t.realizedPNL),
        fee: parseFloat(t.fee),
        time: t.ctime,
        side: t.side === 'LONG' ? 'Long' : t.side === 'SHORT' ? 'Short' : null
    }));
}

async function getClosedTrades(creds, sinceMs, untilMs) {
    const trades = [];
    const ids = new Set();
    // Bitunix startTime filters creation, not closure. Scan position history so
    // positions opened before the window but closed within it are not lost.
    for (let page = 0; page < 100; page += 1) {
        const result = await signedRequest('GET', '/api/v1/futures/position/get_history_positions', {
            skip: page * 100, limit: 100,
        }, null, creds);
        const rows = result?.positionList;
        if (!Array.isArray(rows)) throw new Error('Invalid Bitunix position history');
        for (const row of rows) {
            if (!row.positionId || ids.has(String(row.positionId))) throw new Error('Invalid Bitunix history pagination');
            ids.add(String(row.positionId));
            const closedAt = Number(row.mtime);
            if (!Number.isFinite(closedAt)) throw new Error('Invalid Bitunix history timestamp');
            if (closedAt < sinceMs || closedAt > untilMs) continue;
            trades.push({ historyId: String(row.positionId), sourceExternalId: String(row.positionId),
                symbol: row.symbol, direction: row.side === 'LONG' ? 'Long' : row.side === 'SHORT' ? 'Short' : null,
                openedAt: Number(row.ctime), closedAt, entryPrice: Number(row.entryPrice),
                exitPrice: Number(row.closePrice), qty: Number(row.maxQty),
                pnl: Number(row.realizedPNL), fee: Number(row.fee), leverage: Number(row.leverage) });
        }
        if (rows.length < 100 || (Number.isFinite(Number(result.total)) && (page + 1) * 100 >= Number(result.total))) break;
        if (page === 99) throw new Error('Bitunix history exceeds pagination limit');
    }
    return trades;
}

module.exports = {
    id: 'bitunix',
    requiresPassphrase: false,
    // No confirmed private account/position WebSocket in Bitunix's public docs (only a public
    // market-data WS exists, already used by alertService.js) — falls back to fast REST polling.
    supportsRealtime: false,
    testConnection,
    getOpenPositions,
    getFillsSince,
    getClosedTrades
};
