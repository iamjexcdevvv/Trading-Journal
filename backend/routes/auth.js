const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const passport = require('passport');

const {
      registerUser,
      loginUser,
      refreshToken,
      logoutUser,
      googleAuth,
      exchangeOAuthCode,
      beginGoogleAuth,
      verifyGoogleState
} = require('../controllers/auth');

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

router.use((req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      next();
});

router.post('/register', authRateLimiter, registerUser)
router.post('/login', authRateLimiter, loginUser)
router.post('/refresh', refreshToken)
router.post('/logout', logoutUser)
router.post('/oauth/exchange', authRateLimiter, exchangeOAuthCode)

router.get('/google', beginGoogleAuth, (req, res, next) => {
      return passport.authenticate('google', {
            scope: ['email', 'profile'],
            state: res.locals.oauthState,
            session: false
      })(req, res, next);
})
router.get(
      '/google/callback',
      verifyGoogleState,
      passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login?oauth=failed` }),
      googleAuth
)

module.exports = router;
