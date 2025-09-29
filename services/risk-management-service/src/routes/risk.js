// src/routes/risk.js
const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const router = express.Router();

// Comprehensive risk analysis endpoint
router.post('/comprehensive-analysis', [
  body('portfolioId').isString().notEmpty(),
  body('confidenceLevels').optional().isArray(),
  body('methods').optional().isArray(),
  body('scenarios').optional().isArray(),
  body('includeStressTests').optional().isBoolean(),
  body('includeSensitivityAnalysis').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array()
      });
    }

    const {
      portfolioId,
      confidenceLevels = [0.95, 0.99],
      methods = ['parametric', 'historical', 'monte_carlo'],
      scenarios = ['market_crash', 'rate_hike', 'liquidity_crunch'],
      includeStressTests = true,
      includeSensitivityAnalysis = true
    } = req.body;

    const riskCalculationService = req.app.get('riskCalculationService');
    
    // Get portfolio data
    const portfolioData = await riskCalculationService.getPortfolioData(portfolioId);
    if (!portfolioData) {
      return res.status(404).json({
        success: false,
        message: 'Portfolio not found'
      });
    }

    // Calculate risk metrics
    const riskMetrics = {
      portfolioId,
      asOf: new Date().toISOString(),
      valueAtRisk: {},
      expectedShortfall: {},
      stressTestResults: {},
      sensitivityAnalysis: {}
    };

    // Calculate VaR for each confidence level and method
    for (const confidence of confidenceLevels) {
      for (const method of methods) {
        const varResult = await riskCalculationService.calculateVaR(portfolioData.positions, {
          confidenceLevel: confidence,
          method,
          timeHorizon: 1
        });
        
        if (!riskMetrics.valueAtRisk[method]) {
          riskMetrics.valueAtRisk[method] = {};
          riskMetrics.expectedShortfall[method] = {};
        }
        
        riskMetrics.valueAtRisk[method][confidence] = varResult.var;
        riskMetrics.expectedShortfall[method][confidence] = varResult.expectedShortfall;
      }
    }

    // Run stress tests if requested
    if (includeStressTests) {
      for (const scenario of scenarios) {
        const stressResult = await riskCalculationService.runStressTest(portfolioData.positions, {
          scenario,
          timeHorizon: 10 // 10 days
        });
        riskMetrics.stressTestResults[scenario] = stressResult;
      }
    }

    // Run sensitivity analysis if requested
    if (includeSensitivityAnalysis) {
      riskMetrics.sensitivityAnalysis = await riskCalculationService.analyzeSensitivities(portfolioData.positions);
    }

    res.json({
      success: true,
      data: riskMetrics
    });

  } catch (error) {
    req.logger.error('Error in comprehensive risk analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to perform comprehensive risk analysis',
      error: error.message
    });
  }
});


// Get comprehensive risk metrics for a portfolio
router.get('/portfolio/:portfolioId/comprehensive', [
  param('portfolioId').isString().notEmpty(),
  query('confidenceLevels').optional().isArray(),
  query('methods').optional().isArray(),
  query('scenarios').optional().isArray()
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
      confidenceLevels: req.query.confidenceLevels,
      methods: req.query.methods,
      scenarios: req.query.scenarios
    };
    
    const riskCalculationService = req.app.get('riskCalculationService');
    const riskMetrics = await riskCalculationService.calculateComprehensiveRisk(portfolioId, options);
    
    res.json({
      success: true,
      data: riskMetrics
    });
    
  } catch (error) {
    req.logger.error('Error getting comprehensive risk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate comprehensive risk'
    });
  }
});

// Calculate VaR for a portfolio
router.post('/portfolio/:portfolioId/var', [
  param('portfolioId').isString().notEmpty(),
  body('confidenceLevel').optional().isFloat({ min: 0.5, max: 0.999 }),
  body('method').optional().isIn(['parametric', 'historical', 'monte_carlo']),
  body('timeHorizon').optional().isInt({ min: 1, max: 365 })
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
      confidenceLevel: req.body.confidenceLevel || 0.95,
      method: req.body.method || 'parametric',
      timeHorizon: req.body.timeHorizon || 1
    };
    
    const riskCalculationService = req.app.get('riskCalculationService');
    const portfolioData = await riskCalculationService.getPortfolioData(portfolioId);
    
    const varCalculator = riskCalculationService.varCalculator;
    const varResult = await varCalculator.calculatePortfolioVaR(portfolioData.positions, options);
    
    res.json({
      success: true,
      data: varResult
    });
    
  } catch (error) {
    req.logger.error('Error calculating VaR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate VaR'
    });
  }
});

// Run stress tests
router.post('/portfolio/:portfolioId/stress-test', [
  param('portfolioId').isString().notEmpty(),
  body('scenario').optional().isString(),
  body('customShocks').optional().isObject()
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
    const { scenario, customShocks } = req.body;
    
    const riskCalculationService = req.app.get('riskCalculationService');
    const portfolioData = await riskCalculationService.getPortfolioData(portfolioId);
    
    const stressTestCalculator = riskCalculationService.stressTestCalculator;
    const stressResult = await stressTestCalculator.runStressTest(
      portfolioData.positions,
      scenario || 'market_crash',
      customShocks
    );
    
    res.json({
      success: true,
      data: stressResult
    });
    
  } catch (error) {
    req.logger.error('Error running stress test:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to run stress test'
    });
  }
});

// Get available stress test scenarios
router.get('/stress-test/scenarios', async (req, res) => {
  try {
    const riskCalculationService = req.app.get('riskCalculationService');
    const scenarios = riskCalculationService.stressTestCalculator.getAvailableScenarios();
    
    res.json({
      success: true,
      data: scenarios
    });
    
  } catch (error) {
    req.logger.error('Error getting scenarios:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get stress test scenarios'
    });
  }
});

// Calculate liquidity risk
router.get('/portfolio/:portfolioId/liquidity', [
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
    
    const riskCalculationService = req.app.get('riskCalculationService');
    const portfolioData = await riskCalculationService.getPortfolioData(portfolioId);
    
    const liquidityResult = await riskCalculationService.liquidityRiskCalculator
      .calculatePortfolioLiquidityRisk(portfolioData.positions);
    
    res.json({
      success: true,
      data: liquidityResult
    });
    
  } catch (error) {
    req.logger.error('Error calculating liquidity risk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate liquidity risk'
    });
  }
});

// Calculate counterparty risk
router.get('/portfolio/:portfolioId/counterparty', [
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
    
    const riskCalculationService = req.app.get('riskCalculationService');
    const portfolioData = await riskCalculationService.getPortfolioData(portfolioId);
    
    if (!portfolioData.exposures || portfolioData.exposures.length === 0) {
      return res.json({
        success: true,
        data: { message: 'No counterparty exposures found' }
      });
    }
    
    const counterpartyResult = await riskCalculationService.counterpartyRiskCalculator
      .calculateCounterpartyRisk(portfolioData.exposures);
    
    res.json({
      success: true,
      data: counterpartyResult
    });
    
  } catch (error) {
    req.logger.error('Error calculating counterparty risk:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate counterparty risk'
    });
  }
});

// Get real-time risk monitoring status
router.get('/monitoring/status', async (req, res) => {
  try {
    const riskMonitorService = req.app.get('riskMonitorService');
    const status = riskMonitorService.getStatus();
    
    res.json({
      success: true,
      data: status
    });
    
  } catch (error) {
    req.logger.error('Error getting monitoring status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get monitoring status'
    });
  }
});

module.exports = router;