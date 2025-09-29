// src/routes/positions.js
const express = require('express');
const { param, query, validationResult } = require('express-validator');
const router = express.Router();

// Get portfolio positions
router.get('/portfolio/:portfolioId', [
  param('portfolioId').isString().notEmpty(),
  query('status').optional().isIn(['open', 'closed']),
  query('symbol').optional().isString(),
  query('sortBy').optional().isString(),
  query('limit').optional().isInt({ min: 1, max: 1000 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { portfolioId } = req.params;
    const options = {
      status: req.query.status,
      symbol: req.query.symbol,
      sortBy: req.query.sortBy,
      limit: parseInt(req.query.limit) || undefined
    };
    
    const positionService = req.app.get('positionService');
    const positions = await positionService.getPortfolioPositions(portfolioId, options);
    
    res.json({
      success: true,
      data: positions
    });
    
  } catch (error) {
    req.logger.error('Error getting portfolio positions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get portfolio positions'
    });
  }
});

// Get user positions
router.get('/user/:userId', [
  param('userId').isString().notEmpty(),
  query('status').optional().isIn(['open', 'closed']),
  query('symbols').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { userId } = req.params;
    const options = {
      status: req.query.status,
      symbols: req.query.symbols
    };
    
    const positionService = req.app.get('positionService');
    const positions = await positionService.getUserPositions(userId, options);
    
    res.json({
      success: true,
      data: positions
    });
    
  } catch (error) {
    req.logger.error('Error getting user positions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user positions'
    });
  }
});

// Get specific position
router.get('/:positionId', [
  param('positionId').isString().notEmpty()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { positionId } = req.params;
    
    const positionService = req.app.get('positionService');
    const position = await positionService.getPosition(positionId);
    
    res.json({
      success: true,
      data: position
    });
    
  } catch (error) {
    req.logger.error('Error getting position:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get position'
    });
  }
});

// Get position performance
router.get('/:positionId/performance', [
  param('positionId').isString().notEmpty(),
  query('timeframe').optional().isIn(['1d', '1w', '1m', '3m', '6m', '1y'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const { positionId } = req.params;
    const timeframe = req.query.timeframe || '1d';
    
    const positionService = req.app.get('positionService');
    const performance = await positionService.getPositionPerformance(positionId, timeframe);
    
    res.json({
      success: true,
      data: performance
    });
    
  } catch (error) {
    req.logger.error('Error getting position performance:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get position performance'
    });
  }
});

module.exports = router;