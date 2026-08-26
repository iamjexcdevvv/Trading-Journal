const mongoose = require('mongoose');

const setupSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    items: { type: [String], default: [] },
});

// One setup per strategy per user — the frontend already filters the strategy picker to
// enforce this, but a direct API call or a race between two tabs could otherwise slip past it.
setupSchema.index({ userId: 1, name: 1 }, { unique: true });

const Setup = mongoose.model('Setup', setupSchema);

async function saveSetup(setupData) {
    const setup = new Setup(setupData);
    await setup.save();
    return setup;
}

async function getSetupsByUserId(userId) {
    return await Setup.find({ userId });
}

async function deleteSetupById(setupId, userId) {
    return await Setup.findOneAndDelete({ _id: setupId, userId });
}

async function updateSetupById(setupId, userId, updateData) {
    return await Setup.findOneAndUpdate({ _id: setupId, userId }, updateData, { returnDocument: 'after', runValidators: true });
}

module.exports = { saveSetup, getSetupsByUserId, deleteSetupById, updateSetupById };
