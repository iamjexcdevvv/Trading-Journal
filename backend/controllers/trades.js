const Trade = require('../models/trades');

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
    try {
        const trades = await Trade.find();
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
    try {
        const newTrade = new Trade(req.body);
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