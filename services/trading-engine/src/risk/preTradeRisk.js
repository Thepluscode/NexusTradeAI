// src/risk/preTradeRisk.js
const Decimal = require('decimal.js');

class PreTradeRisk {
  constructor(options = {}) {
    this.logger = options.logger;
    this.positionService = options.positionService;
    this.marketDataService = options.marketDataService;
    
    // Risk limits configuration
    this.riskLimits = {
      maxOrderValue: 10000000,        // $10M max single order
      maxDailyVolume: 100000000,      // $100M max daily volume per user
      maxPositionSize: 50000000,      // $50M max position size
      maxLeverage: 10,                // 10x max leverage
      maxConcentration: 0.25,         // 25% max single position concentration
      maxDrawdown: 0.20,              // 20% max portfolio drawdown
      marginRequirement: 0.50,        // 50% margin requirement
      liquidityBuffer: 0.10           // 10% liquidity buffer
    };
    
    // Risk check types
    this.checkTypes = {
      ORDER_SIZE: 'order_size',
      POSITION_LIMIT: 'position_limit',
      CONCENTRATION: 'concentration',
      LEVERAGE: 'leverage',
      MARGIN: 'margin',
      LIQUIDITY: 'liquidity',
      CREDIT: 'credit',
      REGULATORY: 'regulatory'
    };
    
    // Performance tracking
    this.stats = {
      totalChecks: 0,
      passedChecks: 0,
      rejectedOrders: 0,
      avgCheckTime: 0,
      riskBreaches: new Map()
    };
  }

  async performPreTradeRiskCheck(order, userContext) {
    const startTime = process.hrtime.bigint();
    
    try {
      const riskResult = {
        orderId: order.id,
        passed: true,
        checks: [],
        warnings: [],
        rejectionReasons: [],
        riskScore: 0,
        timestamp: new Date()
      };
      
      // Perform all risk checks
      await this.checkOrderSize(order, riskResult);
      await this.checkPositionLimits(order, userContext, riskResult);
      await this.checkConcentrationRisk(order, userContext, riskResult);
      await this.checkLeverage(order, userContext, riskResult);
      await this.checkMarginRequirements(order, userContext, riskResult);
      await this.checkLiquidityRisk(order, userContext, riskResult);
      await this.checkCreditRisk(order, userContext, riskResult);
      await this.checkRegulatoryCompliance(order, userContext, riskResult);
      
      // Calculate overall risk score
      riskResult.riskScore = this.calculateRiskScore(riskResult);
      
      // Determine final result
      riskResult.passed = riskResult.rejectionReasons.length === 0;
      
      // Update statistics
      const checkTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.updateStats(riskResult, checkTime);
      
      this.logger?.info(`Pre-trade risk check completed for order ${order.id}`, {
        passed: riskResult.passed,
        riskScore: riskResult.riskScore,
        checkTime: `${checkTime.toFixed(3)}ms`,
        warnings: riskResult.warnings.length,
        rejections: riskResult.rejectionReasons.length
      });
      
      return riskResult;
      
    } catch (error) {
      this.logger?.error('Error in pre-trade risk check:', error);
      return {
        orderId: order.id,
        passed: false,
        rejectionReasons: ['Risk check system error'],
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  async checkOrderSize(order, result) {
    const orderValue = new Decimal(order.quantity).times(order.price || 0);
    
    result.checks.push({
      type: this.checkTypes.ORDER_SIZE,
      orderValue: orderValue.toNumber(),
      limit: this.riskLimits.maxOrderValue,
      passed: orderValue.lte(this.riskLimits.maxOrderValue)
    });
    
    if (orderValue.gt(this.riskLimits.maxOrderValue)) {
      result.rejectionReasons.push(
        `Order value ${orderValue.toFixed(2)} exceeds maximum limit ${this.riskLimits.maxOrderValue}`
      );
    }
    
    // Warning for large orders
    if (orderValue.gt(this.riskLimits.maxOrderValue * 0.5)) {
      result.warnings.push('Large order size detected');
    }
  }

  async checkPositionLimits(order, userContext, result) {
    const currentPosition = await this.getCurrentPosition(order.symbol, userContext.userId);
    const orderQuantity = new Decimal(order.quantity);
    const side = order.side.toLowerCase();
    
    // Calculate new position after order
    let newPositionSize = new Decimal(currentPosition.quantity || 0);
    if (side === 'buy') {
      newPositionSize = newPositionSize.plus(orderQuantity);
    } else {
      newPositionSize = newPositionSize.minus(orderQuantity);
    }
    
    const newPositionValue = newPositionSize.abs().times(order.price || currentPosition.avgPrice || 0);
    
    result.checks.push({
      type: this.checkTypes.POSITION_LIMIT,
      currentPosition: currentPosition.quantity || 0,
      newPosition: newPositionSize.toNumber(),
      newPositionValue: newPositionValue.toNumber(),
      limit: this.riskLimits.maxPositionSize,
      passed: newPositionValue.lte(this.riskLimits.maxPositionSize)
    });
    
    if (newPositionValue.gt(this.riskLimits.maxPositionSize)) {
      result.rejectionReasons.push(
        `New position size ${newPositionValue.toFixed(2)} exceeds maximum limit ${this.riskLimits.maxPositionSize}`
      );
    }
  }

  async checkConcentrationRisk(order, userContext, result) {
    const portfolio = await this.getPortfolioSummary(userContext.userId);
    const orderValue = new Decimal(order.quantity).times(order.price || 0);
    
    // Calculate concentration after order
    const currentSymbolValue = portfolio.positions[order.symbol]?.value || 0;
    const newSymbolValue = new Decimal(currentSymbolValue).plus(orderValue);
    const newTotalValue = new Decimal(portfolio.totalValue).plus(orderValue);
    
    const concentration = newTotalValue.gt(0) ? 
      newSymbolValue.dividedBy(newTotalValue).toNumber() : 0;
    
    result.checks.push({
      type: this.checkTypes.CONCENTRATION,
      symbol: order.symbol,
      concentration,
      limit: this.riskLimits.maxConcentration,
      passed: concentration <= this.riskLimits.maxConcentration
    });
    
    if (concentration > this.riskLimits.maxConcentration) {
      result.rejectionReasons.push(
        `Position concentration ${(concentration * 100).toFixed(1)}% exceeds maximum ${this.riskLimits.maxConcentration * 100}%`
      );
    }
    
    // Warning at 80% of limit
    if (concentration > this.riskLimits.maxConcentration * 0.8) {
      result.warnings.push('High concentration risk');
    }
  }

  async checkLeverage(order, userContext, result) {
    const portfolio = await this.getPortfolioSummary(userContext.userId);
    const orderValue = new Decimal(order.quantity).times(order.price || 0);
    
    const newTotalExposure = new Decimal(portfolio.totalExposure).plus(orderValue);
    const leverage = portfolio.equity > 0 ? 
      newTotalExposure.dividedBy(portfolio.equity).toNumber() : 0;
    
    result.checks.push({
      type: this.checkTypes.LEVERAGE,
      currentLeverage: portfolio.leverage || 0,
      newLeverage: leverage,
      limit: this.riskLimits.maxLeverage,
      passed: leverage <= this.riskLimits.maxLeverage
    });
    
    if (leverage > this.riskLimits.maxLeverage) {
      result.rejectionReasons.push(
        `Leverage ${leverage.toFixed(2)}x exceeds maximum ${this.riskLimits.maxLeverage}x`
      );
    }
  }

  async checkMarginRequirements(order, userContext, result) {
    const portfolio = await this.getPortfolioSummary(userContext.userId);
    const orderValue = new Decimal(order.quantity).times(order.price || 0);
    const requiredMargin = orderValue.times(this.riskLimits.marginRequirement);
    
    const availableMargin = new Decimal(portfolio.availableMargin || 0);
    const marginAfterOrder = availableMargin.minus(requiredMargin);
    
    result.checks.push({
      type: this.checkTypes.MARGIN,
      requiredMargin: requiredMargin.toNumber(),
      availableMargin: availableMargin.toNumber(),
      marginAfterOrder: marginAfterOrder.toNumber(),
      passed: marginAfterOrder.gte(0)
    });
    
    if (marginAfterOrder.lt(0)) {
      result.rejectionReasons.push(
        `Insufficient margin: required ${requiredMargin.toFixed(2)}, available ${availableMargin.toFixed(2)}`
      );
    }
  }

  async checkLiquidityRisk(order, userContext, result) {
    const marketData = await this.getMarketData(order.symbol);
    const orderValue = new Decimal(order.quantity).times(order.price || marketData.lastPrice || 0);
    
    // Check if order size is reasonable relative to average volume
    const avgDailyVolume = marketData.avgDailyVolume || 1000000;
    const volumeRatio = orderValue.dividedBy(avgDailyVolume).toNumber();
    
    // Check market impact
    const estimatedImpact = this.estimateMarketImpact(order, marketData);
    
    result.checks.push({
      type: this.checkTypes.LIQUIDITY,
      volumeRatio,
      estimatedImpact,
      marketCapacity: avgDailyVolume,
      passed: volumeRatio <= 0.1 && estimatedImpact <= 0.02 // 10% volume, 2% impact
    });
    
    if (volumeRatio > 0.1) {
      result.warnings.push('Large order relative to average volume');
    }
    
    if (estimatedImpact > 0.05) {
      result.rejectionReasons.push('Order may cause excessive market impact');
    }
  }

  async checkCreditRisk(order, userContext, result) {
    const creditInfo = await this.getCreditInfo(userContext.userId);
    const orderValue = new Decimal(order.quantity).times(order.price || 0);
    
    const availableCredit = new Decimal(creditInfo.creditLimit || 0)
      .minus(creditInfo.usedCredit || 0);
    
    result.checks.push({
      type: this.checkTypes.CREDIT,
      requiredCredit: orderValue.toNumber(),
      availableCredit: availableCredit.toNumber(),
      creditUtilization: creditInfo.creditLimit > 0 ? 
        (creditInfo.usedCredit / creditInfo.creditLimit) : 0,
      passed: orderValue.lte(availableCredit)
    });
    
    if (orderValue.gt(availableCredit)) {
      result.rejectionReasons.push('Insufficient credit limit');
    }
  }

  async checkRegulatoryCompliance(order, userContext, result) {
    const compliance = {
      patternDayTrader: await this.checkPatternDayTrader(userContext.userId),
      tradingHalts: await this.checkTradingHalts(order.symbol),
      positionLimits: await this.checkRegulatoryLimits(order, userContext),
      marginRequirements: await this.checkRegTMargin(order, userContext)
    };
    
    result.checks.push({
      type: this.checkTypes.REGULATORY,
      compliance,
      passed: Object.values(compliance).every(check => check.passed)
    });
    
    Object.values(compliance).forEach(check => {
      if (!check.passed) {
        result.rejectionReasons.push(check.reason);
      }
    });
  }

  calculateRiskScore(result) {
    let score = 0;
    const weights = {
      [this.checkTypes.ORDER_SIZE]: 0.15,
      [this.checkTypes.POSITION_LIMIT]: 0.20,
      [this.checkTypes.CONCENTRATION]: 0.15,
      [this.checkTypes.LEVERAGE]: 0.20,
      [this.checkTypes.MARGIN]: 0.10,
      [this.checkTypes.LIQUIDITY]: 0.10,
      [this.checkTypes.CREDIT]: 0.05,
      [this.checkTypes.REGULATORY]: 0.05
    };
    
    result.checks.forEach(check => {
      const weight = weights[check.type] || 0;
      const riskContribution = check.passed ? 0 : weight * 100;
      score += riskContribution;
    });
    
    return Math.min(score, 100); // Cap at 100
  }

  updateStats(result, checkTime) {
    this.stats.totalChecks++;
    
    if (result.passed) {
      this.stats.passedChecks++;
    } else {
      this.stats.rejectedOrders++;
      
      // Track breach types
      result.rejectionReasons.forEach(reason => {
        const count = this.stats.riskBreaches.get(reason) || 0;
        this.stats.riskBreaches.set(reason, count + 1);
      });
    }
    
    // Update average check time
    const totalTime = this.stats.avgCheckTime * (this.stats.totalChecks - 1) + checkTime;
    this.stats.avgCheckTime = totalTime / this.stats.totalChecks;
  }

  // Helper methods - would integrate with actual services
  async getCurrentPosition(symbol, userId) {
    // Mock position data
    return {
      symbol,
      quantity: 100,
      avgPrice: 150.00,
      value: 15000,
      unrealizedPnL: 500
    };
  }

  async getPortfolioSummary(userId) {
    // Mock portfolio data
    return {
      totalValue: 100000,
      totalExposure: 80000,
      equity: 100000,
      availableMargin: 50000,
      leverage: 0.8,
      positions: {
        'AAPL': { value: 15000 },
        'GOOGL': { value: 25000 }
      }
    };
  }

  async getMarketData(symbol) {
    return {
      symbol,
      lastPrice: 150.00,
      avgDailyVolume: 75000000,
      bid: 149.95,
      ask: 150.05,
      volatility: 0.25
    };
  }

  async getCreditInfo(userId) {
    return {
      creditLimit: 500000,
      usedCredit: 100000,
      creditRating: 'A'
    };
  }

  estimateMarketImpact(order, marketData) {
    const volumeRatio = (order.quantity * (order.price || marketData.lastPrice)) / marketData.avgDailyVolume;
    return Math.sqrt(volumeRatio) * 0.01; // Simplified impact model
  }

  // Regulatory compliance checks
  async checkPatternDayTrader(userId) {
    return { passed: true, reason: null };
  }

  async checkTradingHalts(symbol) {
    return { passed: true, reason: null };
  }

  async checkRegulatoryLimits(order, userContext) {
    return { passed: true, reason: null };
  }

  async checkRegTMargin(order, userContext) {
    return { passed: true, reason: null };
  }

  getStats() {
    return {
      ...this.stats,
      passRate: this.stats.totalChecks > 0 ? 
        this.stats.passedChecks / this.stats.totalChecks : 0,
      rejectionRate: this.stats.totalChecks > 0 ? 
        this.stats.rejectedOrders / this.stats.totalChecks : 0,
      topRiskBreaches: Object.fromEntries(
        Array.from(this.stats.riskBreaches.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
      )
    };
  }

  updateRiskLimits(newLimits) {
    this.riskLimits = {
      ...this.riskLimits,
      ...newLimits
    };
    
    this.logger?.info('Risk limits updated:', newLimits);
  }
}

module.exports = PreTradeRisk;