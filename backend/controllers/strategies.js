const { saveStrategy, getStrategiesByUserId, updateStrategyById, deleteStrategyById } = require('../models/strategies');
const { getUserById } = require('../models/users');
const Joi = require('joi');

const strategySchema = Joi.object({
    name: Joi.string().required(),
    direction: Joi.string().valid('Long', 'Short').required(),
})

async function createStrategy(req, res) {
    const { error } = strategySchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
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
    const decodedUser = req.user;
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
        const { error } = strategySchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const updatedStrategy = await updateStrategyById(req.params.id, req.body);
        res.status(200).json(updatedStrategy);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { createStrategy, getUserStrategies, deleteStrategy, updateStrategy };