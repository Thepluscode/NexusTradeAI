const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

/**
 * @route   POST /api/ai/multi-agent-predictions
 * @desc    Get predictions from multiple AI agents
 * @access  Private
 */
router.post('/multi-agent-predictions', [
  body('portfolioId').isString().notEmpty(),
  body('timeHorizon').optional().isInt({ min: 1, max: 365 }),
  body('agents').optional().isArray(),
  body('marketData').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const result = await aiController.getMultiAgentPredictions(req.body);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    req.logger.error('Error in multi-agent predictions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get multi-agent predictions',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

/**
 * @route   POST /api/ai/quantum-optimization
 * @desc    Optimize portfolio using quantum algorithms
 * @access  Private
 */
router.post('/quantum-optimization', [
  body('portfolioId').isString().notEmpty(),
  body('constraints').isObject(),
  body('optimizationGoals').isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  try {
    const result = await aiController.optimizeWithQuantum(req.body);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    req.logger.error('Error in quantum optimization:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform quantum optimization',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;
