// Relays public exchange ticker prices to authenticated Socket.IO clients.
const publicMarketData = require('./exchanges/publicMarketData');

const SYMBOL_PATTERN = /^[A-Z0-9]{1,20}$/;
const MAX_SUBSCRIPTIONS_PER_SOCKET = 1;
const MAX_SUBSCRIPTIONS_PER_USER = 5;
const MAX_SUBSCRIPTION_ATTEMPTS_PER_MINUTE = 30;
const ALLOWED_PAYLOAD_KEYS = new Set(['exchange', 'symbol']);

function createPriceFeedService(connectors = publicMarketData) {
    let ioRef = null;
    const activeFeeds = new Map();
    const socketSubscriptions = new Map();
    const userSubscriptions = new Map();
    const socketQueues = new Map();
    const subscriptionAttempts = new Map();

    function init(io) {
        ioRef = io;
    }

    function feedKey(exchange, symbol) {
        return `${exchange}:${symbol}`;
    }

    function roomName(exchange, symbol) {
        return `price:${exchange}:${symbol}`;
    }

    function userKey(socket) {
        return socket.userId ? String(socket.userId) : null;
    }

    function enqueue(socket, operation) {
        const previous = socketQueues.get(socket.id) || Promise.resolve();
        const current = previous.catch(() => {}).then(operation);
        socketQueues.set(socket.id, current);
        return current.finally(() => {
            if (socketQueues.get(socket.id) === current) socketQueues.delete(socket.id);
        });
    }

    function withinAttemptLimit(socket) {
        const now = Date.now();
        let window = subscriptionAttempts.get(socket.id);
        if (!window || now - window.startedAt >= 60 * 1000) {
            window = { startedAt: now, count: 0 };
            subscriptionAttempts.set(socket.id, window);
        }
        window.count += 1;
        return window.count <= MAX_SUBSCRIPTION_ATTEMPTS_PER_MINUTE;
    }

    function removeSubscription(socket) {
        const existing = socketSubscriptions.get(socket.id);
        if (!existing) return false;

        const key = feedKey(existing.exchange, existing.symbol);
        socket.leave(roomName(existing.exchange, existing.symbol));
        socketSubscriptions.delete(socket.id);

        const subscriptions = userSubscriptions.get(existing.userId);
        subscriptions?.delete(socket.id);
        if (subscriptions?.size === 0) userSubscriptions.delete(existing.userId);

        const feed = activeFeeds.get(key);
        if (!feed) return true;
        feed.refCount -= 1;
        if (feed.refCount <= 0) {
            feed.conn.stop();
            activeFeeds.delete(key);
        }
        return true;
    }

    async function addSubscription(socket, payload = {}) {
        const authenticatedUserId = userKey(socket);
        if (!authenticatedUserId) return { ok: false, error: 'Authentication required' };
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            return { ok: false, error: 'Invalid subscription' };
        }
        if (Object.keys(payload).some((key) => !ALLOWED_PAYLOAD_KEYS.has(key))) {
            return { ok: false, error: 'Unsupported subscription field' };
        }

        const { exchange, symbol } = payload;
        const connector = connectors[exchange];
        if (!connector) return { ok: false, error: 'Unsupported exchange' };
        if (typeof symbol !== 'string' || !SYMBOL_PATTERN.test(symbol)) {
            return { ok: false, error: 'Invalid symbol' };
        }

        let symbols;
        try {
            symbols = await connector.getSymbols();
        } catch {
            return { ok: false, error: 'Market data unavailable' };
        }
        if (!symbols.includes(symbol)) return { ok: false, error: 'Unsupported symbol' };

        const existing = socketSubscriptions.get(socket.id);
        if (existing?.exchange === exchange && existing.symbol === symbol) {
            return { ok: true, duplicate: true };
        }

        const subscriptions = userSubscriptions.get(authenticatedUserId) || new Set();
        if (!existing && subscriptions.size >= MAX_SUBSCRIPTIONS_PER_USER) {
            return { ok: false, error: 'Subscription limit reached' };
        }
        if (socketSubscriptions.has(socket.id) && MAX_SUBSCRIPTIONS_PER_SOCKET === 1) {
            removeSubscription(socket);
        }

        const key = feedKey(exchange, symbol);
        const room = roomName(exchange, symbol);
        let feed = activeFeeds.get(key);
        if (!feed) {
            try {
                feed = {
                    refCount: 0,
                    conn: connector.connectTicker(
                        symbol,
                        (price) => ioRef?.to(room).emit('price-update', { exchange, symbol, price, time: Date.now() }),
                        (error) => console.error(`Price feed error [${key}]:`, error.message)
                    )
                };
            } catch {
                return { ok: false, error: 'Market data unavailable' };
            }
            activeFeeds.set(key, feed);
        }

        socket.join(room);
        socketSubscriptions.set(socket.id, { exchange, symbol, userId: authenticatedUserId });
        subscriptions.add(socket.id);
        userSubscriptions.set(authenticatedUserId, subscriptions);
        feed.refCount += 1;
        return { ok: true };
    }

    function subscribe(socket, payload) {
        if (!withinAttemptLimit(socket)) {
            return Promise.resolve({ ok: false, error: 'Subscription rate limit reached' });
        }
        return enqueue(socket, () => addSubscription(socket, payload));
    }

    function unsubscribe(socket) {
        return enqueue(socket, () => ({ ok: removeSubscription(socket) }));
    }

    function disconnect(socket) {
        subscriptionAttempts.delete(socket.id);
        return enqueue(socket, () => ({ ok: removeSubscription(socket) }));
    }

    function inspect() {
        return {
            feeds: activeFeeds.size,
            sockets: socketSubscriptions.size,
            users: userSubscriptions.size
        };
    }

    return { init, subscribe, unsubscribe, disconnect, inspect };
}

const defaultService = createPriceFeedService();

module.exports = {
    initPriceFeedService: defaultService.init,
    subscribe: defaultService.subscribe,
    unsubscribe: defaultService.unsubscribe,
    disconnect: defaultService.disconnect,
    createPriceFeedService,
    MAX_SUBSCRIPTIONS_PER_SOCKET,
    MAX_SUBSCRIPTIONS_PER_USER,
    MAX_SUBSCRIPTION_ATTEMPTS_PER_MINUTE
};
