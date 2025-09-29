const express = require('express');
const { param, query, validationResult } = require('express-validator');
const Order = require('../models/Order');
const router = express.Router();

// Get user orders
router.get('/', [
  query('status').optional().isIn(['pending', 'partial', 'filled', 'cancelled', 'rejected', 'expired']),
  query('symbol').optional().notEmpty(),
  query('limit').optional().isInt({ min: 1, max: 1000 }),
  query('offset').optional().isInt({ min: 0 })
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

    const userId = req.query.userId || 'demo-user'; // In production, get from auth
    const { status, symbol, limit = 50, offset = 0 } = req.query;

    const query = { userId };
    if (status) query.status = status;
    if (symbol) query.symbol = symbol;

    const orders = await Order.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .lean();

    const totalCount = await Order.countDocuments(query);

    res.json({
      success: true,
      data: {
        orders,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: totalCount,
          hasMore: offset + orders.length < totalCount
        }
      }
    });

  } catch (error) {
    req.logger?.error('Error getting orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get specific order
router.get('/:orderId', [
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
    const userId = req.query.userId || 'demo-user'; // In production, get from auth

    const order = await Order.findOne({ 
      id: orderId,
      userId 
    }).lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: order
    });

  } catch (error) {
    req.logger?.error('Error getting order:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get order history with fills
router.get('/:orderId/fills', [
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
    const userId = req.query.userId || 'demo-user';

    const order = await Order.findOne({ 
      id: orderId,
      userId 
    }).select('id symbol side fills createdAt status').lean();

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.json({
      success: true,
      data: {
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        status: order.status,
        fills: order.fills || [],
        fillCount: order.fills?.length || 0
      }
    });

  } catch (error) {
    req.logger?.error('Error getting order fills:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get active orders
router.get('/active/all', [
  query('symbol').optional().notEmpty()
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    const { symbol } = req.query;

    const orders = await Order.findActiveOrders(userId, symbol);

    res.json({
      success: true,
      data: {
        orders,
        count: orders.length
      }
    });

  } catch (error) {
    req.logger?.error('Error getting active orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get order statistics
router.get('/stats/summary', [
  query('timeframe').optional().isIn(['1h', '24h', '7d', '30d']),
  query('symbol').optional().notEmpty()
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    const { timeframe = '24h', symbol } = req.query;

    let stats;
    if (symbol) {
      // Get stats for specific symbol
      const now = new Date();
      let startDate;
      
      switch (timeframe) {
        case '1h':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '24h':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const orders = await Order.findOrdersByDateRange(userId, startDate, now);
      const symbolOrders = orders.filter(order => order.symbol === symbol);
      
      stats = {
        totalOrders: symbolOrders.length,
        filledOrders: symbolOrders.filter(o => o.status === 'filled').length,
        cancelledOrders: symbolOrders.filter(o => o.status === 'cancelled').length,
        avgOrderSize: symbolOrders.length > 0 ? 
          symbolOrders.reduce((sum, o) => sum + parseFloat(o.quantity), 0) / symbolOrders.length : 0
      };
    } else {
      // Get overall stats
      stats = await Order.getOrderStats(userId, timeframe);
    }

    res.json({
      success: true,
      data: {
        timeframe,
        symbol: symbol || 'all',
        stats
      }
    });

  } catch (error) {
    req.logger?.error('Error getting order stats:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Search orders
router.get('/search/query', [
  query('q').notEmpty().withMessage('Search query is required'),
  query('limit').optional().isInt({ min: 1, max: 100 })
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

    const userId = req.query.userId || 'demo-user';
    const { q, limit = 20 } = req.query;

    // Search in symbol, client order ID, and order ID
    const searchRegex = new RegExp(q, 'i');
    
    const orders = await Order.find({
      userId,
      $or: [
        { symbol: searchRegex },
        { clientOrderId: searchRegex },
        { id: searchRegex }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .lean();

    res.json({
      success: true,
      data: {
        query: q,
        orders,
        count: orders.length
      }
    });

  } catch (error) {
    req.logger?.error('Error searching orders:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;