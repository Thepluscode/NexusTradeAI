// src/routes/alerts.js
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

// Get alert history for a user
router.get('/user/:userId/history', [
  param('userId').isString().notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  query('type').optional().isString()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { userId } = req.params;
    const { limit = 100, severity, type } = req.query;
    
    const alertManager = req.app.get('alertManagerService');
    let alerts = alertManager.getAlertHistory(userId, limit);
    
    // Apply filters
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity);
    }
    
    if (type) {
      alerts = alerts.filter(alert => alert.type === type);
    }
    
    res.json({
      success: true,
      data: {
        alerts,
        total: alerts.length
      }
    });
    
  } catch (error) {
    req.logger.error('Error getting alert history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get alert history'
    });
  }
});

// Get alert statistics
router.get('/user/:userId/stats', [
  param('userId').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { userId } = req.params;
    
    const alertManager = req.app.get('alertManagerService');
    const stats = alertManager.getAlertStats(userId);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    req.logger.error('Error getting alert stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get alert statistics'
    });
  }
});

// Create custom alert
router.post('/create', [
  body('type').isString().notEmpty(),
  body('severity').isIn(['low', 'medium', 'high', 'critical']),
  body('message').isString().notEmpty(),
  body('userId').isString().notEmpty(),
  body('portfolioId').optional().isString(),
  body('data').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const alertManager = req.app.get('alertManagerService');
    const alert = await alertManager.createAlert(req.body);
    
    if (!alert) {
      return res.status(429).json({
        success: false,
        message: 'Alert rate limit exceeded or in cooldown'
      });
    }
    
    res.json({
      success: true,
      data: alert
    });
    
  } catch (error) {
    req.logger.error('Error creating alert:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create alert'
    });
  }
});

module.exports = router;