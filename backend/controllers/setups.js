const { saveSetup, getSetupsByUserId, updateSetupById, deleteSetupById } = require('../models/setups');
const { getUserById } = require('../models/users');
const Joi = require('joi');
const { withGlobalSetups, isGlobalPlaybookId } = require('../services/premadePlaybook');
const { getStrategiesByUserId } = require('../models/strategies');

const setupSchema = Joi.object({
    name: Joi.string().required(),
    items: Joi.array().items(Joi.object({
        label: Joi.string().required(),
        required: Joi.boolean().default(true),
    })).optional(),
})

async function createSetup(req, res) {
    const { error } = setupSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const setupData = {
        ...req.body,
        userId: user._id
    };

    try {
        const savedSetup = await saveSetup(setupData);
        res.status(201).json(savedSetup);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'A setup for this strategy already exists' });
        }
        res.status(500).json({ error: err.message });
    }
}

async function getUserSetups(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        const [setups, strategies] = await Promise.all([
            getSetupsByUserId(user._id), getStrategiesByUserId(user._id),
        ]);
        res.status(200).json(withGlobalSetups(setups, strategies));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function deleteSetup(req, res) {
    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        if (isGlobalPlaybookId(req.params.id)) {
            return res.status(403).json({ error: 'Global confluences are read-only' });
        }
        const removedSetup = await deleteSetupById(req.params.id, user._id);
        if (!removedSetup) {
            return res.status(404).json({ error: 'Setup not found' });
        }
        res.status(200).json(removedSetup);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
}

async function updateSetup(req, res) {
    const { error } = setupSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    try {
        if (isGlobalPlaybookId(req.params.id)) {
            return res.status(403).json({ error: 'Global confluences are read-only' });
        }
        const updatedSetup = await updateSetupById(req.params.id, user._id, req.body);
        if (!updatedSetup) {
            return res.status(404).json({ error: 'Setup not found' });
        }
        res.status(200).json(updatedSetup);
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: 'A setup for this strategy already exists' });
        }
        res.status(500).json({ error: err.message });
    }
}

module.exports = { createSetup, getUserSetups, deleteSetup, updateSetup };
