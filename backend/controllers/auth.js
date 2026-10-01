const bcrypt = require('bcrypt');
const crypto = require('node:crypto');
const Joi = require('joi');
const jwt = require("jsonwebtoken");
const {saveUser, getUser, getUserById, getUserByGoogleId, getUserByEmail} = require('../models/users');
const {
    OAUTH_CODE_TTL_MS,
    OAUTH_STATE_TTL_MS,
    issueOAuthArtifact,
    consumeOAuthArtifact
} = require('../models/oauthArtifacts');
const generateJWTToken = require('../utils/token')
const { isApprovedUser, accessTokenPayload } = require('../utils/access');
const {
    refreshCookieOptions,
    refreshCookieClearOptions,
    oauthStateCookieOptions,
    oauthStateCookieClearOptions
} = require('../utils/authCookies');

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

const oauthCodeSchema = Joi.object({
    code: Joi.string().pattern(/^[A-Za-z0-9_-]{43}$/).required()
});

async function establishSession(user, res, message) {
    const newRefreshToken = generateJWTToken({_id: user._id}, '7d');
    const accessToken = generateJWTToken(accessTokenPayload(user));

    user.refreshToken = await bcrypt.hash(newRefreshToken, 10);
    await user.save();

    res.cookie('refreshToken', newRefreshToken, refreshCookieOptions());
    return res.status(200).json({ message, accessToken });
}

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

    return establishSession(user, res, 'Login successful');
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

    return establishSession(user, res, 'Token refreshed successfully');
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

    res.clearCookie('refreshToken', refreshCookieClearOptions());

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
            role: 'user',
            approvalStatus: 'pending'
        });

        user = newUser;
    }

    if (!isApprovedUser(user)) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?approval=pending`);
    }

    const code = await issueOAuthArtifact('code', { userId: user._id, ttlMs: OAUTH_CODE_TTL_MS });
    return res.redirect(`${process.env.FRONTEND_URL}/auth/callback?code=${encodeURIComponent(code)}`);
}

async function exchangeOAuthCode(req, res) {
    const { error, value } = oauthCodeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'Invalid or expired authorization code' });

    const artifact = await consumeOAuthArtifact('code', value.code);
    if (!artifact?.userId) return res.status(400).json({ error: 'Invalid or expired authorization code' });

    const user = await getUserById(artifact.userId);
    if (!user || !isApprovedUser(user)) {
        return res.status(400).json({ error: 'Invalid or expired authorization code' });
    }

    return establishSession(user, res, 'Login successful');
}

async function beginGoogleAuth(req, res, next) {
    try {
        const state = await issueOAuthArtifact('state', { ttlMs: OAUTH_STATE_TTL_MS });
        res.cookie('oauthState', state, oauthStateCookieOptions(OAUTH_STATE_TTL_MS));
        res.locals.oauthState = state;
        return next();
    } catch (error) {
        return next(error);
    }
}

function secretsMatch(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string') return false;
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifyGoogleState(req, res, next) {
    const suppliedState = req.query?.state;
    const boundState = req.cookies?.oauthState;
    res.clearCookie('oauthState', oauthStateCookieClearOptions());

    if (!secretsMatch(suppliedState, boundState)) {
        return res.redirect(`${process.env.FRONTEND_URL}/login?oauth=failed`);
    }

    try {
        const state = await consumeOAuthArtifact('state', suppliedState);
        if (!state) return res.redirect(`${process.env.FRONTEND_URL}/login?oauth=failed`);
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    registerUser,
    loginUser,
    refreshToken,
    logoutUser,
    googleAuth,
    exchangeOAuthCode,
    beginGoogleAuth,
    verifyGoogleState
};
