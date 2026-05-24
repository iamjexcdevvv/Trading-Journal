const mongoose = require('mongoose');

module.exports = async function () {
    try {
        await mongoose.connect('mongodb://localhost:27017/trade-journal');
        console.log('Connected to MongoDB');
    }
    catch (err) {
        console.error('Failed to connect to MongoDB', err);
    }
}