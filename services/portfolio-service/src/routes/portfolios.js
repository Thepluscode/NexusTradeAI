// src/routes/portfolios.js
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

// Get user portfolios
router.get('/user/:userId', [
  param('userId').isString().notEmpty(),
  query('status').optional().isIn(['active', 'inactive', 'closed']),
  query('includePositions').optional().isBoolean(),
  query('limit').optional().isInt({ min: 1, max: 100 })
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
      includePositions: req.query.includePositions === 'true',
      limit: parseInt(req.query.limit) || undefined
    };
    
    const portfolioService = req.app.get('portfolioService');
    const portfolios = await portfolioService.getUserPortfolios(userId, options);
    
    res.json({
      success: true,
      data: portfolios
    });
    
  } catch (error) {
    req.logger.error('Error getting user portfolios:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user portfolios'
    });
  }
});

// Get specific portfolio
router.get('/:portfolioId', [
  param('portfolioId').isString().notEmpty(),
  query('includePositions').optional().isBoolean(),
  query('includePerformance').optional().isBoolean()
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
      includePositions: req.query.includePositions === 'true',
      includePerformance: req.query.includePerformance === 'true'
    };
    
    const portfolioService = req.app.get('portfolioService');
    const portfolio = await portfolioService.getPortfolio(portfolioId, options);
    
    res.json({
      success: true,
      data: portfolio
    });
    
  } catch (error) {
    req.logger.error('Error getting portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get portfolio'
    });
  }
});

// Create new portfolio
router.post('/', [
  body('userId').isString().notEmpty(),
  body('name').isString().isLength({ min: 1, max: 100 }),
  body('description').optional().isString().isLength({ max: 500 }),
  body('type').optional().isIn(['individual', 'joint', 'corporate', 'trust', 'retirement']),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }),
  body('riskProfile').optional().isIn(['conservative', 'moderate', 'aggressive', 'speculative']),
  body('initialCash').optional().isNumeric({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }
    
    const portfolioService = req.app.get('portfolioService');
    const portfolio = await portfolioService.createPortfolio(req.body);
    
    res.status(201).json({
      success: true,
      data: portfolio
    });
    
  } catch (error) {
    req.logger.error('Error creating portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create portfolio'
    });
  }
});

// Update portfolio
router.put('/:portfolioId', [
  param('portfolioId').isString().notEmpty(),
  body('name').optional().isString().isLength({ min: 1, max: 100 }),
  body('description').optional().isString().isLength({ max: 500 }),
  body('riskProfile').optional().isIn(['conservative', 'moderate', 'aggressive', 'speculative']),
  body('benchmarkIndex').optional().isString()
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
    
    const portfolioService = req.app.get('portfolioService');
    const portfolio = await portfolioService.updatePortfolio(portfolioId, req.body);
    
    res.json({
      success: true,
      data: portfolio
    });
    
  } catch (error) {
    req.logger.error('Error updating portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update portfolio'
    });
  }
});

// Get portfolio valuation
router.get('/:portfolioId/valuation', [
  param('portfolioId').isString().notEmpty()
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
    
    const portfolioService = req.app.get('portfolioService');
    const valuation = await portfolioService.calculatePortfolioValue(portfolioId);
    
    res.json({
      success: true,
      data: valuation
    });
    
  } catch (error) {
    req.logger.error('Error getting portfolio valuation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get portfolio valuation'
    });
  }
});

// Rebalance portfolio
router.post('/:portfolioId/rebalance', [
  param('portfolioId').isString().notEmpty(),
  body('targetAllocations').isObject().notEmpty()
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
    const { targetAllocations } = req.body;
    
    const portfolioService = req.app.get('portfolioService');
    const rebalancingPlan = await portfolioService.rebalancePortfolio(portfolioId, targetAllocations);
    
    res.json({
      success: true,
      data: rebalancingPlan
    });
    
  } catch (error) {
    req.logger.error('Error rebalancing portfolio:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rebalance portfolio'
    });
  }
});

module.exports = router;