// Public (unauthenticated) USDT-M futures market data: symbol list + live ticker price.
const WebSocket = require('ws');

const BASE_URL = 'https://fapi.binance.com';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';
const RECONNECT_DELAY_MS = 5000;
const SYMBOLS_CACHE_TTL_MS = 60 * 60 * 1000;

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
    const query = new URLSearchParams({ symbol, interval, limit: String(limit) });
    if (endTime !== undefined) query.set('endTime', String(endTime));
    const response = await fetch(`${BASE_URL}/fapi/v1/klines?${query}`);
    if (!response.ok) throw new Error(`Binance klines error (${response.status})`);
    return (await response.json()).map(normalizeCandle).sort((a, b) => a.time - b.time);
}

async function getCurrentPrice(symbol) {
    const query = new URLSearchParams({ symbol });
    const response = await fetch(`${BASE_URL}/fapi/v1/ticker/price?${query}`);
    if (!response.ok) throw new Error(`Binance ticker error (${response.status})`);
    const price = Number((await response.json()).price);
    if (!Number.isFinite(price)) throw new Error('Binance returned an invalid price');
    return price;
}

let symbolsCache = null;
let symbolsCacheTime = 0;

async function getSymbols() {
    if (symbolsCache && Date.now() - symbolsCacheTime < SYMBOLS_CACHE_TTL_MS) return symbolsCache;

    const response = await fetch(`${BASE_URL}/fapi/v1/exchangeInfo`);
    if (!response.ok) throw new Error(`Binance exchangeInfo error (${response.status})`);
    const data = await response.json();

    symbolsCache = (data.symbols || [])
        .filter(s => s.contractType === 'PERPETUAL' && s.status === 'TRADING' && s.quoteAsset === 'USDT')
        .map(s => s.symbol)
        .sort();
    symbolsCacheTime = Date.now();
    return symbolsCache;
}

// onPrice(price: number) is called on every ticker tick; onError(err) on any stream error.
function connectTicker(symbol, onPrice, onError) {
    let ws = null;
    let reconnectTimer = null;
    let stopped = false;

    function connect() {
        ws = new WebSocket(`${WS_BASE_URL}/${symbol.toLowerCase()}@ticker`);

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                if (msg.c !== undefined) onPrice(parseFloat(msg.c));
            } catch (err) {
                onError(err);
            }
        });

        ws.on('error', (err) => onError(err));

        ws.on('close', () => {
            if (!stopped) reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
        });
    }

    connect();

    return {
        stop() {
            stopped = true;
            clearTimeout(reconnectTimer);
            if (ws) ws.close();
        }
    };
}

module.exports = { getSymbols, getCandles, getCurrentPrice, connectTicker };
