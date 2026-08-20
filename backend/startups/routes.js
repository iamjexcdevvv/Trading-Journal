const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const tradeRoutes = require('../routes/trades');
const authRoutes = require('../routes/auth');
const strategyRoutes = require('../routes/strategies');
const tagRoutes = require('../routes/tags');
const alertRoutes = require('../routes/alerts');
const connectionRoutes = require('../routes/connections');

module.exports = function (app, logger, globalRateLimiter) {
    app.use(cors({
        origin: process.env.FRONTEND_URL,  // your frontend URL
        credentials: true                 // allow cookies
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(cookieParser());

    app.use(globalRateLimiter);
    
    app.use('/api/trades', tradeRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/strategies', strategyRoutes);
    app.use('/api/tags', tagRoutes);
    app.use('/api/alerts', alertRoutes);
    app.use('/api/connections', connectionRoutes);

    app.use((error, req, res, next) => {
        logger.error(error.message, {
            path: req.originalUrl,
            method: req.method,
            stack: req.stack
        });

        return res.status(500).json({ error: 'Something went wrong on our end. Please try again later.' });
    });
}