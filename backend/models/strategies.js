const mongoose = require('mongoose');

const strategySchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    direction: { type: String, enum: ['Long', 'Short'], required: true },
});

const Strategy = mongoose.model('Strategy', strategySchema);

async function saveStrategy(strategyData) {
    const strategy = new Strategy(strategyData);
    await strategy.save();
    return strategy;
}

async function getStrategiesByUserId(userId) {
    return await Strategy.find({ userId });
}

async function deleteStrategyById(strategyId) {
    return await Strategy.findByIdAndDelete(strategyId);
}

async function updateStrategyById(strategyId, updateData) {
    return await Strategy.findByIdAndUpdate(strategyId, updateData, { returnDocument: 'after', runValidators: true });
}

module.exports = { saveStrategy, getStrategiesByUserId, deleteStrategyById, updateStrategyById };