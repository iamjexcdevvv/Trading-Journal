const express = require('express');
const cors = require('cors');

const tradeRoutes = require('../routes/trades');

module.exports = function (app) {
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));

    app.use('/api/trades', tradeRoutes);
}