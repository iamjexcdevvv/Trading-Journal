// Public (unauthenticated) linear perpetual market data: symbol list + live ticker price.
const WebSocket = require('ws');

const BASE_URL = 'https://api.bybit.com';
const WS_URL = 'wss://stream.bybit.com/v5/public/linear';
const PING_INTERVAL_MS = 20000;
const RECONNECT_DELAY_MS = 5000;
const SYMBOLS_CACHE_TTL_MS = 60 * 60 * 1000;

const INTERVALS = { '1m': '1', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '4h': '240', '1d': 'D' };

function normalizeCandle(row) {
    return {
        time: Number(row[0]) / 1000,
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5])
    };
}

async function getCandles(symbol, interval, limit, endTime) {
    const query = new URLSearchParams({ category: 'linear', symbol, interval: INTERVALS[interval], limit: String(limit) });
    if (endTime !== undefined) query.set('end', String(endTime));
    const response = await fetch(`${BASE_URL}/v5/market/kline?${query}`);
    if (!response.ok) throw new Error(`Bybit kline error (${response.status})`);
    const data = await response.json();
    if (data.retCode !== 0) throw new Error(data.retMsg || 'Bybit kline error');
    return (data.result?.list || []).map(normalizeCandle).sort((a, b) => a.time - b.time);
}

async function getCurrentPrice(symbol) {
    const query = new URLSearchParams({ category: 'linear', symbol });
    const response = await fetch(`${BASE_URL}/v5/market/tickers?${query}`);
    if (!response.ok) throw new Error(`Bybit ticker error (${response.status})`);
    const data = await response.json();
    if (data.retCode !== 0) throw new Error(data.retMsg || 'Bybit ticker error');
    const price = Number(data.result?.list?.[0]?.lastPrice);
    if (!Number.isFinite(price)) throw new Error('Bybit returned an invalid price');
    return price;
}

let symbolsCache = null;
let symbolsCacheTime = 0;

async function getSymbols() {
    if (symbolsCache && Date.now() - symbolsCacheTime < SYMBOLS_CACHE_TTL_MS) return symbolsCache;

    const symbols = [];
    let cursor = '';
    do {
        const query = new URLSearchParams({ category: 'linear', limit: '1000', ...(cursor && { cursor }) });
        const response = await fetch(`${BASE_URL}/v5/market/instruments-info?${query}`);
        if (!response.ok) throw new Error(`Bybit instruments-info error (${response.status})`);
        const data = await response.json();
        if (data.retCode !== 0) throw new Error(data.retMsg || 'Bybit instruments-info error');

        (data.result?.list || []).forEach(i => {
            if (i.status === 'Trading' && i.quoteCoin === 'USDT') symbols.push(i.symbol);
        });
        cursor = data.result?.nextPageCursor || '';
    } while (cursor);

    symbolsCache = symbols.sort();
    symbolsCacheTime = Date.now();
    return symbolsCache;
}

// onPrice(price: number) is called on every ticker tick; onError(err) on any stream error.
function connectTicker(symbol, onPrice, onError) {
    let ws = null;
    let pingTimer = null;
    let reconnectTimer = null;
    let stopped = false;

    function connect() {
        ws = new WebSocket(WS_URL);

        ws.on('open', () => {
            ws.send(JSON.stringify({ op: 'subscribe', args: [`tickers.${symbol}`] }));
            pingTimer = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 'ping' }));
            }, PING_INTERVAL_MS);
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                const price = msg.data?.lastPrice;
                if (msg.topic === `tickers.${symbol}` && price !== undefined) {
                    onPrice(parseFloat(price));
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

module.exports = { getSymbols, getCandles, getCurrentPrice, connectTicker };
