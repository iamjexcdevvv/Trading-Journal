const publicMarketData = require('../services/exchanges/publicMarketData');

const SUPPORTED_EXCHANGES = Object.keys(publicMarketData);

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

module.exports = { getSymbols };
