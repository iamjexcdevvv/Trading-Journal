const bcrypt = require('bcrypt');
const Joi = require('joi');
const jwt = require("jsonwebtoken");
const {saveUser, getUser, getUserById, getUserByGoogleId} = require('../models/users');
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

    newUser.refreshToken = hashedRefreshToken;
    await newUser.save();

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

    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const accessToken = generateJWTToken({_id: user._id, username: user.username});
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.refreshToken = hashedRefreshToken;
    await user.save();

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

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

    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const accessToken = generateJWTToken({_id: user._id, username: user.username});
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.refreshToken = hashedRefreshToken;
    await user.save();

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

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
    await user.save();

    res.clearCookie('refreshToken', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    return res.status(200).json({ message: 'Logout successful' });
}

async function googleAuth(req, res) {
    const profile = req.user;

    let user = await getUserByGoogleId(profile.id, profile.emails[0].value);

    if (user) {
        if (!user.googleId) {
            user.googleId = profile.id;
            await user.save();
        }
    }
    else {
        const newUser = await saveUser({
            googleId: profile.id,
            email: profile.emails[0].value,
            username: profile.displayName
        });

        user = newUser;
    }

    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.refreshToken = hashedRefreshToken;
    await user.save();

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    const accessToken = generateJWTToken({_id: user._id, username: user.username});

    // Redirect to frontend callback page with access token
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?accessToken=${accessToken}`);
}

module.exports = {registerUser, loginUser, refreshToken, logoutUser, googleAuth};