// src/routes/notifications.js
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const router = express.Router();

// Rate limiting
const notificationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many notification requests from this IP'
});

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation errors',
      errors: errors.array()
    });
  }
  next();
};

// Authentication middleware (would integrate with auth service)
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }
  
  // Mock authentication - would validate JWT token
  req.user = { id: 'user1', role: 'user' };
  next();
};

// Send single notification
router.post('/send',
  notificationRateLimit,
  authenticate,
  [
    body('userId').notEmpty().withMessage('User ID is required'),
    body('type').isIn([
      'trade_execution',
      'price_alert', 
      'risk_alert',
      'portfolio_update',
      'system_alert',
      'marketing',
      'security'
    ]).withMessage('Invalid notification type'),
    body('title').notEmpty().withMessage('Title is required'),
    body('message').notEmpty().withMessage('Message is required'),
    body('priority').optional().isIn(['low', 'medium', 'high', 'critical']),
    body('channels').optional().isArray(),
    body('scheduledFor').optional().isISO8601()
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const notificationService = req.app.get('notificationService');
      
      const result = await notificationService.sendNotification(req.body, {
        forceChannels: req.body.channels,
        priority: req.body.priority,
        delay: req.body.scheduledFor ? new Date(req.body.scheduledFor).getTime() - Date.now() : 0
      });
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      req.logger.error('Error sending notification:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Send bulk notifications
router.post('/send-bulk',
  notificationRateLimit,
  authenticate,
  [
    body('notifications').isArray().withMessage('Notifications must be an array'),
    body('notifications.*.userId').notEmpty().withMessage('User ID is required for each notification'),
    body('notifications.*.type').isIn([
      'trade_execution',
      'price_alert',
      'risk_alert', 
      'portfolio_update',
      'system_alert',
      'marketing',
      'security'
    ]).withMessage('Invalid notification type'),
    body('notifications.*.title').notEmpty().withMessage('Title is required for each notification'),
    body('notifications.*.message').notEmpty().withMessage('Message is required for each notification')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const notificationService = req.app.get('notificationService');
      
      const result = await notificationService.sendBulkNotifications(
        req.body.notifications,
        req.body.options || {}
      );
      
      res.json({
        success: true,
        data: result
      });
      
    } catch (error) {
      req.logger.error('Error sending bulk notifications:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Get notification history
router.get('/history/:userId',
  authenticate,
  [
    param('userId').notEmpty().withMessage('User ID is required'),
    query('type').optional().isIn([
      'trade_execution',
      'price_alert',
      'risk_alert',
      'portfolio_update', 
      'system_alert',
      'marketing',
      'security'
    ]),
    query('status').optional().isIn(['pending', 'queued', 'sent', 'failed', 'cancelled']),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
    query('offset').optional().isInt({ min: 0 })
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const notificationService = req.app.get('notificationService');
      const { userId } = req.params;
      
      // Authorization check
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      const options = {
        type: req.query.type,
        status: req.query.status,
        limit: parseInt(req.query.limit) || 100,
        offset: parseInt(req.query.offset) || 0
      };
      
      const notifications = await notificationService.getNotificationHistory(userId, options);
      
      res.json({
        success: true,
        data: notifications,
        pagination: {
          limit: options.limit,
          offset: options.offset,
          total: notifications.length
        }
      });
      
    } catch (error) {
      req.logger.error('Error fetching notification history:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Get notification by ID
router.get('/:notificationId',
  authenticate,
  [
    param('notificationId').notEmpty().withMessage('Notification ID is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const NotificationModel = require('../models/Notification');
      const { notificationId } = req.params;
      
      const notification = await NotificationModel.findOne({ id: notificationId });
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      // Authorization check
      if (req.user.id !== notification.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      res.json({
        success: true,
        data: notification
      });
      
    } catch (error) {
      req.logger.error('Error fetching notification:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Cancel scheduled notification
router.delete('/:notificationId',
  authenticate,
  [
    param('notificationId').notEmpty().withMessage('Notification ID is required')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const NotificationModel = require('../models/Notification');
      const { notificationId } = req.params;
      
      const notification = await NotificationModel.findOne({ id: notificationId });
      
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }
      
      // Authorization check
      if (req.user.id !== notification.userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Access denied'
        });
      }
      
      // Can only cancel pending or scheduled notifications
      if (notification.status !== 'pending' && notification.status !== 'queued') {
        return res.status(400).json({
          success: false,
          message: 'Can only cancel pending or scheduled notifications'
        });
      }
      
      notification.status = 'cancelled';
      notification.updatedAt = new Date();
      await notification.save();
      
      res.json({
        success: true,
        message: 'Notification cancelled successfully'
      });
      
    } catch (error) {
      req.logger.error('Error cancelling notification:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

// Get notification statistics
router.get('/stats/overview',
  authenticate,
  async (req, res) => {
    try {
      const notificationService = req.app.get('notificationService');
      const stats = notificationService.getStats();
      
      res.json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      req.logger.error('Error fetching notification stats:', error);
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
);

module.exports = router;