const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development';

require('dotenv').config({
    path: envFile
});
require('./config/passport');

const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const helmet = require('helmet');
const winston = require('winston');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');
const app = express();
const jwt = require('jsonwebtoken');
const { initAlertService, handlePriceUpdate, loadActiveAlerts } = require('./services/alertService');
const { initExchangeSyncService, loadActiveConnections } = require('./services/exchangeSyncService');
const { initPriceFeedService, subscribe: subscribePriceFeed, unsubscribe: unsubscribePriceFeed } = require('./services/priceFeedService');

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST']
    }
});

initExchangeSyncService(io);
loadActiveConnections();
initPriceFeedService(io);

let ws;

const connectWS = () => {
    console.log('Connecting to Bitunix WS: ', process.env.EXCHANGE_WS_URL);
    ws = new WebSocket(process.env.EXCHANGE_WS_URL);

    ws.on('open', async () => {
        console.log('WebSocket connection opened to BITUNIX');
        initAlertService(io, ws);
        await loadActiveAlerts();
    });

    ws.on('message', (message) => {
        try {
            const symbolData = JSON.parse(message);
            handlePriceUpdate(symbolData);
        } catch (err) {
            console.error("Error processing WS message:", err);
        }
    });

    ws.on('error', (err) => {
        console.error('Bitunix WS error:', err);
    });

    ws.on('close', (code, reason) => {
        console.log('Bitunix WS connection closed:', code, reason ? reason.toString() : '');
        setTimeout(() => {
            console.log('Attempting to reconnect Bitunix WS...');
            connectWS();
        }, 5000);
    });
};

// Start WS connection
connectWS();

io.on('connection', (socket) => {
    console.log('A user connected to Socket.io');

    socket.on('authenticate', (data) => {
        if (data && data.token) {
            try {
                const decodedUser = jwt.verify(data.token, process.env.JWT_SECRET);
                socket.userId = decodedUser._id;
                socket.join(`user:${decodedUser._id}`);
                console.log(`Socket authenticated for user: ${decodedUser._id}`);
            } catch (err) {
                console.error("Socket authentication failed:", err.message);
            }
        }
    });

    socket.on('subscribe-price', ({ exchange, symbol } = {}) => {
        subscribePriceFeed(socket, exchange, symbol);
    });

    socket.on('unsubscribe-price', () => {
        unsubscribePriceFeed(socket);
    });

    socket.on('disconnect', () => {
        unsubscribePriceFeed(socket);
        console.log('A user disconnected from Socket.io');
    });
});

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console({ level: 'debug' }),
    new winston.transports.File({ filename: 'logs/errors.log', level: 'error' })
  ]
})

const globalRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    ipv6Subnet: 56,
    skip: (req) => process.env.NODE_ENV === 'development',
    message: { error: 'Too many requests, please try again later.' }
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    logger.on('finish', () => {
        process.exit(1);
    })
    logger.end();
});

process.on('unhandledRejection', (error) => {
    logger.error('Unhandled Rejection:', error);
    logger.on('finish', () => {
        process.exit(1);
    })
    logger.end();
});

require('./startups/db')();

if (app.get('env') === 'development') {
    app.use(morgan('dev'));
    console.log('Morgan enabled in development mode');
}
else {
    app.use(morgan('combined'));
}

app.use(helmet());

require('./startups/routes')(app, logger, globalRateLimiter);

server.listen(process.env.PORT || 3000, () => {
    console.log('Server is running on port ' + (process.env.PORT || 3000));
});