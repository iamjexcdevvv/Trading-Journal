const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {type: String, required: true, minlength: 3},
    password: {type: String, required: true, minlength: 6},
    hashedPassword: {type: String, required: true},
    refreshToken: {type: String},
    refreshTokenExpiry: {type: Date}
})

const User = mongoose.model('User', userSchema);

async function saveUser(userData) {
    const newUser = new User(userData);
    await newUser.save();
    return newUser;
}

async function getUser(username) {
    return await User.findOne({ username });
}

async function getUserById(id) {
    return await User.findById(id);
}

module.exports = { saveUser, getUser, getUserById };