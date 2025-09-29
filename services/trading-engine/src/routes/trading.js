const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

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

// Validation middleware
const validateOrder = [
  body('symbol').notEmpty().withMessage('Symbol is required'),
  body('side').isIn(['buy', 'sell']).withMessage('Side must be buy or sell'),
  body('type').isIn(['market', 'limit', 'stop', 'stop_limit']).withMessage('Invalid order type'),
  body('quantity').isFloat({ gt: 0 }).withMessage('Quantity must be positive'),
  body('price').optional().isFloat({ gt: 0 }).withMessage('Price must be positive'),
  body('stopPrice').optional().isFloat({ gt: 0 }).withMessage('Stop price must be positive'),
  body('timeInForce').optional().isIn(['GTC', 'IOC', 'FOK', 'DAY']).withMessage('Invalid time in force'),
];

// Submit new order
router.post('/orders', getTradingEngine, validateOrder, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const orderData = {
      ...req.body,
      userId: req.body.userId || 'demo-user', // In production, get from auth
      source: 'api'
    };

    const result = await req.tradingEngine.submitOrder(orderData);

    res.status(201).json({
      success: true,
      message: 'Order submitted successfully',
      data: result
    });

  } catch (error) {
    req.logger?.error('Error submitting order:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Cancel order
router.delete('/orders/:orderId', getTradingEngine, [
  param('orderId').notEmpty().withMessage('Order ID is required')
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

    const { orderId } = req.params;
    const userId = req.body.userId || 'demo-user'; // In production, get from auth

    const result = await req.tradingEngine.cancelOrder(orderId, userId);

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      data: result
    });

  } catch (error) {
    req.logger?.error('Error cancelling order:', error);
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
});

// Get order book
router.get('/orderbook/:symbol', getTradingEngine, [
  param('symbol').notEmpty().withMessage('Symbol is required'),
  query('depth').optional().isInt({ min: 1, max: 100 }).withMessage('Depth must be between 1 and 100')
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

    const { symbol } = req.params;
    const depth = parseInt(req.query.depth) || 20;

    const orderBook = await req.tradingEngine.getOrderBook(symbol, depth);

    res.json({
      success: true,
      data: orderBook
    });

  } catch (error) {
    req.logger?.error('Error getting order book:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get trading engine status
router.get('/status', getTradingEngine, (req, res) => {
  try {
    const status = req.tradingEngine.getStatus();

    res.json({
      success: true,
      data: status
    });

  } catch (error) {
    req.logger?.error('Error getting trading status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Batch order submission
router.post('/orders/batch', getTradingEngine, [
  body('orders').isArray({ min: 1, max: 100 }).withMessage('Orders must be an array with 1-100 items'),
  body('orders.*.symbol').notEmpty().withMessage('Symbol is required for all orders'),
  body('orders.*.side').isIn(['buy', 'sell']).withMessage('Side must be buy or sell for all orders'),
  body('orders.*.type').isIn(['market', 'limit', 'stop', 'stop_limit']).withMessage('Invalid order type'),
  body('orders.*.quantity').isFloat({ gt: 0 }).withMessage('Quantity must be positive for all orders')
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

    const { orders } = req.body;
    const userId = req.body.userId || 'demo-user';
    const results = [];

    // Process orders sequentially to maintain order
    for (const orderData of orders) {
      try {
        const result = await req.tradingEngine.submitOrder({
          ...orderData,
          userId,
          source: 'api_batch'
        });
        results.push({ success: true, data: result });
      } catch (error) {
        results.push({ 
          success: false, 
          error: error.message,
          orderData: { symbol: orderData.symbol, side: orderData.side }
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    res.json({
      success: failureCount === 0,
      message: `Batch processed: ${successCount} successful, ${failureCount} failed`,
      data: {
        results,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failureCount
        }
      }
    });

  } catch (error) {
    req.logger?.error('Error processing batch orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get market summary
router.get('/market/:symbol', [
  param('symbol').notEmpty().withMessage('Symbol is required')
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

    const { symbol } = req.params;
    
    // This would typically aggregate data from various sources
    const marketSummary = {
      symbol,
      lastPrice: 100.50,
      change: 2.50,
      changePercent: 2.55,
      volume: 1250000,
      high: 102.75,
      low: 98.25,
      open: 98.50,
      previousClose: 98.00,
      timestamp: new Date().toISOString()
    };

    res.json({
      success: true,
      data: marketSummary
    });

  } catch (error) {
    req.logger?.error('Error getting market summary:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Error handling middleware
router.use((error, req, res, next) => {
  req.logger?.error('Trading route error:', error);
  
  res.status(500).json({
    success: false,
    message: 'Internal trading engine error',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;