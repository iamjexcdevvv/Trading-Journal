const mongoose = require('mongoose');
const express = require('express');
const morgan = require('morgan');
const helmet = require('helmet');
const cors = require('cors');

const app = express();

app.use(morgan('dev'));

app.use(helmet());
app.use(cors());
app.use(express.json());

app.post('/api/trade', saveTrade);
app.get('/api/trades', getTrades)
app.delete('/api/trade/:id', deleteTrade);

const tradeSchema = new mongoose.Schema({
    date: Date,
    symbol: String,
    direction: String,
    strategy: String,
    notes: String,
    pnl: Number,
});

const Trade = mongoose.model('Trade', tradeSchema);

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

async function connectDB()
{
    try {
        await mongoose.connect('mongodb://localhost:27017/trade-journal');
        console.log('Connected to MongoDB');
    }
    catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
}

connectDB();

app.listen(3000, () => {
    console.log('Server is running on port 3000');
});