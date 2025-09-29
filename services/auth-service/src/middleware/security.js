const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

class SecurityMiddleware {
  async authenticate(req, res, next) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      // Verify JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check if session is active
      const session = await Session.findOne({
        token,
        userId: decoded.userId,
        isActive: true,
        expiresAt: { $gt: new Date() }
      });

      if (!session) {
        return res.status(401).json({
          success: false,
          message: 'Invalid or expired session'
        });
      }

      // Get user
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'User not found or inactive'
        });
      }

      // Update session activity
      session.lastActivity = new Date();
      await session.save();

      req.user = user;
      req.session = session;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(401).json({
        success: false,
        message: 'Invalid authentication token'
      });
    }
  }

  authorize(...roles) {
    return (req, res, next) => {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    };
  }

  async requireEmailVerification(req, res, next) {
    if (!req.user.isEmailVerified) {
      return res.status(403).json({
        success: false,
        message: 'Email verification required'
      });
    }
    next();
  }

  async requireKYC(req, res, next) {
    if (req.user.kycStatus !== 'verified') {
      return res.status(403).json({
        success: false,
        message: 'KYC verification required'
      });
    }
    next();
  }
}

module.exports = new SecurityMiddleware();