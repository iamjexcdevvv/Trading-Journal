// Public (unauthenticated) USDT-M futures market data: symbol list + live ticker price.
const WebSocket = require('ws');

const BASE_URL = 'https://fapi.binance.com';
const WS_BASE_URL = 'wss://fstream.binance.com/ws';
const RECONNECT_DELAY_MS = 5000;
const SYMBOLS_CACHE_TTL_MS = 60 * 60 * 1000;

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

module.exports = { getSymbols, connectTicker };
