const bcrypt = require('bcrypt');
const Joi = require('joi');
const jwt = require("jsonwebtoken");
const {saveUser, getUser, getUserById} = require('../models/users');
const generateJWTToken = require('../utils/token')

const registerSchema = Joi.object({
    username: Joi.string().min(3).required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.ref('password')
});

const loginSchema = Joi.object({
    username: Joi.string().min(3).required(),
    password: Joi.string().min(6).required()
});

async function registerUser(req, res) {
    const { error } = registerSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }
    
    const user = await getUser(req.body.username);
    if (user) {
        return res.status(400).json({ error: 'Username already exists' });
    }

    let newUser;

    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        newUser = await saveUser({
            username: req.body.username,
            password: req.body.password,
            hashedPassword: hashedPassword
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    const accessToken = generateJWTToken({_id: newUser._id, username: newUser.username});
    const refreshToken = generateJWTToken({_id: newUser._id}, '7d');

    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    const date = new Date();

    newUser.refreshToken = hashedRefreshToken;
    newUser.refreshTokenExpiry = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    await newUser.save();

    console.log('NODE_ENV:', process.env.NODE_ENV);

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.status(201).json({ message: 'User registered successfully', accessToken });
}

async function loginUser(req, res) {
    const { error } = loginSchema.validate(req.body);
    if (error) {
        return res.status(400).json({ error: error.details[0].message });
    }

    const user = await getUser(req.body.username);

    if (!user) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(req.body.password, user.hashedPassword);
    if (!isMatch) {
        return res.status(400).json({ error: 'Invalid username or password' });
    }

    const date = new Date();
    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.refreshToken = hashedRefreshToken;
    user.refreshTokenExpiry = new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000);
    await user.save();

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    const accessToken = generateJWTToken({_id: user._id, username: user .username});

    return res.status(200).json({ message: 'Login successful', accessToken });
}

async function refreshToken(req, res) {
    const userRefreshToken = req.cookies.refreshToken;

    if (!userRefreshToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
    }

    let decodedUser;
    try {
        decodedUser = jwt.verify(userRefreshToken, process.env.JWT_SECRET);
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const isValid = await bcrypt.compare(userRefreshToken, user.refreshToken);

    if (!isValid) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const date = new Date();
    if (user.refreshTokenExpiry && user.refreshTokenExpiry < date) {
        return res.status(401).json({ error: 'Refresh token expired' });
    }

    const accessToken = generateJWTToken({_id: user._id, username: user .username});
    return res.status(200).json({ message: 'Token refreshed successfully', accessToken });  
}

async function logoutUser(req, res) {
    const userRefreshToken = req.cookies.refreshToken;

    if (!userRefreshToken) {
        return res.status(401).json({ error: 'No refresh token provided' });
    }

    let decodedUser;
    try {
        decodedUser = jwt.verify(userRefreshToken, process.env.JWT_SECRET);
    }
    catch (err) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const user = await getUserById(decodedUser._id);

    if (!user || !user.refreshToken) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    user.refreshToken = null;
    user.refreshTokenExpiry = null;
    await user.save();

    res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.status(200).json({ message: 'Logout successful' });
}

module.exports = {registerUser, loginUser, refreshToken, logoutUser};