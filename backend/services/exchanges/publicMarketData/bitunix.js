// Public (unauthenticated) futures market data: symbol list + live ticker price.
// Uses the same public ticker WS protocol as alertService.js (op:subscribe, ch:'ticker', price at data.la),
// but on its own connection so calculator subscriptions can't interfere with alert evaluation.
const WebSocket = require('ws');

const BASE_URL = 'https://fapi.bitunix.com';
const RECONNECT_DELAY_MS = 5000;
const SYMBOLS_CACHE_TTL_MS = 60 * 60 * 1000;

let symbolsCache = null;
let symbolsCacheTime = 0;

async function getSymbols() {
    if (symbolsCache && Date.now() - symbolsCacheTime < SYMBOLS_CACHE_TTL_MS) return symbolsCache;

    const response = await fetch(`${BASE_URL}/api/v1/futures/market/trading_pairs`);
    if (!response.ok) throw new Error(`Bitunix trading_pairs error (${response.status})`);
    const data = await response.json();
    if (data.code !== undefined && data.code !== 0) throw new Error(data.msg || 'Bitunix trading_pairs error');

    symbolsCache = (data.data || [])
        .filter(p => p.symbolStatus === 'OPEN' && p.quote === 'USDT')
        .map(p => p.symbol)
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
        ws = new WebSocket(process.env.EXCHANGE_WS_URL);

        ws.on('open', () => {
            ws.send(JSON.stringify({ op: 'subscribe', args: [{ symbol, ch: 'ticker' }] }));
        });

        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw);
                const price = msg?.data?.la;
                if (msg.symbol === symbol && price !== undefined && price !== null) {
                    onPrice(parseFloat(price));
                }
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
