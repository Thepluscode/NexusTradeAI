// src/routes/health.js
const express = require('express');
const router = express.Router();
const promClient = require('prom-client');

router.get('/', async (req, res) => {
  try {
    const notificationService = req.app.get('notificationService');
    const stats = notificationService.getStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'notification-service',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      stats
    };

    res.json(health);
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

router.get('/metrics', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});

module.exports = router;