const express = require('express');
const promClient = require('prom-client');
const router = express.Router();

// Prometheus metrics endpoint
router.get('/', (req, res) => {
  res.set('Content-Type', promClient.register.contentType);
  res.end(promClient.register.metrics());
});

// JSON metrics endpoint
router.get('/json', async (req, res) => {
  try {
    const metrics = await promClient.register.getMetricsAsJSON();
    
    res.json({
      success: true,
      data: metrics,
      timestamp: Date.now()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get metrics',
      error: error.message
    });
  }
});

// Trading-specific metrics
router.get('/trading', (req, res) => {
  try {
    const tradingEngine = req.app.get('tradingEngine');
    
    if (!tradingEngine) {
      return res.status(503).json({
        success: false,
        message: 'Trading engine not available'
      });
    }

    const metrics = {
      orderQueue: {
        size: tradingEngine.orderQueue?.length || 0,
        maxSize: tradingEngine.maxQueueSize || 0,
        processing: tradingEngine.processingOrders || false
      },
      circuitBreaker: {
        isTripped: tradingEngine.circuitBreaker?.isTripped || false,
        errorCount: tradingEngine.circuitBreaker?.errorCount || 0,
        threshold: tradingEngine.circuitBreaker?.errorThreshold || 0
      },
      status: {
        isRunning: tradingEngine.isRunning || false,
        acceptingOrders: tradingEngine.acceptingOrders || false
      },
      components: tradingEngine.getStatus()?.components || {}
    };

    res.json({
      success: true,
      data: metrics,
      timestamp: Date.now()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get trading metrics',
      error: error.message
    });
  }
});

// Performance metrics
router.get('/performance', (req, res) => {
  try {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    const performance = {
      memory: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        arrayBuffers: memoryUsage.arrayBuffers,
        rss: memoryUsage.rss
      },
      cpu: {
        user: cpuUsage.user,
        system: cpuUsage.system
      },
      uptime: process.uptime(),
      loadAverage: process.platform !== 'win32' ? require('os').loadavg() : [0, 0, 0],
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch
    };

    res.json({
      success: true,
      data: performance,
      timestamp: Date.now()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get performance metrics',
      error: error.message
    });
  }
});

module.exports = router;