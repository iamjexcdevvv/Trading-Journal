const mongoose = require('mongoose');

const tradingRuleSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true },
    required: { type: Boolean, default: true },
});

const TradingRule = mongoose.model('TradingRule', tradingRuleSchema);

async function saveTradingRule(ruleData) {
    const rule = new TradingRule(ruleData);
    await rule.save();
    return rule;
}

async function getTradingRulesByUserId(userId) {
    return await TradingRule.find({ userId });
}

async function deleteTradingRuleById(id, userId) {
    return await TradingRule.findOneAndDelete({ _id: id, userId });
}

async function updateTradingRuleById(id, userId, updateData) {
    return await TradingRule.findOneAndUpdate({ _id: id, userId }, updateData, { returnDocument: 'after', runValidators: true });
}

module.exports = {
    saveTradingRule,
    getTradingRulesByUserId,
    deleteTradingRuleById,
    updateTradingRuleById,
};
