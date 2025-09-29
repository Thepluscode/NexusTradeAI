const express = require('express');
const { query, param, validationResult } = require('express-validator');
const Position = require('../models/Position');
const router = express.Router();

// Get user positions
router.get('/', [
  query('active').optional().isBoolean(),
  query('symbol').optional().notEmpty()
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
    const { active = true, symbol } = req.query;

    const query = { userId };
    if (active !== undefined) query.isActive = active === 'true';
    if (symbol) query.symbol = symbol;

    const positions = await Position.find(query)
      .sort({ lastTradeAt: -1 })
      .lean();

    res.json({
      success: true,
      data: {
        positions,
        count: positions.length
      }
    });

  } catch (error) {
    req.logger?.error('Error getting positions:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get specific position
router.get('/:symbol', [
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
    const userId = req.query.userId || 'demo-user';

    const position = await Position.findOne({ 
      userId, 
      symbol,
      isActive: true 
    }).lean();

    if (!position) {
      return res.status(404).json({
        success: false,
        message: 'Position not found'
      });
    }

    res.json({
      success: true,
      data: position
    });

  } catch (error) {
    req.logger?.error('Error getting position:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get portfolio summary
router.get('/portfolio/summary', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';

    const summary = await Position.getPortfolioSummary(userId);

    if (!summary || summary.length === 0) {
      return res.json({
        success: true,
        data: {
          totalPositions: 0,
          totalMarketValue: 0,
          totalUnrealizedPnL: 0,
          totalRealizedPnL: 0,
          totalFees: 0,
          longPositions: 0,
          shortPositions: 0
        }
      });
    }

    res.json({
      success: true,
      data: summary[0]
    });

  } catch (error) {
    req.logger?.error('Error getting portfolio summary:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get performance metrics
router.get('/performance/metrics', [
  query('startDate').optional().isISO8601(),
  query('endDate').optional().isISO8601()
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
    const { startDate, endDate } = req.query;

    const start = startDate ? new Date(startDate) : null;
    const end = endDate ? new Date(endDate) : null;

    const metrics = await Position.getPerformanceMetrics(userId, start, end);

    if (!metrics || metrics.length === 0) {
      return res.json({
        success: true,
        data: {
          totalTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          winRate: 0,
          totalPnL: 0,
          avgPnL: 0,
          maxPnL: 0,
          minPnL: 0,
          profitFactor: null,
          totalFees: 0
        }
      });
    }

    res.json({
      success: true,
      data: metrics[0]
    });

  } catch (error) {
    req.logger?.error('Error getting performance metrics:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get position history
router.get('/:symbol/history', [
  param('symbol').notEmpty().withMessage('Symbol is required'),
  query('limit').optional().isInt({ min: 1, max: 1000 })
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
    const userId = req.query.userId || 'demo-user';
    const { limit = 100 } = req.query;

    const positions = await Position.find({ 
      userId, 
      symbol 
    })
    .sort({ updatedAt: -1 })
    .limit(parseInt(limit))
    .lean();

    res.json({
      success: true,
      data: {
        symbol,
        positions,
        count: positions.length
      }
    });

  } catch (error) {
    req.logger?.error('Error getting position history:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get P&L breakdown
router.get('/pnl/breakdown', [
  query('timeframe').optional().isIn(['today', 'week', 'month', 'year']),
  query('symbol').optional().notEmpty()
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    const { timeframe = 'today', symbol } = req.query;

    // Calculate date range based on timeframe
    const now = new Date();
    let startDate;

    switch (timeframe) {
      case 'today':
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    const query = { 
      userId,
      updatedAt: { $gte: startDate }
    };
    
    if (symbol) query.symbol = symbol;

    const positions = await Position.find(query).lean();

    const breakdown = {
      timeframe,
      symbol: symbol || 'all',
      realizedPnL: 0,
      unrealizedPnL: 0,
      totalPnL: 0,
      totalFees: 0,
      positionCount: positions.length,
      winners: 0,
      losers: 0,
      positions: positions.map(pos => ({
        symbol: pos.symbol,
        side: pos.side,
        quantity: parseFloat(pos.quantity),
        unrealizedPnL: parseFloat(pos.unrealizedPnL),
        realizedPnL: parseFloat(pos.realizedPnL),
        totalPnL: parseFloat(pos.totalPnL)
      }))
    };

    // Calculate totals
    positions.forEach(pos => {
      const realizedPnL = parseFloat(pos.realizedPnL || 0);
      const unrealizedPnL = parseFloat(pos.unrealizedPnL || 0);
      const totalPnL = parseFloat(pos.totalPnL || 0);
      const fees = parseFloat(pos.totalFees || 0);

      breakdown.realizedPnL += realizedPnL;
      breakdown.unrealizedPnL += unrealizedPnL;
      breakdown.totalPnL += totalPnL;
      breakdown.totalFees += fees;

      if (totalPnL > 0) breakdown.winners++;
      if (totalPnL < 0) breakdown.losers++;
    });

    res.json({
      success: true,
      data: breakdown
    });

  } catch (error) {
    req.logger?.error('Error getting P&L breakdown:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get exposure analysis
router.get('/exposure/analysis', async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';

    const positions = await Position.findActivePositions(userId);

    let totalLongExposure = 0;
    let totalShortExposure = 0;
    let totalNetExposure = 0;
    let totalGrossExposure = 0;
    
    const exposureBySymbol = {};
    const exposureBySide = { long: 0, short: 0 };

    positions.forEach(pos => {
      const marketValue = parseFloat(pos.marketValue || 0);
      const absMarketValue = Math.abs(marketValue);
      
      // Track by symbol
      if (!exposureBySymbol[pos.symbol]) {
        exposureBySymbol[pos.symbol] = {
          symbol: pos.symbol,
          marketValue: 0,
          side: pos.side,
          percentage: 0
        };
      }
      exposureBySymbol[pos.symbol].marketValue += marketValue;
      
      // Track by side
      if (pos.side === 'long') {
        totalLongExposure += absMarketValue;
        exposureBySide.long += absMarketValue;
      } else if (pos.side === 'short') {
        totalShortExposure += absMarketValue;
        exposureBySide.short += absMarketValue;
      }
      
      totalNetExposure += marketValue;
      totalGrossExposure += absMarketValue;
    });

    // Calculate percentages
    Object.values(exposureBySymbol).forEach(exposure => {
      exposure.percentage = totalGrossExposure > 0 ? 
        (Math.abs(exposure.marketValue) / totalGrossExposure) * 100 : 0;
    });

    const analysis = {
      totalLongExposure,
      totalShortExposure,
      totalNetExposure,
      totalGrossExposure,
      netExposureRatio: totalGrossExposure > 0 ? totalNetExposure / totalGrossExposure : 0,
      exposureBySymbol: Object.values(exposureBySymbol),
      exposureBySide,
      positionCount: positions.length
    };

    res.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    req.logger?.error('Error getting exposure analysis:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;