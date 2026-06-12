const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const passport = require('passport');

const { registerUser, loginUser, refreshToken, logoutUser, googleAuth } = require('../controllers/auth');

const authRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 requests per windowMs
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      ipv6Subnet: 56,
      skipSuccessfulRequests: true,
      skip: (req) => process.env.NODE_ENV === 'development',
      message: { error: 'Too many auth attempts, please try again later.' }
})

router.post('/register', authRateLimiter, registerUser)
router.post('/login', authRateLimiter, loginUser)
router.post('/refresh', refreshToken)
router.post('/logout', logoutUser)

router.get('/google', passport.authenticate('google', { scope:
      [ 'email', 'profile' ] }
))
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }), googleAuth)

module.exports = router;