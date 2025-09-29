const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

// Basic health check
router.get('/', (req, res) => {
  const healthStatus = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'trading-engine',
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  };

  res.json(healthStatus);
});

// Detailed health check
router.get('/detailed', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      service: 'trading-engine',
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      checks: {},
      metrics: {}
    };

    // Database connectivity check
    try {
      if (mongoose.connection.readyState === 1) {
        health.checks.database = {
          status: 'OK',
          connected: true,
          readyState: mongoose.connection.readyState
        };
      } else {
        health.checks.database = {
          status: 'ERROR',
          connected: false,
          readyState: mongoose.connection.readyState
        };
        health.status = 'DEGRADED';
      }
    } catch (error) {
      health.checks.database = {
        status: 'ERROR',
        error: error.message
      };
      health.status = 'DEGRADED';
    }

    // Trading engine check
    try {
      const tradingEngine = req.app.get('tradingEngine');
      if (tradingEngine && tradingEngine.isRunning) {
        health.checks.tradingEngine = {
          status: 'OK',
          isRunning: tradingEngine.isRunning,
          acceptingOrders: tradingEngine.acceptingOrders,
          queueSize: tradingEngine.orderQueue?.length || 0
        };
      } else {
        health.checks.tradingEngine = {
          status: 'ERROR',
          isRunning: false
        };
        health.status = 'ERROR';
      }
    } catch (error) {
      health.checks.tradingEngine = {
        status: 'ERROR',
        error: error.message
      };
      health.status = 'ERROR';
    }

    // Memory check
    const memoryUsage = process.memoryUsage();
    const memoryThreshold = 1024 * 1024 * 1024; // 1GB threshold
    
    health.checks.memory = {
      status: memoryUsage.heapUsed < memoryThreshold ? 'OK' : 'WARNING',
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers
    };

    if (memoryUsage.heapUsed >= memoryThreshold && health.status === 'OK') {
      health.status = 'WARNING';
    }

    // CPU check
    const cpuUsage = process.cpuUsage();
    health.checks.cpu = {
      status: 'OK',
      user: cpuUsage.user,
      system: cpuUsage.system
    };

    // Performance metrics
    health.metrics = {
      responseTime: Date.now() - startTime,
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    // Set appropriate HTTP status
    const statusCode = health.status === 'OK' ? 200 : 
                      health.status === 'WARNING' ? 200 : 
                      health.status === 'DEGRADED' ? 503 : 500;

    res.status(statusCode).json(health);

  } catch (error) {
    req.logger?.error('Health check error:', error);
    
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      service: 'trading-engine',
      error: error.message,
      responseTime: Date.now() - startTime
    });
  }
});

// Readiness probe (Kubernetes)
router.get('/ready', async (req, res) => {
  try {
    // Check if all critical components are ready
    const tradingEngine = req.app.get('tradingEngine');
    const dbReady = mongoose.connection.readyState === 1;
    const engineReady = tradingEngine && tradingEngine.isRunning;

    if (dbReady && engineReady) {
      res.status(200).json({
        status: 'READY',
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        status: 'NOT_READY',
        timestamp: new Date().toISOString(),
        checks: {
          database: dbReady,
          tradingEngine: engineReady
        }
      });
    }

  } catch (error) {
    res.status(503).json({
      status: 'NOT_READY',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Liveness probe (Kubernetes)
router.get('/live', (req, res) => {
  // Simple liveness check - if we can respond, we're alive
  res.status(200).json({
    status: 'ALIVE',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

module.exports = router;