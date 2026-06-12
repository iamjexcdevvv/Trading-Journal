const express = require('express');
const router = express.Router();
const passport = require('passport');

const { registerUser, loginUser, refreshToken, logoutUser, googleAuth } = require('../controllers/auth');

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/refresh', refreshToken)
router.post('/logout', logoutUser)

router.get('/google', passport.authenticate('google', { scope:
      [ 'email', 'profile' ] }
))
router.get('/google/callback', passport.authenticate('google', { session: false, failureRedirect: `${process.env.FRONTEND_URL}/login` }), googleAuth)

module.exports = router;