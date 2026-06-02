const { saveStrategy, getStrategiesByUserId, updateStrategyById, deleteStrategyById } = require('../models/strategies');
const { getUserById } = require('../models/users');
const jwt = require('jsonwebtoken');

async function createStrategy(req, res) {
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

    const strategyData = {
        ...req.body,
        userId: user._id
    };

    try {
        const savedStrategy = await saveStrategy(strategyData);
        res.status(201).json(savedStrategy);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getUserStrategies(req, res) {
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
        const strategies = await getStrategiesByUserId(user._id);
        res.status(200).json(strategies);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function deleteStrategy(req, res) {
  try {
        const removedStrategy = await deleteStrategyById(req.params.id);
        res.status(200).json(removedStrategy);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function updateStrategy(req, res) {
    try {
        const updatedStrategy = await updateStrategyById(req.params.id, req.body);
        res.status(200).json(updatedStrategy);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { createStrategy, getUserStrategies, deleteStrategy, updateStrategy };