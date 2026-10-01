const publicMarketData = require('../services/exchanges/publicMarketData');

const SUPPORTED_EXCHANGES = Object.keys(publicMarketData);
const SUPPORTED_INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '4h', '1d']);

async function getSymbols(req, res) {
    const { exchange } = req.params;

    if (!SUPPORTED_EXCHANGES.includes(exchange)) {
        return res.status(400).json({ message: 'Unsupported exchange' });
    }

    try {
        const symbols = await publicMarketData[exchange].getSymbols();
        res.status(200).json(symbols);
    } catch (error) {
        res.status(502).json({ message: error.message });
    }
}

async function getCandles(req, res) {
    const { exchange } = req.params;
    const symbol = String(req.query.symbol || '').toUpperCase();
    const interval = String(req.query.interval || '15m');
    const limit = Number(req.query.limit || 200);
    const endTime = req.query.endTime === undefined ? undefined : Number(req.query.endTime);
    if (!SUPPORTED_EXCHANGES.includes(exchange)) return res.status(400).json({ message: 'Unsupported exchange' });
    if (!/^[A-Z0-9]{1,20}$/.test(symbol)) return res.status(400).json({ message: 'Invalid symbol' });
    if (!SUPPORTED_INTERVALS.has(interval)) return res.status(400).json({ message: 'Invalid interval' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) return res.status(400).json({ message: 'Invalid limit' });
    if (endTime !== undefined && (!Number.isInteger(endTime) || endTime <= 0)) return res.status(400).json({ message: 'Invalid endTime' });
    try {
        return res.status(200).json(await publicMarketData[exchange].getCandles(symbol, interval, limit, endTime));
    } catch (error) {
        return res.status(502).json({ message: error.message });
    }
}

module.exports = { getSymbols, getCandles };
