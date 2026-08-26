const { updateTradeNotesById, getTradesByUserId, deleteTradeById, createTrade, updateTradeScreenshotById, updateTradeById } = require('../models/trades');
const jwt = require('jsonwebtoken');
const { getUserById } = require('../models/users');
const Joi = require('joi');

const tradeSchema = Joi.object({
    date: Joi.date().iso(),
    symbol: Joi.string().required(),
    direction: Joi.string().valid('Long', 'Short').required(),
    strategy: Joi.string().required(),
    setup: Joi.string().allow('').optional(),
    checklist: Joi.array().items(Joi.object({
        label: Joi.string().required(),
        checked: Joi.boolean().required(),
        required: Joi.boolean().default(true),
    })).optional(),
    rulesChecklist: Joi.array().items(Joi.object({
        label: Joi.string().required(),
        checked: Joi.boolean().required(),
        required: Joi.boolean().default(true),
    })).optional(),
    notes: Joi.string().allow('').optional(),
    pnl: Joi.number().allow(null).optional(),
    screenshot: Joi.string().uri().allow('').optional(),
    tags: Joi.array().items(Joi.string()).optional()
})

const updateNotesSchema = Joi.object({
    notes: Joi.string().allow('').required()
})

const updateScreenshotSchema = Joi.object({
    screenshot: Joi.string().uri().allow('').required()
})

async function updateTradeNotes(req, res) {
    try {
        const { error } = updateNotesSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { id } = req.params;
        const { notes } = req.body;

        const updatedTrade = await updateTradeNotesById(id, notes);
        if (!updatedTrade) {
            return res.status(404).json({ error: 'Trade not found' });
        }
        res.status(200).json(updatedTrade);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function getTrades(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const trades = await getTradesByUserId(user._id);
        res.status(200).json(trades);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function deleteTrade(req, res) {
    try {
        const { id } = req.params;
        await deleteTradeById(id);
        res.status(200).json({ message: 'Trade deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function saveTrade(req, res) {
    const { error } = tradeSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        // Convert date string to Date object if provided
        const tradeData = { ...req.body };
        if (tradeData.date) {
            tradeData.date = new Date(tradeData.date);
        }
        const newTrade = await createTrade({ ...tradeData, userId: user._id });
        res.status(201).json(newTrade);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
}

async function updateTradeScreenshot(req, res) {
    try {
        const { error } = updateScreenshotSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { id } = req.params;
        const { screenshot } = req.body;

        const updatedTrade = await updateTradeScreenshotById(id, screenshot);
        if (!updatedTrade) {
            return res.status(404).json({ error: 'Trade not found' });
        }
        res.status(200).json(updatedTrade);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function updateTrade(req, res) {
    try {
        const { error } = tradeSchema.validate(req.body);
        if (error) {
            return res.status(400).json({ error: error.details[0].message });
        }

        const { id } = req.params;
        const tradeData = { ...req.body };
        if (tradeData.date) {
            tradeData.date = new Date(tradeData.date);
        }

        const updatedTrade = await updateTradeById(id, tradeData);
        if (!updatedTrade) {
            return res.status(404).json({ error: 'Trade not found' });
        }
        res.status(200).json(updatedTrade);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

module.exports = {
    saveTrade,
    getTrades,
    deleteTrade,
    updateTradeNotes,
    updateTradeScreenshot,
    updateTrade
}