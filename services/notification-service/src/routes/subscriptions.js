// src/routes/subscriptions.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');

// Get user preferences
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const notificationService = req.app.get('notificationService');
    const preferences = await notificationService.getUserPreferences(userId);

    res.json({
      success: true,
      data: preferences,
      requestId: req.requestId
    });

  } catch (error) {
    req.logger.error('Error getting user preferences:', error);
    res.status(500).json({
      success: false,
      message: error.message,
      requestId: req.requestId
    });
  }
});

// Update user preferences
router.put('/:userId',
  [
    body('channels').optional().isObject(),
    body('types').optional().isObject(),
    body('quietHours').optional().isObject()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
          requestId: req.requestId
        });
      }

      const { userId } = req.params;
      const notificationService = req.app.get('notificationService');
      await notificationService.updateUserPreferences(userId, req.body);

      res.json({
        success: true,
        message: 'Preferences updated successfully',
        requestId: req.requestId
      });

    } catch (error) {
      req.logger.error('Error updating user preferences:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        requestId: req.requestId
      });
    }
  }
);

module.exports = router;