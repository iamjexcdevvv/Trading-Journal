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

app.post('/api/trade', (req, res) => {
    // Handle trade submission
    saveTrade(req.body)
});

const tradeSchema = new mongoose.Schema({
    date: Date,
    symbol: String,
    direction: String,
    strategy: String,
    notes: String,
    realizedPnl: Number,
});

const Trade = mongoose.model('Trade', tradeSchema);

async function saveTrade(tradeData) {
    const newTrade = new Trade(tradeData);
    await newTrade.save();
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