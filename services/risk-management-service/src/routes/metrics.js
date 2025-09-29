// src/routes/metrics.js
const express = require('express');
const promClient = require('prom-client');
const router = express.Router();

// Get Prometheus metrics
router.get('/', async (req, res) => {
  try {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  } catch (error) {
    req.logger.error('Error getting metrics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get metrics'
    });
  }
});

// Get risk metrics summary
router.get('/risk/summary', async (req, res) => {
  try {
    const riskMetrics = {
      totalPortfolios: 0,
      totalAlerts: 0,
      averageVaR: 0,
      riskDistribution: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0
      }
    };
    
    // This would be populated from actual monitoring data
    res.json({
      success: true,
      data: riskMetrics
    });
    
  } catch (error) {
    req.logger.error('Error getting risk metrics summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get risk metrics summary'
    });
  }
});

module.exports = router;
