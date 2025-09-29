const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const validators = require('../middleware/validator');
const security = require('../middleware/security');

const router = express.Router();

// Authentication routes
router.post('/register', validators.register, authController.register);
router.post('/login', validators.login, authController.login);
router.post('/refresh-token', authController.refreshToken);
router.post('/logout', security.authenticate, authController.logout);
router.post('/logout-all', security.authenticate, authController.logoutAll);

// Password reset
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// OAuth routes
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  // Generate tokens for OAuth user
  const { accessToken, refreshToken } = require('../services/jwtService').generateTokens(req.user);
  
  // Redirect to frontend with tokens
  res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${accessToken}&refresh=${refreshToken}`);
});

router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));
router.get('/facebook/callback', passport.authenticate('facebook', { session: false }), (req, res) => {
  // Generate tokens for OAuth user
  const { accessToken, refreshToken } = require('../services/jwtService').generateTokens(req.user);
  
  // Redirect to frontend with tokens
  res.redirect(`${process.env.FRONTEND_URL}/auth/success?token=${accessToken}&refresh=${refreshToken}`);
});

module.exports = router;