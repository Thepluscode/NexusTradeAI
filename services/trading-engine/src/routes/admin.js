const express = require('express');
const { body, query, validationResult } = require('express-validator');
const router = express.Router();

// Admin authentication middleware (simplified)
const adminAuth = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  
  if (token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized - Admin access required'
    });
  }
  
  next();
};

// Middleware to get trading engine
const getTradingEngine = (req, res, next) => {
  req.tradingEngine = req.app.get('tradingEngine');
  if (!req.tradingEngine) {
    return res.status(503).json({
      success: false,
      message: 'Trading engine not available'
    });
  }
  next();
};

// Apply admin auth to all routes
router.use(adminAuth);

// Get comprehensive system status
router.get('/status', getTradingEngine, (req, res) => {
  try {
    const status = req.tradingEngine.getStatus();
    
    const systemStatus = {
      ...status,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      timestamp: new Date()
    };

    res.json({
      success: true,
      data: systemStatus
    });

  } catch (error) {
    req.logger?.error('Error getting system status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Emergency stop trading
router.post('/emergency-stop', getTradingEngine, async (req, res) => {
  try {
    req.logger?.warn('Emergency stop initiated by admin');
    
    await req.tradingEngine.stopAcceptingOrders();
    
    res.json({
      success: true,
      message: 'Emergency stop activated - no new orders will be accepted',
      timestamp: new Date()
    });

  } catch (error) {
    req.logger?.error('Error during emergency stop:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Resume trading
router.post('/resume-trading', getTradingEngine, async (req, res) => {
  try {
    req.logger?.info('Trading resumed by admin');
    
    req.tradingEngine.acceptingOrders = true;
    
    res.json({
      success: true,
      message: 'Trading resumed - accepting new orders',
      timestamp: new Date()
    });

  } catch (error) {
    req.logger?.error('Error resuming trading:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get order queue status
router.get('/queue-status', getTradingEngine, (req, res) => {
  try {
    const queueStatus = {
      queueSize: req.tradingEngine.orderQueue?.length || 0,
      maxQueueSize: req.tradingEngine.maxQueueSize || 0,
      processingOrders: req.tradingEngine.processingOrders || false,
      acceptingOrders: req.tradingEngine.acceptingOrders || false
    };

    res.json({
      success: true,
      data: queueStatus
    });

  } catch (error) {
    req.logger?.error('Error getting queue status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get component health
router.get('/components', getTradingEngine, (req, res) => {
  try {
    const components = {
      orderManager: req.tradingEngine.orderManager?.getStatus() || { error: 'Not available' },
      matchingEngine: req.tradingEngine.matchingEngine?.getStatus() || { error: 'Not available' },
      riskCalculator: req.tradingEngine.riskCalculator?.getStatus() || { error: 'Not available' },
      positionManager: req.tradingEngine.positionManager?.getStatus() || { error: 'Not available' },
      complianceChecker: req.tradingEngine.complianceChecker?.getStatus() || { error: 'Not available' },
      smartOrderRouter: req.tradingEngine.smartOrderRouter?.getStatus() || { error: 'Not available' },
      slippageOptimizer: req.tradingEngine.slippageOptimizer?.getStatus() || { error: 'Not available' }
    };

    res.json({
      success: true,
      data: components
    });

  } catch (error) {
    req.logger?.error('Error getting component status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Reset circuit breaker
router.post('/reset-circuit-breaker', getTradingEngine, (req, res) => {
  try {
    req.tradingEngine.resetCircuitBreaker();
    
    res.json({
      success: true,
      message: 'Circuit breaker reset successfully',
      timestamp: new Date()
    });

  } catch (error) {
    req.logger?.error('Error resetting circuit breaker:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get performance metrics
router.get('/performance', getTradingEngine, (req, res) => {
  try {
    const performance = {
      orderProcessingRate: 0, // Orders per second
      averageLatency: 0, // Average order processing time
      errorRate: 0, // Percentage of failed orders
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime()
    };

    // Get metrics from trading engine if available
    if (req.tradingEngine.stats) {
      performance.orderProcessingRate = req.tradingEngine.stats.ordersPerSecond || 0;
      performance.averageLatency = req.tradingEngine.stats.averageLatency || 0;
      performance.errorRate = req.tradingEngine.stats.errorRate || 0;
    }

    res.json({
      success: true,
      data: performance
    });

  } catch (error) {
    req.logger?.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Update risk limits for user
router.put('/risk-limits/:userId', getTradingEngine, [
  body('maxPositionValue').optional().isFloat({ gt: 0 }),
  body('maxOrderValue').optional().isFloat({ gt: 0 }),
  body('maxLeverage').optional().isFloat({ gt: 0 }),
  body('maxVaR').optional().isFloat({ gt: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const updates = req.body;

    // Update user limits in risk calculator
    const riskCalculator = req.tradingEngine.riskCalculator;
    const currentLimits = riskCalculator.getUserLimits(userId);
    const newLimits = { ...currentLimits, ...updates };
    
    riskCalculator.userLimits.set(userId, newLimits);

    req.logger?.info(`Risk limits updated for user ${userId}`, updates);

    res.json({
      success: true,
      message: 'Risk limits updated successfully',
      data: {
        userId,
        previousLimits: currentLimits,
        newLimits,
        updatedAt: new Date()
      }
    });

  } catch (error) {
    req.logger?.error('Error updating risk limits:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Cancel all orders for a user
router.post('/cancel-user-orders/:userId', getTradingEngine, async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason = 'admin_cancellation' } = req.body;

    const cancelledOrders = await req.tradingEngine.orderManager.cancelUserOrders(userId);

    req.logger?.warn(`Admin cancelled all orders for user ${userId}`, {
      orderCount: cancelledOrders.length,
      reason
    });

    res.json({
      success: true,
      message: `Cancelled ${cancelledOrders.length} orders for user ${userId}`,
      data: {
        userId,
        cancelledOrderIds: cancelledOrders,
        reason,
        timestamp: new Date()
      }
    });

  } catch (error) {
    req.logger?.error('Error cancelling user orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Suspend user trading
router.post('/suspend-user/:userId', getTradingEngine, [
  body('reason').notEmpty().withMessage('Reason is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { userId } = req.params;
    const { reason } = req.body;

    // Suspend user in compliance checker
    await req.tradingEngine.complianceChecker.suspendUser(userId, reason);

    // Cancel all active orders
    const cancelledOrders = await req.tradingEngine.orderManager.cancelUserOrders(userId);

    req.logger?.warn(`User ${userId} suspended by admin`, {
      reason,
      cancelledOrders: cancelledOrders.length
    });

    res.json({
      success: true,
      message: `User ${userId} suspended successfully`,
      data: {
        userId,
        reason,
        cancelledOrders: cancelledOrders.length,
        suspendedAt: new Date()
      }
    });

  } catch (error) {
    req.logger?.error('Error suspending user:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get system logs
router.get('/logs', [
  query('level').optional().isIn(['error', 'warn', 'info', 'debug']),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('since').optional().isISO8601()
], (req, res) => {
  try {
    const { level = 'info', limit = 100, since } = req.query;

    // This would typically read from log files or log aggregation service
    // For demo purposes, return mock data
    const logs = [
      {
        timestamp: new Date(),
        level: 'info',
        message: 'Trading engine operating normally',
        component: 'trading-engine'
      },
      {
        timestamp: new Date(Date.now() - 60000),
        level: 'warn',
        message: 'High order volume detected',
        component: 'order-manager'
      }
    ];

    res.json({
      success: true,
      data: {
        logs,
        filters: { level, limit, since },
        count: logs.length
      }
    });

  } catch (error) {
    req.logger?.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Force garbage collection (be careful with this)
router.post('/gc', (req, res) => {
  try {
    if (global.gc) {
      const beforeMemory = process.memoryUsage();
      global.gc();
      const afterMemory = process.memoryUsage();
      
      res.json({
        success: true,
        message: 'Garbage collection completed',
        data: {
          beforeMemory,
          afterMemory,
          freed: beforeMemory.heapUsed - afterMemory.heapUsed
        }
      });
    } else {
      res.status(501).json({
        success: false,
        message: 'Garbage collection not available (start with --expose-gc)'
      });
    }

  } catch (error) {
    req.logger?.error('Error during garbage collection:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;