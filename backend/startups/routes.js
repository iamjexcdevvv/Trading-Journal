const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const tradeRoutes = require('../routes/trades');
const authRoutes = require('../routes/auth');

module.exports = function (app) {
    app.use(cors({
        origin: process.env.FRONTEND_URL,  // your frontend URL
        credentials: true                 // allow cookies
    }));
    app.use(express.json({ limit: '10mb' }));
    app.use(cookieParser());

    app.use('/api/trades', tradeRoutes);
    app.use('/api/auth', authRoutes);
}