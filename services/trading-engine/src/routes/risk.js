const express = require('express');
const { query, param, validationResult } = require('express-validator');
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

// Get risk metrics for user
router.get('/metrics', getTradingEngine, [
  query('userId').optional().notEmpty()
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
    
    const riskMetrics = await req.tradingEngine.getRiskMetrics(userId);

    res.json({
      success: true,
      data: riskMetrics
    });

  } catch (error) {
    req.logger?.error('Error getting risk metrics:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get Value at Risk (VaR) calculation
router.get('/var', getTradingEngine, [
  query('userId').optional().notEmpty(),
  query('confidenceLevel').optional().isFloat({ min: 0.9, max: 0.999 }),
  query('timeHorizon').optional().isInt({ min: 1, max: 30 })
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
    const confidenceLevel = parseFloat(req.query.confidenceLevel) || 0.95;
    const timeHorizon = parseInt(req.query.timeHorizon) || 1;

    // Get positions for VaR calculation
    const positions = await req.tradingEngine.getPositions(userId);
    
    // Calculate VaR using risk calculator
    const riskCalculator = req.tradingEngine.riskCalculator;
    const var95 = await riskCalculator.calculateVaR(positions, confidenceLevel);
    
    const varResult = {
      userId,
      confidenceLevel,
      timeHorizon,
      var: var95.toString(),
      currency: 'USD',
      calculatedAt: new Date(),
      positionCount: positions.length
    };

    res.json({
      success: true,
      data: varResult
    });

  } catch (error) {
    req.logger?.error('Error calculating VaR:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get portfolio exposure
router.get('/exposure', getTradingEngine, [
  query('userId').optional().notEmpty()
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    
    const positions = await req.tradingEngine.getPositions(userId);
    
    let totalExposure = 0;
    let longExposure = 0;
    let shortExposure = 0;
    const exposureBySymbol = {};
    const exposureBySector = {};

    positions.forEach(position => {
      const marketValue = parseFloat(position.marketValue || 0);
      const absValue = Math.abs(marketValue);
      
      totalExposure += absValue;
      
      if (marketValue > 0) {
        longExposure += absValue;
      } else if (marketValue < 0) {
        shortExposure += absValue;
      }
      
      // By symbol
      exposureBySymbol[position.symbol] = {
        value: marketValue,
        percentage: 0 // Will calculate after total
      };
      
      // By sector (simplified - would use actual sector data)
      const sector = this.getSectorForSymbol(position.symbol);
      if (!exposureBySector[sector]) {
        exposureBySector[sector] = { value: 0, percentage: 0 };
      }
      exposureBySector[sector].value += absValue;
    });

    // Calculate percentages
    Object.keys(exposureBySymbol).forEach(symbol => {
      if (totalExposure > 0) {
        exposureBySymbol[symbol].percentage = 
          (Math.abs(exposureBySymbol[symbol].value) / totalExposure) * 100;
      }
    });

    Object.keys(exposureBySector).forEach(sector => {
      if (totalExposure > 0) {
        exposureBySector[sector].percentage = 
          (exposureBySector[sector].value / totalExposure) * 100;
      }
    });

    const exposureData = {
      userId,
      totalExposure,
      longExposure,
      shortExposure,
      netExposure: longExposure - shortExposure,
      exposureBySymbol,
      exposureBySector,
      leverage: totalExposure / Math.max(longExposure + shortExposure, 1),
      calculatedAt: new Date()
    };

    res.json({
      success: true,
      data: exposureData
    });

  } catch (error) {
    req.logger?.error('Error calculating exposure:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get margin status
router.get('/margin', getTradingEngine, [
  query('userId').optional().notEmpty()
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    
    const riskCalculator = req.tradingEngine.riskCalculator;
    const marginStatus = await riskCalculator.checkMarginStatus(userId);

    res.json({
      success: true,
      data: marginStatus
    });

  } catch (error) {
    req.logger?.error('Error getting margin status:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get stress test results
router.get('/stress-test', getTradingEngine, [
  query('userId').optional().notEmpty(),
  query('scenario').optional().isIn(['market_crash', 'volatility_spike', 'correlation_breakdown'])
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    const scenario = req.query.scenario || 'market_crash';
    
    const positions = await req.tradingEngine.getPositions(userId);
    
    // Simplified stress test scenarios
    let stressResults = {};
    
    switch (scenario) {
      case 'market_crash':
        stressResults = this.calculateMarketCrashScenario(positions);
        break;
      case 'volatility_spike':
        stressResults = this.calculateVolatilitySpikeScenario(positions);
        break;
      case 'correlation_breakdown':
        stressResults = this.calculateCorrelationBreakdownScenario(positions);
        break;
    }

    stressResults.scenario = scenario;
    stressResults.userId = userId;
    stressResults.calculatedAt = new Date();

    res.json({
      success: true,
      data: stressResults
    });

  } catch (error) {
    req.logger?.error('Error running stress test:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Get risk limits
router.get('/limits', getTradingEngine, [
  query('userId').optional().notEmpty()
], async (req, res) => {
  try {
    const userId = req.query.userId || 'demo-user';
    
    const riskCalculator = req.tradingEngine.riskCalculator;
    const userLimits = riskCalculator.getUserLimits(userId);

    res.json({
      success: true,
      data: {
        userId,
        limits: userLimits,
        lastUpdated: new Date()
      }
    });

  } catch (error) {
    req.logger?.error('Error getting risk limits:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Helper methods (would typically be in a separate utility class)
function getSectorForSymbol(symbol) {
  const sectorMap = {
    'AAPL': 'Technology',
    'GOOGL': 'Technology',
    'MSFT': 'Technology',
    'TSLA': 'Automotive',
    'JPM': 'Financial',
    'BTC': 'Cryptocurrency',
    'ETH': 'Cryptocurrency'
  };
  
  return sectorMap[symbol] || 'Other';
}

function calculateMarketCrashScenario(positions) {
  // Simulate 20% market decline
  let totalLoss = 0;
  const positionImpacts = [];
  
  positions.forEach(position => {
    const currentValue = parseFloat(position.marketValue || 0);
    const stressedValue = currentValue * 0.8; // 20% decline
    const impact = stressedValue - currentValue;
    
    totalLoss += impact;
    positionImpacts.push({
      symbol: position.symbol,
      currentValue,
      stressedValue,
      impact
    });
  });
  
  return {
    scenarioName: 'Market Crash (-20%)',
    totalImpact: totalLoss,
    positionImpacts,
    severity: totalLoss < -100000 ? 'high' : totalLoss < -50000 ? 'medium' : 'low'
  };
}

function calculateVolatilitySpikeScenario(positions) {
  // Simulate volatility spike affecting all positions
  let totalImpact = 0;
  const positionImpacts = [];
  
  positions.forEach(position => {
    const currentValue = parseFloat(position.marketValue || 0);
    // Assume 50% volatility increase affects value by 10%
    const volatilityImpact = Math.abs(currentValue) * 0.1;
    const impact = -volatilityImpact; // Negative impact
    
    totalImpact += impact;
    positionImpacts.push({
      symbol: position.symbol,
      currentValue,
      volatilityImpact,
      impact
    });
  });
  
  return {
    scenarioName: 'Volatility Spike (+50%)',
    totalImpact,
    positionImpacts,
    severity: totalImpact < -50000 ? 'high' : totalImpact < -25000 ? 'medium' : 'low'
  };
}

function calculateCorrelationBreakdownScenario(positions) {
  // Simulate correlation breakdown where hedged positions move in same direction
  let totalImpact = 0;
  const positionImpacts = [];
  
  positions.forEach(position => {
    const currentValue = parseFloat(position.marketValue || 0);
    // Assume correlation breakdown adds 15% additional risk
    const correlationImpact = Math.abs(currentValue) * 0.15;
    const impact = -correlationImpact;
    
    totalImpact += impact;
    positionImpacts.push({
      symbol: position.symbol,
      currentValue,
      correlationImpact,
      impact
    });
  });
  
  return {
    scenarioName: 'Correlation Breakdown',
    totalImpact,
    positionImpacts,
    severity: totalImpact < -75000 ? 'high' : totalImpact < -35000 ? 'medium' : 'low'
  };
}

module.exports = router;