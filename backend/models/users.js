const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: false, unique: true, lowercase: true },
    googleId: { type: String, unique: true },
    username: {type: String, required: false, minlength: 3},
    password: {type: String, required: false, minlength: 6},
    hashedPassword: {type: String, required: false},
    refreshToken: {type: String}
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

async function getUserByGoogleId(googleId, email) {
    return await User.findOne({ $or: [{ googleId }, { email }] });
}

module.exports = { saveUser, getUser, getUserById, getUserByGoogleId };