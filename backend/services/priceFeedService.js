// Relays public exchange ticker prices to subscribed Socket.io clients (e.g. the Lot Size Calculator).
// One live price subscription per socket: subscribing to a new pair auto-drops the previous one.
const publicMarketData = require('./exchanges/publicMarketData');

const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}$/;

let ioRef = null;
const activeFeeds = new Map(); // "exchange:symbol" -> { conn, refCount }
const socketSubscriptions = new Map(); // socket.id -> { exchange, symbol }

function initPriceFeedService(io) {
    ioRef = io;
}

function feedKey(exchange, symbol) {
    return `${exchange}:${symbol}`;
}

function roomName(exchange, symbol) {
    return `price:${exchange}:${symbol}`;
}

function subscribe(socket, exchange, symbol) {
    const connector = publicMarketData[exchange];
    if (!connector || typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) return;

    const existing = socketSubscriptions.get(socket.id);
    if (existing) {
        if (existing.exchange === exchange && existing.symbol === symbol) return;
        unsubscribe(socket);
    }

    const key = feedKey(exchange, symbol);
    const room = roomName(exchange, symbol);

    socket.join(room);
    socketSubscriptions.set(socket.id, { exchange, symbol });

    let feed = activeFeeds.get(key);
    if (!feed) {
        feed = {
            refCount: 0,
            conn: connector.connectTicker(
                symbol,
                (price) => ioRef.to(room).emit('price-update', { exchange, symbol, price, time: Date.now() }),
                (err) => console.error(`Price feed error [${key}]:`, err.message)
            )
        };
        activeFeeds.set(key, feed);
    }
    feed.refCount += 1;
}

function unsubscribe(socket) {
    const existing = socketSubscriptions.get(socket.id);
    if (!existing) return;

    const { exchange, symbol } = existing;
    const key = feedKey(exchange, symbol);
    const room = roomName(exchange, symbol);

    socket.leave(room);
    socketSubscriptions.delete(socket.id);

    const feed = activeFeeds.get(key);
    if (!feed) return;

    feed.refCount -= 1;
    if (feed.refCount <= 0) {
        feed.conn.stop();
        activeFeeds.delete(key);
    }
}

module.exports = { initPriceFeedService, subscribe, unsubscribe };
