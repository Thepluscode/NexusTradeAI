// src/routes/health.js
const express = require('express');
const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.env.npm_package_version || '1.0.0'
    };
    
    res.json(health);
  } catch (error) {
    req.logger.error('Health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

// Readiness check
router.get('/ready', async (req, res) => {
  try {
    // Check if all services are initialized
    const riskCalculationService = req.app.get('riskCalculationService');
    const riskMonitorService = req.app.get('riskMonitorService');
    const alertManagerService = req.app.get('alertManagerService');
    
    const ready = riskCalculationService && riskMonitorService && alertManagerService;
    
    if (ready) {
      res.json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
    
  } catch (error) {
    req.logger.error('Readiness check failed:', error);
    res.status(503).json({
      status: 'not ready',
      error: error.message
    });
  }
});

module.exports = router;