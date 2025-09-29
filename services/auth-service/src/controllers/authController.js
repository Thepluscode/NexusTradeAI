const User = require('../models/User');
const Session = require('../models/Session');
const jwtService = require('../services/jwtService');
const encryptionService = require('../services/encryptionService');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

class AuthController {
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { email, username, password, firstName, lastName, phone } = req.body;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [{ email }, { username }]
      });

      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'User already exists with this email or username'
        });
      }

      // Create new user
      const user = new User({
        email,
        username,
        password,
        firstName,
        lastName,
        phone,
        emailVerificationToken: crypto.randomBytes(32).toString('hex'),
        emailVerificationExpires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
      });

      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = jwtService.generateTokens(user);

      // Create session
      await this.createSession(user._id, accessToken, refreshToken, req);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user,
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        message: 'Registration failed',
        error: error.message
      });
    }
  }

  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { emailOrUsername, password } = req.body;

      // Find user
      const user = await User.findOne({
        $or: [
          { email: emailOrUsername },
          { username: emailOrUsername }
        ]
      });

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Check if account is locked
      if (user.isLocked) {
        return res.status(423).json({
          success: false,
          message: 'Account is temporarily locked due to too many failed login attempts'
        });
      }

      // Check if account is active
      if (!user.isActive) {
        return res.status(403).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        await user.incrementLoginAttempts();
        return res.status(401).json({
          success: false,
          message: 'Invalid credentials'
        });
      }

      // Reset login attempts on successful login
      if (user.loginAttempts > 0) {
        await user.resetLoginAttempts();
      }

      // Update last login
      user.lastLogin = new Date();
      await user.save();

      // Generate tokens
      const { accessToken, refreshToken } = jwtService.generateTokens(user);

      // Create session
      await this.createSession(user._id, accessToken, refreshToken, req);

      res.json({
        success: true,
        message: 'Login successful',
        data: {
          user,
          accessToken,
          refreshToken
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        message: 'Login failed',
        error: error.message
      });
    }
  }

  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: 'Refresh token is required'
        });
      }

      // Find session with refresh token
      const session = await Session.findOne({
        refreshToken,
        isActive: true,
        expiresAt: { $gt: new Date() }
      }).populate('userId');

      if (!session) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired refresh token'
        });
      }

      // Verify refresh token
      const decoded = jwtService.verifyRefreshToken(refreshToken);
      if (!decoded || decoded.userId !== session.userId._id.toString()) {
        return res.status(401).json({
          success: false,
          message: 'Invalid refresh token'
        });
      }

      // Generate new tokens
      const { accessToken, refreshToken: newRefreshToken } = jwtService.generateTokens(session.userId);

      // Update session
      session.token = accessToken;
      session.refreshToken = newRefreshToken;
      session.lastActivity = new Date();
      session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      await session.save();

      res.json({
        success: true,
        message: 'Token refreshed successfully',
        data: {
          accessToken,
          refreshToken: newRefreshToken
        }
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(500).json({
        success: false,
        message: 'Token refresh failed',
        error: error.message
      });
    }
  }

  async logout(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (token) {
        // Deactivate session
        await Session.updateOne(
          { token },
          { isActive: false }
        );
      }

      res.json({
        success: true,
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('Logout error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout failed',
        error: error.message
      });
    }
  }

  async logoutAll(req, res) {
    try {
      const userId = req.user._id;

      // Deactivate all sessions for user
      await Session.updateMany(
        { userId, isActive: true },
        { isActive: false }
      );

      res.json({
        success: true,
        message: 'Logged out from all devices'
      });
    } catch (error) {
      console.error('Logout all error:', error);
      res.status(500).json({
        success: false,
        message: 'Logout from all devices failed',
        error: error.message
      });
    }
  }

  async forgotPassword(req, res) {
    try {
      const { email } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        // Don't reveal if email exists
        return res.json({
          success: true,
          message: 'If the email exists, a password reset link has been sent'
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = encryptionService.hash(resetToken);
      user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
      await user.save();

      // TODO: Send reset email
      console.log(`Password reset token for ${email}: ${resetToken}`);

      res.json({
        success: true,
        message: 'If the email exists, a password reset link has been sent'
      });
    } catch (error) {
      console.error('Forgot password error:', error);
      res.status(500).json({
        success: false,
        message: 'Password reset request failed',
        error: error.message
      });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, password } = req.body;

      const hashedToken = encryptionService.hash(token);
      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() }
      });

      if (!user) {
        return res.status(400).json({
          success: false,
          message: 'Invalid or expired reset token'
        });
      }

      // Update password
      user.password = password;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();

      // Deactivate all sessions
      await Session.updateMany(
        { userId: user._id },
        { isActive: false }
      );

      res.json({
        success: true,
        message: 'Password reset successful'
      });
    } catch (error) {
      console.error('Reset password error:', error);
      res.status(500).json({
        success: false,
        message: 'Password reset failed',
        error: error.message
      });
    }
  }

  async createSession(userId, accessToken, refreshToken, req) {
    const deviceInfo = this.parseUserAgent(req.headers['user-agent']);
    
    const session = new Session({
      userId,
      token: accessToken,
      refreshToken,
      deviceInfo: {
        ...deviceInfo,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    await session.save();
    return session;
  }

  parseUserAgent(userAgent) {
    // Simple user agent parsing (in production, use a library like ua-parser-js)
    return {
      browser: 'Unknown',
      os: 'Unknown',
      device: 'Unknown'
    };
  }
}

module.exports = new AuthController();