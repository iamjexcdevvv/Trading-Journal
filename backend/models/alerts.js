const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    symbol: { type: String, required: true },
    price: { type: Number, required: false },
    type: { type: String, enum: ['horizontal', 'trendline'], default: 'horizontal', required: true },
    condition: { type: String, enum: ['crossing up', 'crossing down', 'crossing'], required: true },
    currentPrice: { type: Number, required: true },
    startPrice: { type: Number },
    startTime: { type: Date },
    endPrice: { type: Number },
    endTime: { type: Date },
    status: { type: String, enum: ['active', 'triggered', 'expired'], default: 'active', required: true }
}, { timestamps: true });

const Alert = mongoose.model('Alert', alertSchema);

async function saveAlert(alertData) {
    const alert = new Alert(alertData);
    await alert.save();
    return alert;
}

async function getAlertsByUserId(userId) {
    return await Alert.find({ userId }).sort({ createdAt: -1 });
}

async function deleteAlertById(alertId)
{
    return await Alert.findByIdAndDelete(alertId);
}

module.exports = { Alert, saveAlert, getAlertsByUserId, deleteAlertById };