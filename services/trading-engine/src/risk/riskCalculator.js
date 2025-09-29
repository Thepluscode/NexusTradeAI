const EventEmitter = require('events');
const Decimal = require('decimal.js');

class RiskCalculator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.limits = options.limits || this.getDefaultLimits();
    this.userLimits = new Map(); // userId -> custom limits
    this.isInitialized = false;
    
    // Risk calculation settings
    this.varConfidenceLevel = 0.95; // 95% VaR
    this.riskHorizon = 1; // 1 day
    this.correlationWindow = 30; // 30 days for correlation calculation
    
    // Cache for performance
    this.riskCache = new Map();
    this.cacheExpiry = 60000; // 1 minute cache
  }

  async initialize() {
    try {
      this.logger?.info('Initializing RiskCalculator...');
      
      // Load user limits from database if needed
      await this.loadUserLimits();
      
      this.isInitialized = true;
      this.logger?.info('RiskCalculator initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize RiskCalculator:', error);
      throw error;
    }
  }

  getDefaultLimits() {
    return {
      maxPositionValue: 1000000,    // $1M
      maxDailyLoss: 100000,         // $100K
      maxLeverage: 10,              // 10:1
      maxOrderValue: 50000,         // $50K per order
      maxConcentration: 0.25,       // 25% of portfolio in single position
      maxVaR: 50000,                // $50K daily VaR
      marginRequirement: 0.1,       // 10% initial margin
      maintenanceMargin: 0.05,      // 5% maintenance margin
      liquidationThreshold: 0.03    // 3% liquidation threshold
    };
  }

  async loadUserLimits() {
    // This would typically load from database
    // For now, set some example user limits
    this.userLimits.set('user1', {
      ...this.limits,
      maxPositionValue: 500000,
      maxOrderValue: 25000
    });
  }

  async preTradeRiskCheck(order) {
    const startTime = Date.now();
    
    try {
      const userId = order.userId;
      const userLimits = this.getUserLimits(userId);
      
      // Order value check
      const orderValue = new Decimal(order.quantity).times(order.price || await this.getEstimatedPrice(order.symbol));
      
      if (orderValue.gt(userLimits.maxOrderValue)) {
        return {
          approved: false,
          reason: `Order value ${orderValue} exceeds maximum limit ${userLimits.maxOrderValue}`,
          riskScore: 100
        };
      }
      
      // Position size check
      const currentPosition = await this.getCurrentPosition(userId, order.symbol);
      const newPositionSize = this.calculateNewPositionSize(currentPosition, order);
      const newPositionValue = newPositionSize.abs().times(order.price || await this.getEstimatedPrice(order.symbol));
      
      if (newPositionValue.gt(userLimits.maxPositionValue)) {
        return {
          approved: false,
          reason: `New position value ${newPositionValue} exceeds maximum limit ${userLimits.maxPositionValue}`,
          riskScore: 95
        };
      }
      
      // Leverage check
      const portfolioValue = await this.getPortfolioValue(userId);
      const totalExposure = await this.getTotalExposure(userId);
      const newExposure = totalExposure.plus(orderValue);
      const newLeverage = portfolioValue.gt(0) ? newExposure.dividedBy(portfolioValue) : new Decimal(0);
      
      if (newLeverage.gt(userLimits.maxLeverage)) {
        return {
          approved: false,
          reason: `New leverage ${newLeverage.toFixed(2)} exceeds maximum ${userLimits.maxLeverage}`,
          riskScore: 90
        };
      }
      
      // Concentration check
      const portfolioConcentration = portfolioValue.gt(0) ? newPositionValue.dividedBy(portfolioValue) : new Decimal(0);
      
      if (portfolioConcentration.gt(userLimits.maxConcentration)) {
        return {
          approved: false,
          reason: `Position concentration ${portfolioConcentration.times(100).toFixed(2)}% exceeds maximum ${userLimits.maxConcentration * 100}%`,
          riskScore: 85
        };
      }
      
      // VaR check
      const portfolioVaR = await this.calculatePortfolioVaR(userId, order);
      
      if (portfolioVaR.gt(userLimits.maxVaR)) {
        return {
          approved: false,
          reason: `Portfolio VaR ${portfolioVaR} exceeds maximum ${userLimits.maxVaR}`,
          riskScore: 80
        };
      }
      
      // Calculate overall risk score
      const riskScore = this.calculateRiskScore({
        orderValue,
        positionValue: newPositionValue,
        leverage: newLeverage,
        concentration: portfolioConcentration,
        var: portfolioVaR
      }, userLimits);
      
      const checkTime = Date.now() - startTime;
      this.logger?.debug(`Pre-trade risk check completed in ${checkTime}ms`, {
        userId,
        orderId: order.id,
        riskScore,
        approved: true
      });
      
      return {
        approved: true,
        riskScore,
        checkDetails: {
          orderValue: orderValue.toString(),
          newPositionValue: newPositionValue.toString(),
          leverage: newLeverage.toFixed(2),
          concentration: portfolioConcentration.times(100).toFixed(2) + '%',
          var: portfolioVaR.toString()
        }
      };
      
    } catch (error) {
      this.logger?.error('Error in pre-trade risk check:', error);
      return {
        approved: false,
        reason: 'Risk check failed due to system error',
        riskScore: 100
      };
    }
  }

  async postTradeRiskCheck(order, fills) {
    try {
      const userId = order.userId;
      
      // Update risk metrics after trade execution
      const updatedMetrics = await this.calculateRiskMetrics(userId);
      
      // Check for risk limit breaches
      const breaches = this.checkRiskBreaches(updatedMetrics, this.getUserLimits(userId));
      
      if (breaches.length > 0) {
        this.emit('risk_limit_exceeded', {
          userId,
          orderId: order.id,
          breaches,
          metrics: updatedMetrics
        });
      }
      
      // Check for margin calls
      const marginStatus = await this.checkMarginStatus(userId);
      if (marginStatus.marginCall) {
        this.emit('margin_call', {
          userId,
          currentMargin: marginStatus.currentMargin,
          requiredMargin: marginStatus.requiredMargin,
          deficit: marginStatus.deficit
        });
      }
      
      return {
        success: true,
        metrics: updatedMetrics,
        breaches,
        marginStatus
      };
      
    } catch (error) {
      this.logger?.error('Error in post-trade risk check:', error);
      throw error;
    }
  }

  async calculateRiskMetrics(userId) {
    const cacheKey = `risk_metrics_${userId}`;
    const cached = this.riskCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }
    
    try {
      const positions = await this.getUserPositions(userId);
      const portfolioValue = await this.getPortfolioValue(userId);
      
      // Calculate VaR
      const var95 = await this.calculateVaR(positions, this.varConfidenceLevel);
      const var99 = await this.calculateVaR(positions, 0.99);
      
      // Calculate Expected Shortfall (CVaR)
      const expectedShortfall = await this.calculateExpectedShortfall(positions, this.varConfidenceLevel);
      
      // Calculate leverage
      const totalExposure = await this.getTotalExposure(userId);
      const leverage = portfolioValue.gt(0) ? totalExposure.dividedBy(portfolioValue) : new Decimal(0);
      
      // Calculate concentration risk
      const concentrationRisk = this.calculateConcentrationRisk(positions, portfolioValue);
      
      // Calculate correlation risk
      const correlationRisk = await this.calculateCorrelationRisk(positions);
      
      // Calculate beta to market
      const marketBeta = await this.calculateMarketBeta(positions);
      
      const metrics = {
        userId,
        portfolioValue: portfolioValue.toString(),
        totalExposure: totalExposure.toString(),
        leverage: leverage.toFixed(2),
        var95: var95.toString(),
        var99: var99.toString(),
        expectedShortfall: expectedShortfall.toString(),
        concentrationRisk: concentrationRisk.toFixed(4),
        correlationRisk: correlationRisk.toFixed(4),
        marketBeta: marketBeta.toFixed(4),
        positionCount: positions.length,
        timestamp: new Date(),
        calculationTime: Date.now()
      };
      
      // Cache results
      this.riskCache.set(cacheKey, {
        data: metrics,
        timestamp: Date.now()
      });
      
      return metrics;
      
    } catch (error) {
      this.logger?.error('Error calculating risk metrics:', error);
      throw error;
    }
  }

  async calculateVaR(positions, confidenceLevel) {
    try {
      if (!positions || positions.length === 0) {
        return new Decimal(0);
      }
      
      // Simple parametric VaR calculation
      // In production, this would use more sophisticated methods
      let portfolioVariance = new Decimal(0);
      
      for (const position of positions) {
        const volatility = await this.getAssetVolatility(position.symbol);
        const positionValue = new Decimal(position.marketValue);
        const positionVariance = positionValue.times(positionValue).times(volatility).times(volatility);
        portfolioVariance = portfolioVariance.plus(positionVariance);
      }
      
      // Add correlation effects (simplified)
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const correlation = await this.getAssetCorrelation(positions[i].symbol, positions[j].symbol);
          const vol1 = await this.getAssetVolatility(positions[i].symbol);
          const vol2 = await this.getAssetVolatility(positions[j].symbol);
          const value1 = new Decimal(positions[i].marketValue);
          const value2 = new Decimal(positions[j].marketValue);
          
          const covarianceEffect = new Decimal(2).times(correlation).times(vol1).times(vol2).times(value1).times(value2);
          portfolioVariance = portfolioVariance.plus(covarianceEffect);
        }
      }
      
      const portfolioVolatility = portfolioVariance.sqrt();
      
      // Convert confidence level to Z-score
      const zScore = this.getZScore(confidenceLevel);
      const var_ = portfolioVolatility.times(zScore).times(Math.sqrt(this.riskHorizon));
      
      return var_.abs();
      
    } catch (error) {
      this.logger?.error('Error calculating VaR:', error);
      return new Decimal(0);
    }
  }

  async calculateExpectedShortfall(positions, confidenceLevel) {
    try {
      // Simplified Expected Shortfall calculation
      const var_ = await this.calculateVaR(positions, confidenceLevel);
      
      // ES is typically 1.2-1.5x VaR for normal distributions
      const esMultiplier = 1.3;
      return var_.times(esMultiplier);
      
    } catch (error) {
      this.logger?.error('Error calculating Expected Shortfall:', error);
      return new Decimal(0);
    }
  }

  calculateConcentrationRisk(positions, portfolioValue) {
    if (!positions || positions.length === 0 || portfolioValue.lte(0)) {
      return new Decimal(0);
    }
    
    // Calculate Herfindahl-Hirschman Index for concentration
    let hhi = new Decimal(0);
    
    for (const position of positions) {
      const weight = new Decimal(position.marketValue).dividedBy(portfolioValue);
      hhi = hhi.plus(weight.times(weight));
    }
    
    return hhi;
  }

  async calculateCorrelationRisk(positions) {
    try {
      if (!positions || positions.length < 2) {
        return new Decimal(0);
      }
      
      let averageCorrelation = new Decimal(0);
      let pairCount = 0;
      
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          const correlation = await this.getAssetCorrelation(positions[i].symbol, positions[j].symbol);
          averageCorrelation = averageCorrelation.plus(Math.abs(correlation));
          pairCount++;
        }
      }
      
      if (pairCount === 0) {
        return new Decimal(0);
      }
      
      return averageCorrelation.dividedBy(pairCount);
      
    } catch (error) {
      this.logger?.error('Error calculating correlation risk:', error);
      return new Decimal(0);
    }
  }

  async calculateMarketBeta(positions) {
    try {
      if (!positions || positions.length === 0) {
        return new Decimal(0);
      }
      
      let weightedBeta = new Decimal(0);
      let totalValue = new Decimal(0);
      
      for (const position of positions) {
        const beta = await this.getAssetBeta(position.symbol);
        const value = new Decimal(position.marketValue).abs();
        weightedBeta = weightedBeta.plus(new Decimal(beta).times(value));
        totalValue = totalValue.plus(value);
      }
      
      if (totalValue.eq(0)) {
        return new Decimal(0);
      }
      
      return weightedBeta.dividedBy(totalValue);
      
    } catch (error) {
      this.logger?.error('Error calculating market beta:', error);
      return new Decimal(1); // Default beta of 1
    }
  }

  calculateRiskScore(metrics, limits) {
    let score = 0;
    
    // Order value score (0-20)
    const orderValueRatio = metrics.orderValue.dividedBy(limits.maxOrderValue);
    score += Math.min(orderValueRatio.times(20).toNumber(), 20);
    
    // Position value score (0-25)
    const positionValueRatio = metrics.positionValue.dividedBy(limits.maxPositionValue);
    score += Math.min(positionValueRatio.times(25).toNumber(), 25);
    
    // Leverage score (0-25)
    const leverageRatio = metrics.leverage.dividedBy(limits.maxLeverage);
    score += Math.min(leverageRatio.times(25).toNumber(), 25);
    
    // Concentration score (0-15)
    const concentrationRatio = metrics.concentration.dividedBy(limits.maxConcentration);
    score += Math.min(concentrationRatio.times(15).toNumber(), 15);
    
    // VaR score (0-15)
    const varRatio = metrics.var.dividedBy(limits.maxVaR);
    score += Math.min(varRatio.times(15).toNumber(), 15);
    
    return Math.min(Math.round(score), 100);
  }

  checkRiskBreaches(metrics, limits) {
    const breaches = [];
    
    if (new Decimal(metrics.totalExposure).gt(limits.maxPositionValue)) {
      breaches.push({
        type: 'exposure_limit',
        current: metrics.totalExposure,
        limit: limits.maxPositionValue.toString(),
        severity: 'high'
      });
    }
    
    if (parseFloat(metrics.leverage) > limits.maxLeverage) {
      breaches.push({
        type: 'leverage_limit',
        current: metrics.leverage,
        limit: limits.maxLeverage.toString(),
        severity: 'high'
      });
    }
    
    if (new Decimal(metrics.var95).gt(limits.maxVaR)) {
      breaches.push({
        type: 'var_limit',
        current: metrics.var95,
        limit: limits.maxVaR.toString(),
        severity: 'medium'
      });
    }
    
    return breaches;
  }

  async checkMarginStatus(userId) {
    try {
      const positions = await this.getUserPositions(userId);
      const accountValue = await this.getAccountValue(userId);
      
      let requiredMargin = new Decimal(0);
      let maintenanceMargin = new Decimal(0);
      
      for (const position of positions) {
        const positionValue = new Decimal(position.marketValue).abs();
        const userLimits = this.getUserLimits(userId);
        
        requiredMargin = requiredMargin.plus(positionValue.times(userLimits.marginRequirement));
        maintenanceMargin = maintenanceMargin.plus(positionValue.times(userLimits.maintenanceMargin));
      }
      
      const marginCall = accountValue.lt(maintenanceMargin);
      const liquidationCall = accountValue.lt(maintenanceMargin.times(this.getUserLimits(userId).liquidationThreshold));
      
      return {
        accountValue: accountValue.toString(),
        requiredMargin: requiredMargin.toString(),
        maintenanceMargin: maintenanceMargin.toString(),
        currentMargin: accountValue.toString(),
        marginCall,
        liquidationCall,
        deficit: marginCall ? maintenanceMargin.minus(accountValue).toString() : '0'
      };
      
    } catch (error) {
      this.logger?.error('Error checking margin status:', error);
      throw error;
    }
  }

  getUserLimits(userId) {
    return this.userLimits.get(userId) || this.limits;
  }

  getZScore(confidenceLevel) {
    // Approximate Z-scores for common confidence levels
    const zScores = {
      0.90: 1.282,
      0.95: 1.645,
      0.99: 2.326,
      0.999: 3.090
    };
    
    return zScores[confidenceLevel] || 1.645;
  }

  // Placeholder methods that would connect to market data service
  async getEstimatedPrice(symbol) {
    return new Decimal(100); // Placeholder
  }

  async getCurrentPosition(userId, symbol) {
    return new Decimal(0); // Placeholder
  }

  async getPortfolioValue(userId) {
    return new Decimal(100000); // Placeholder
  }

  async getTotalExposure(userId) {
    return new Decimal(50000); // Placeholder
  }

  async getUserPositions(userId) {
    return []; // Placeholder
  }

  async getAccountValue(userId) {
    return new Decimal(100000); // Placeholder
  }

  async getAssetVolatility(symbol) {
    return 0.25; // 25% annual volatility placeholder
  }

  async getAssetCorrelation(symbol1, symbol2) {
    return 0.3; // 30% correlation placeholder
  }

  async getAssetBeta(symbol) {
    return 1.0; // Beta of 1 placeholder
  }

  calculateNewPositionSize(currentPosition, order) {
    const currentSize = new Decimal(currentPosition);
    const orderQuantity = new Decimal(order.quantity);
    
    if (order.side === 'buy') {
      return currentSize.plus(orderQuantity);
    } else {
      return currentSize.minus(orderQuantity);
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      userLimitsCount: this.userLimits.size,
      cacheSize: this.riskCache.size,
      defaultLimits: this.limits
    };
  }
}

module.exports = RiskCalculator;