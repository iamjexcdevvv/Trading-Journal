const { saveTradingRule, getTradingRulesByUserId, updateTradingRuleById, deleteTradingRuleById } = require('../models/tradingRules');
const { getUserById } = require('../models/users');
const Joi = require('joi');

const tradingRuleSchema = Joi.object({
    text: Joi.string().required(),
    required: Joi.boolean().default(true),
});

async function createTradingRule(req, res) {
    const { error } = tradingRuleSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const ruleData = {
        ...req.body,
        userId: user._id,
    };

    try {
        const savedRule = await saveTradingRule(ruleData);
        res.status(201).json(savedRule);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getUserTradingRules(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const rules = await getTradingRulesByUserId(user._id);
        res.status(200).json(rules);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function deleteTradingRule(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const removedRule = await deleteTradingRuleById(req.params.id, user._id);
        if (!removedRule) {
            return res.status(404).json({ error: 'Trading rule not found' });
        }
        res.status(200).json(removedRule);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function updateTradingRule(req, res) {
    const { error } = tradingRuleSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const updatedRule = await updateTradingRuleById(req.params.id, user._id, req.body);
        if (!updatedRule) {
            return res.status(404).json({ error: 'Trading rule not found' });
        }
        res.status(200).json(updatedRule);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = { createTradingRule, getUserTradingRules, deleteTradingRule, updateTradingRule };
