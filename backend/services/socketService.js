const jwt = require('jsonwebtoken');
const { getUserById } = require('../models/users');
const { isApprovedUser } = require('../utils/access');
const priceFeedService = require('./priceFeedService');

function createSocketAuthenticator({ verifyToken = jwt.verify, findUser = getUserById } = {}) {
    return async function authenticateSocket(socket, next) {
        const token = socket.handshake?.auth?.token;
        if (typeof token !== 'string' || !token) return next(new Error('Authentication failed'));

        try {
            const decoded = verifyToken(token, process.env.JWT_SECRET);
            if (!decoded?._id || !Number.isInteger(decoded.exp) || decoded.exp * 1000 <= Date.now()) {
                return next(new Error('Authentication failed'));
            }

            const user = await findUser(decoded._id);
            if (!user || !user.refreshToken || !isApprovedUser(user)) {
                return next(new Error('Authentication failed'));
            }

            socket.userId = String(user._id);
            socket.authenticatedUser = { _id: socket.userId, role: user.role };
            socket.authExpiresAt = decoded.exp * 1000;
            await socket.join(`user:${socket.userId}`);
            return next();
        } catch {
            return next(new Error('Authentication failed'));
        }
    };
}

function configureSockets(io, {
    authenticate = createSocketAuthenticator(),
    priceFeeds = priceFeedService
} = {}) {
    io.use(authenticate);
    io.on('connection', (socket) => {
        const expirationTimer = setTimeout(
            () => socket.disconnect(true),
            Math.max(0, socket.authExpiresAt - Date.now())
        );
        socket.on('subscribe-price', async (payload, acknowledge) => {
            let result;
            try {
                result = await priceFeeds.subscribe(socket, payload);
            } catch {
                result = { ok: false, error: 'Subscription failed' };
            }
            if (typeof acknowledge === 'function') acknowledge(result);
        });
        socket.on('unsubscribe-price', async (acknowledge) => {
            const result = await priceFeeds.unsubscribe(socket);
            if (typeof acknowledge === 'function') acknowledge(result);
        });
        socket.on('disconnect', () => {
            clearTimeout(expirationTimer);
            priceFeeds.disconnect(socket).catch(() => {});
        });
    });
}

module.exports = { createSocketAuthenticator, configureSockets };
