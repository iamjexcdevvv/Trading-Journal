const Trade = require('../models/trades');
const jwt = require('jsonwebtoken');
const { getUserById } = require('../models/users');

async function updateTradeNotes(req, res) {
    try {
        const { id } = req.params;
        const { notes } = req.body;

        const updatedTrade = await Trade.findByIdAndUpdate(id, {$set: { notes }}, { new: true, runValidators: true });
        if (!updatedTrade) {
            return res.status(404).json({ error: 'Trade not found' });
        }
        res.status(200).json(updatedTrade);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getTrades(req, res) {
    const userRefreshToken = req.cookies.refreshToken;

    if (!userRefreshToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
    }

    let decodedUser;
    try {
        decodedUser = jwt.verify(userRefreshToken, process.env.JWT_SECRET);
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const trades = await Trade.find({ userId: user._id });
        res.status(200).json(trades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function deleteTrade(req, res) {
    try {
        const { id } = req.params;
        await Trade.deleteOne({ _id: id });
        res.status(200).json({ message: 'Trade deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function saveTrade(req, res) {
    const userRefreshToken = req.cookies.refreshToken;

    if (!userRefreshToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
    }

    let decodedUser;
    try {
        decodedUser = jwt.verify(userRefreshToken, process.env.JWT_SECRET);
    }
    catch (err) {
        return res.status(401).json({ error: err });
    }

    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const newTrade = new Trade({ ...req.body, userId: user._id });
        await newTrade.save();
        res.status(201).json(newTrade);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

module.exports = {
    saveTrade,
    getTrades,
    deleteTrade,
    updateTradeNotes
}