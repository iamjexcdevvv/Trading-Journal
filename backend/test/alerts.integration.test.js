const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const mongoUri = process.env.TEST_MONGODB_URI;

test('alert CRUD endpoints enforce authentication and ownership', { skip: !mongoUri }, async (t) => {
    process.env.JWT_SECRET = 'alert-integration-test-secret';
    await mongoose.connect(mongoUri);
    require('../models/users');
    const User = mongoose.model('User');
    const { Alert } = require('../models/alerts');
    const { AlertEvent } = require('../models/alertEvents');
    const marketData = require('../services/exchanges/publicMarketData');
    marketData.bitunix.getCurrentPrice = async () => 100;
    const routes = require('../routes/alerts');
    const app = express();
    app.use(express.json());
    app.use('/api/alerts', routes);
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const base = `http://127.0.0.1:${server.address().port}/api/alerts`;
    const marker = `alerts-${Date.now()}@test.local`;
    const owner = await User.create({ email: `owner-${marker}`, googleId: `owner-${marker}` });
    const stranger = await User.create({ email: `stranger-${marker}`, googleId: `stranger-${marker}` });
    const ownerToken = jwt.sign({ _id: owner._id }, process.env.JWT_SECRET);
    const strangerToken = jwt.sign({ _id: stranger._id }, process.env.JWT_SECRET);
    const request = (url, token, options = {}) => fetch(url, { ...options, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) } });

    t.after(async () => {
        await Alert.deleteMany({ userId: { $in: [owner._id, stranger._id] } });
        await AlertEvent.deleteMany({ userId: { $in: [owner._id, stranger._id] } });
        await User.deleteMany({ _id: { $in: [owner._id, stranger._id] } });
        await new Promise((resolve) => server.close(resolve));
        await mongoose.disconnect();
    });

    assert.equal((await request(base, null)).status, 401);
    const createdResponse = await request(base, ownerToken, { method: 'POST', body: JSON.stringify({ name: 'Breakout', exchange: 'bitunix', symbol: 'BTCUSDT', condition: 'crosses_above', targetValue: 120, frequency: 'once', notificationMethods: ['in_app'], isActive: false }) });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.userId, String(owner._id));

    assert.equal((await request(`${base}/${created._id}`, strangerToken)).status, 404);
    assert.equal((await request(`${base}/${created._id}`, strangerToken, { method: 'PATCH', body: JSON.stringify({ name: 'Stolen' }) })).status, 404);
    assert.equal((await request(`${base}/${created._id}`, strangerToken, { method: 'DELETE' })).status, 404);

    const editedResponse = await request(`${base}/${created._id}`, ownerToken, { method: 'PATCH', body: JSON.stringify({ name: 'Edited breakout', targetValue: 125 }) });
    assert.equal(editedResponse.status, 200);
    assert.equal((await editedResponse.json()).name, 'Edited breakout');
    assert.equal((await request(`${base}/${created._id}`, ownerToken, { method: 'DELETE' })).status, 200);
    assert.equal(await Alert.countDocuments({ _id: created._id }), 0);
});
