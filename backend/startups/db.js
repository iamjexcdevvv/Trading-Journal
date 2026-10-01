const mongoose = require('mongoose');

module.exports = async function connectDatabase(uri) {
    await mongoose.connect(uri);
}
