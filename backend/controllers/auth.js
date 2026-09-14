const bcrypt = require('bcrypt');
const Joi = require('joi');
const jwt = require("jsonwebtoken");
const {saveUser, getUser, getUserById, getUserByGoogleId, getUserByEmail} = require('../models/users');
const generateJWTToken = require('../utils/token')
const { ADMIN_EMAIL, isAdminUser, isApprovedUser, accessTokenPayload } = require('../utils/access');

const registerSchema = Joi.object({
    username: Joi.string().min(3).required(),
    email: Joi.string().email().required(),
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
    const emailUser = await getUserByEmail(req.body.email);
    if (user || emailUser) {
        return res.status(400).json({ error: user ? 'Username already exists' : 'Email already exists' });
    }

    let newUser;

    try {
        const hashedPassword = await bcrypt.hash(req.body.password, 10);
        newUser = await saveUser({
            username: req.body.username,
            email: req.body.email.toLowerCase(),
            password: req.body.password,
            hashedPassword: hashedPassword,
            approvalStatus: 'pending',
            role: 'user'
        });
    } catch (err) {
        return res.status(400).json({ error: err.message });
    }

    return res.status(201).json({ message: 'Registration submitted. An administrator must approve your account.' });
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

    if (!isApprovedUser(user)) {
        return res.status(403).json({ error: 'Account awaiting administrator approval', code: 'APPROVAL_PENDING' });
    }

    if (isAdminUser(user) && (user.role !== 'admin' || user.approvalStatus !== 'approved')) {
        user.role = 'admin';
        user.approvalStatus = 'approved';
    }

    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const accessToken = generateJWTToken(accessTokenPayload(user));
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

    if (!isApprovedUser(user)) {
        return res.status(403).json({ error: 'Account awaiting administrator approval', code: 'APPROVAL_PENDING' });
    }

    const isValid = await bcrypt.compare(userRefreshToken, user.refreshToken);

    if (!isValid) {
        return res.status(401).json({ error: 'Invalid refresh token' });
    }

    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const accessToken = generateJWTToken(accessTokenPayload(user));
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
            username: profile.displayName,
            role: profile.emails[0].value.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user',
            approvalStatus: profile.emails[0].value.toLowerCase() === ADMIN_EMAIL ? 'approved' : 'pending'
        });

        user = newUser;
    }

    if (isAdminUser(user) && (user.role !== 'admin' || user.approvalStatus !== 'approved')) {
        user.role = 'admin';
        user.approvalStatus = 'approved';
        await user.save();
    }

    if (!isApprovedUser(user)) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?approval=pending`);
    }

    const refreshToken = generateJWTToken({_id: user._id}, '7d');
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);

    user.refreshToken = hashedRefreshToken;
    await user.save();

    res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });

    const accessToken = generateJWTToken(accessTokenPayload(user));

    // Redirect to frontend callback page with access token
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?accessToken=${accessToken}`);
}

module.exports = {registerUser, loginUser, refreshToken, logoutUser, googleAuth};
