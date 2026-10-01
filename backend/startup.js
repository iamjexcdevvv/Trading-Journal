const express = require('express');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const helmet = require('helmet');
const winston = require('winston');
const http = require('node:http');
const WebSocket = require('ws');
const { Server } = require('socket.io');

const connectDatabaseDefault = require('./startups/db');
const { loadAndValidateEnvironment } = require('./config/environment');
const { createReadinessState } = require('./startups/health');
const { initAlertService, handlePriceUpdate, loadActiveAlerts } = require('./services/alertService');
const { initExchangeSyncService, loadActiveConnections } = require('./services/exchangeSyncService');
const { initPriceFeedService } = require('./services/priceFeedService');
const { configureSockets } = require('./services/socketService');

class StartupError extends Error {}
const GLOBAL_RATE_LIMIT_MAX = 1000;

function createLogger(config) {
    return winston.createLogger({
        level: 'info',
        format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
        transports: [
            new winston.transports.Console({ level: config.isProduction ? 'info' : 'debug' }),
            new winston.transports.File({ filename: 'logs/errors.log', level: 'error' })
        ]
    });
}

function createGlobalRateLimiter(config) {
    return rateLimit({
        windowMs: 15 * 60 * 1000,
        max: GLOBAL_RATE_LIMIT_MAX,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        ipv6Subnet: 56,
        skip: () => !config.isProduction,
        message: { error: 'Too many requests, please try again later.' }
    });
}

function connectBitunixWebSocket(io) {
    let ws;
    const connect = () => {
        console.log('Connecting to exchange WebSocket');
        ws = new WebSocket(process.env.EXCHANGE_WS_URL);
        ws.on('open', async () => {
            console.log('Exchange WebSocket connection opened');
            initAlertService(io, ws);
            await loadActiveAlerts();
        });
        ws.on('message', (message) => {
            try { handlePriceUpdate(JSON.parse(message)); }
            catch (error) { console.error('Error processing WebSocket message:', error.message); }
        });
        ws.on('error', (error) => console.error('Exchange WebSocket error:', error.message));
        ws.on('close', () => {
            console.log('Exchange WebSocket connection closed; reconnecting');
            setTimeout(connect, 5000);
        });
    };
    connect();
    return () => ws?.close();
}

function createRuntime(config) {
    require('./config/passport');
    const app = express();
    if (config.trustProxyHops > 0) app.set('trust proxy', config.trustProxyHops);

    const logger = createLogger(config);
    const readiness = createReadinessState();
    app.use(morgan(config.isProduction ? 'combined' : 'dev'));
    app.use(helmet());
    app.get('/health', readiness.health);
    app.get('/ready', readiness.ready);

    require('./startups/routes')(app, logger, createGlobalRateLimiter(config), config.frontendUrl);

    const server = http.createServer(app);
    const io = new Server(server, {
        cors: { origin: config.frontendUrl, methods: ['GET', 'POST'] },
        maxHttpBufferSize: 16 * 1024
    });
    configureSockets(io);

    return {
        app,
        server,
        io,
        logger,
        readiness,
        async startBackgroundServices() {
            initExchangeSyncService(io);
            initPriceFeedService(io);
            await loadActiveConnections();
            connectBitunixWebSocket(io);
        },
        listen(port) {
            return new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(port, () => {
                    server.off('error', reject);
                    resolve();
                });
            });
        }
    };
}

function installProcessHandlers(logger) {
    const stop = (label, error) => {
        logger.error(label, { message: error?.message, stack: error?.stack });
        logger.on('finish', () => process.exit(1));
        logger.end();
    };
    process.on('uncaughtException', (error) => stop('Uncaught Exception', error));
    process.on('unhandledRejection', (error) => stop('Unhandled Rejection', error));
}

async function start({
    config = loadAndValidateEnvironment(),
    connectDatabase = connectDatabaseDefault,
    runtimeFactory = createRuntime,
    installHandlers = installProcessHandlers
} = {}) {
    const runtime = runtimeFactory(config);
    installHandlers(runtime.logger);

    try {
        await connectDatabase(config.mongodbUri);
    } catch {
        runtime.readiness.markNotReady();
        throw new StartupError('Database connection failed; server was not started');
    }

    console.log('Connected to MongoDB');
    await runtime.startBackgroundServices();
    runtime.readiness.markReady();
    await runtime.listen(config.port);
    console.log(`Server is running on port ${config.port}`);
    return runtime;
}

module.exports = { StartupError, GLOBAL_RATE_LIMIT_MAX, createRuntime, installProcessHandlers, start };
