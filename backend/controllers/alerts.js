const Joi = require('joi');
const { getUserById } = require('../models/users');
const { saveAlert, getAlertsByUserId, deleteAlertById } = require('../models/alerts');
const { addAlertToCache, removeAlertFromCache } = require('../services/alertService');

const alertSchema = Joi.object({
    symbol: Joi.string().required(),
    type: Joi.string().valid('horizontal', 'trendline').default('horizontal'),
    price: Joi.number().when('type', { is: 'horizontal', then: Joi.required(), otherwise: Joi.optional() }),
    condition: Joi.string().valid('crossing up', 'crossing down', 'crossing').required(),
    startPrice: Joi.number().when('type', { is: 'trendline', then: Joi.required(), otherwise: Joi.optional() }),
    startTime: Joi.date().when('type', { is: 'trendline', then: Joi.required(), otherwise: Joi.optional() }),
    endPrice: Joi.number().when('type', { is: 'trendline', then: Joi.required(), otherwise: Joi.optional() }),
    endTime: Joi.date().when('type', { is: 'trendline', then: Joi.required(), otherwise: Joi.optional() }),
});

async function createAlert(req, res)
{
    const { error } = alertSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const decodedUser = req.user;
    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    let lastPrice = 0;
    try {
        const response = await fetch(`https://fapi.bitunix.com/api/v1/futures/market/tickers?symbols=${req.body.symbol}`);
        const { data } = await response.json();
        if (data && data.length > 0) {
            lastPrice = parseFloat(data[0].lastPrice) || 0;
        }
    } catch (fetchErr) {
        console.error("Failed to fetch current ticker price from Bitunix API:", fetchErr.message);
    }

    const alert = await saveAlert({...req.body, userId: user._id, currentPrice: lastPrice});
    
    // Add to alert engine cache
    addAlertToCache(alert);

    return res.status(201).json({ message: 'Alert created successfully' });
}

async function getAlerts(req, res) {
    const decodedUser = req.user;

    if (!decodedUser) {
        return res.status(401).json({ error: 'Invalid access token' });
    }

    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const alerts = await getAlertsByUserId(user._id);
    return res.status(200).json(alerts);
}

async function deleteAlert(req, res) {
    const decodedUser = req.user;

    if (!decodedUser) {
        return res.status(401).json({ error: 'Invalid access token' });
    }

    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }
    
    const { id } = req.params;
    const alert = await deleteAlertById(id);
    
    if (alert) {
        // Remove from alert engine cache and unsubscribe if needed
        removeAlertFromCache(alert._id, alert.symbol);
    }

    return res.status(200).json(alert);
}

module.exports = { createAlert, getAlerts, deleteAlert };