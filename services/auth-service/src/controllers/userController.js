const User = require('../models/User');
const Session = require('../models/Session');
const { validationResult } = require('express-validator');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');

class UserController {
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user._id);
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: { user }
      });
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get profile',
        error: error.message
      });
    }
  }

  async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const allowedUpdates = ['firstName', 'lastName', 'phone', 'dateOfBirth', 'preferences'];
      const updates = {};

      allowedUpdates.forEach(field => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      const user = await User.findByIdAndUpdate(
        req.user._id,
        updates,
        { new: true, runValidators: true }
      );

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        message: 'Profile updated successfully',
        data: { user }
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: error.message
      });
    }
  }

  async changePassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { currentPassword, newPassword } = req.body;
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Current password is incorrect'
        });
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // Deactivate all sessions except current
      const currentToken = req.headers.authorization?.replace('Bearer ', '');
      await Session.updateMany(
        { 
          userId: user._id,
          token: { $ne: currentToken },
          isActive: true
        },
        { isActive: false }
      );

      res.json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      console.error('Change password error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to change password',
        error: error.message
      });
    }
  }

  async uploadAvatar(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }

      // Process image with Sharp
      const filename = `avatar-${req.user._id}-${Date.now()}.jpeg`;
      const avatarPath = path.join('uploads/avatars', filename);

      await sharp(req.file.buffer)
        .resize(200, 200)
        .jpeg({ quality: 90 })
        .toFile(avatarPath);

      // Update user avatar
      const user = await User.findByIdAndUpdate(
        req.user._id,
        { avatar: `/uploads/avatars/${filename}` },
        { new: true }
      );

      res.json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: { 
          user,
          avatarUrl: user.avatar
        }
      });
    } catch (error) {
      console.error('Upload avatar error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload avatar',
        error: error.message
      });
    }
  }

  async getSessions(req, res) {
    try {
      const sessions = await Session.find({
        userId: req.user._id,
        isActive: true
      }).select('-token -refreshToken').sort({ lastActivity: -1 });

      res.json({
        success: true,
        data: { sessions }
      });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get sessions',
        error: error.message
      });
    }
  }

  async revokeSession(req, res) {
    try {
      const { sessionId } = req.params;
      
      const session = await Session.findOneAndUpdate(
        { 
          _id: sessionId,
          userId: req.user._id,
          isActive: true
        },
        { isActive: false },
        { new: true }
      );

      if (!session) {
        return res.status(404).json({
          success: false,
          message: 'Session not found'
        });
      }

      res.json({
        success: true,
        message: 'Session revoked successfully'
      });
    } catch (error) {
      console.error('Revoke session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to revoke session',
        error: error.message
      });
    }
  }

  async deleteAccount(req, res) {
    try {
      const { password } = req.body;
      const user = await User.findById(req.user._id);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(400).json({
          success: false,
          message: 'Password is incorrect'
        });
      }

      // Deactivate account instead of deleting
      user.isActive = false;
      user.email = `deleted_${Date.now()}_${user.email}`;
      user.username = `deleted_${Date.now()}_${user.username}`;
      await user.save();

      // Deactivate all sessions
      await Session.updateMany(
        { userId: user._id },
        { isActive: false }
      );

      res.json({
        success: true,
        message: 'Account deleted successfully'
      });
    } catch (error) {
      console.error('Delete account error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete account',
        error: error.message
      });
    }
  }
}

module.exports = new UserController();