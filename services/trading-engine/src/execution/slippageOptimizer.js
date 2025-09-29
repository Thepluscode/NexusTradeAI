const EventEmitter = require('events');
const Decimal = require('decimal.js');

class SlippageOptimizer extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.marketDataService = options.marketDataService;
    this.isInitialized = false;
    
    // Configuration
    this.config = {
      maxSlippageTolerance: 0.005, // 0.5%
      impactThreshold: 0.001, // 0.1%
      adaptiveSlicing: true,
      dynamicTiming: true,
      minSliceSize: 0.01, // 1% of total order
      maxSlices: 20,
      defaultModel: 'squareRoot',
      maxSlippage: 0.005, // 0.5% max slippage
      timeHorizon: 300000, // 5 minutes
      riskTolerance: 0.5,
      maxParticipationRate: 0.3 // Max 30% participation rate
    };
    
    // Merge provided config with defaults
    if (options.config) {
      Object.assign(this.config, options.config);
    }
    
    // Slippage models
    this.models = {
      linear: this.linearImpactModel.bind(this),
      squareRoot: this.squareRootImpactModel.bind(this),
      almgren: this.almgrenChrisModel.bind(this)
    };
    
    // Market impact models (legacy)
    this.impactModels = new Map();
    this.historicalData = new Map();
    this.volumeProfiles = new Map();
    
    // Historical slippage tracking
    this.slippageHistory = new Map(); // symbol -> slippage data
    this.maxHistorySize = 1000;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing SlippageOptimizer...');
      
      // Load historical impact data
      await this.loadHistoricalData();
      
      // Initialize impact models
      this.initializeImpactModels();
      
      this.isInitialized = true;
      this.logger?.info('SlippageOptimizer initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize SlippageOptimizer:', error);
      throw error;
    }
  }

  async loadHistoricalData() {
    // This would typically load from database
    // For now, initialize with default values
    this.logger?.info('Loaded historical market impact data');
  }

  initializeImpactModels() {
    // Linear impact model
    this.impactModels.set('linear', {
      calculate: this.calculateLinearImpact.bind(this),
      weight: 0.3
    });
    
    // Square root impact model
    this.impactModels.set('sqrt', {
      calculate: this.calculateSqrtImpact.bind(this),
      weight: 0.4
    });
    
    // Almgren-Chriss model
    this.impactModels.set('almgren_chriss', {
      calculate: this.calculateAlmgrenChrissImpact.bind(this),
      weight: 0.3
    });
  }

  async optimize(order, strategy = {}) {
    try {
      this.logger?.debug(`Optimizing order for slippage: ${order.id}`, {
        symbol: order.symbol,
        quantity: order.quantity,
        type: order.type
      });

      // Use the new optimization logic if requested or as default
      if (strategy.useAdvancedOptimizer !== false) {
        return await this.optimizeExecution(order, {
          model: strategy.model || this.config.defaultModel,
          maxSlippage: strategy.maxSlippage || this.config.maxSlippage,
          timeHorizon: strategy.timeHorizon || this.config.timeHorizon,
          riskTolerance: strategy.riskTolerance || this.config.riskTolerance
        });
      }
      
      // Legacy optimization logic
      const marketData = await this.getMarketData(order.symbol);
      const expectedSlippage = await this.calculateExpectedSlippage(order, marketData);
      
      if (expectedSlippage.percentage <= this.config.maxSlippageTolerance) {
        return {
          ...order,
          optimization: {
            type: 'none',
            expectedSlippage: expectedSlippage.percentage,
            reason: 'Slippage within tolerance'
          }
        };
      }
      
      const optimizationStrategy = this.determineOptimizationStrategy(order, marketData, expectedSlippage);
      const optimizedOrder = await this.applyOptimization(order, optimizationStrategy, marketData);
      
      this.logger?.debug(`Order optimization completed: ${order.id}`, {
        originalSlippage: expectedSlippage.percentage,
        optimizedSlippage: optimizedOrder.optimization.expectedSlippage,
        strategy: optimizationStrategy.type
      });
      
      return optimizedOrder;
      
    } catch (error) {
      this.logger?.error(`Error optimizing order ${order.id}:`, error);
      
      // Return original order with warning
      return {
        ...order,
        optimization: {
          type: 'failed',
          error: error.message,
          reason: 'Optimization failed, using original order'
        }
      };
    }
  }

  async calculateExpectedSlippage(order, marketData) {
    const orderSize = new Decimal(order.quantity);
    const orderValue = orderSize.times(order.price || marketData.midPrice);
    
    // Calculate market impact using ensemble of models
    let totalImpact = new Decimal(0);
    let totalWeight = 0;
    
    for (const [modelName, model] of this.impactModels) {
      try {
        const impact = await model.calculate(order, marketData);
        totalImpact = totalImpact.plus(new Decimal(impact).times(model.weight));
        totalWeight += model.weight;
      } catch (error) {
        this.logger?.warn(`Error in impact model ${modelName}:`, error);
      }
    }
    
    const averageImpact = totalWeight > 0 ? totalImpact.dividedBy(totalWeight) : new Decimal(0);
    
    // Add bid-ask spread cost
    const spreadCost = new Decimal(marketData.spread).dividedBy(2);
    
    // Add timing risk (volatility component)
    const timingRisk = this.calculateTimingRisk(order, marketData);
    
    const totalSlippage = averageImpact.plus(spreadCost).plus(timingRisk);
    const slippagePercentage = totalSlippage.dividedBy(marketData.midPrice);
    
    return {
      absolute: totalSlippage.toNumber(),
      percentage: slippagePercentage.toNumber(),
      components: {
        marketImpact: averageImpact.toNumber(),
        spreadCost: spreadCost.toNumber(),
        timingRisk: timingRisk.toNumber()
      }
    };
  }

  calculateLinearImpact(order, marketData) {
    // Linear impact: I = α * (Q / ADV)
    const orderQuantity = new Decimal(order.quantity);
    const averageDailyVolume = new Decimal(marketData.averageDailyVolume || 1000000);
    const alpha = 0.1; // Impact coefficient
    
    const participationRate = orderQuantity.dividedBy(averageDailyVolume);
    const impact = participationRate.times(alpha).times(marketData.volatility || 0.02);
    
    return impact.times(marketData.midPrice).toNumber();
  }

  calculateSqrtImpact(order, marketData) {
    // Square root impact: I = α * sqrt(Q / ADV) * σ
    const orderQuantity = new Decimal(order.quantity);
    const averageDailyVolume = new Decimal(marketData.averageDailyVolume || 1000000);
    const alpha = 0.5; // Impact coefficient
    
    const participationRate = orderQuantity.dividedBy(averageDailyVolume);
    const impact = participationRate.sqrt().times(alpha).times(marketData.volatility || 0.02);
    
    return impact.times(marketData.midPrice).toNumber();
  }

  calculateAlmgrenChrissImpact(order, marketData) {
    // Almgren-Chriss model: I = η * (Q/T) + γ * Q^(3/2) / V^(1/2)
    const orderQuantity = new Decimal(order.quantity);
    const tradeTime = new Decimal(300); // 5 minutes default
    const eta = 0.01; // Temporary impact coefficient
    const gamma = 0.001; // Permanent impact coefficient
    const volume = new Decimal(marketData.volume || 1000000);
    
    const temporaryImpact = eta.times(orderQuantity.dividedBy(tradeTime));
    const permanentImpact = gamma.times(orderQuantity.pow(1.5).dividedBy(volume.sqrt()));
    
    const totalImpact = temporaryImpact.plus(permanentImpact);
    
    return totalImpact.times(marketData.midPrice).toNumber();
  }

  calculateTimingRisk(order, marketData) {
    // Timing risk based on volatility and execution time
    const volatility = new Decimal(marketData.volatility || 0.02);
    const executionTime = new Decimal(60); // 1 minute default
    const timeInSeconds = executionTime.dividedBy(86400); // Convert to fraction of day
    
    const timingRisk = volatility.times(timeInSeconds.sqrt());
    
    return timingRisk.times(marketData.midPrice);
  }

  determineOptimizationStrategy(order, marketData, expectedSlippage) {
    const orderValue = new Decimal(order.quantity).times(order.price || marketData.midPrice);
    const slippageRatio = expectedSlippage.percentage / this.config.maxSlippageTolerance;
    
    // Very large orders need time-based slicing
    if (orderValue.gt(1000000) && slippageRatio > 3) {
      return {
        type: 'twap',
        duration: 1800, // 30 minutes
        slices: Math.min(this.config.maxSlices, Math.ceil(slippageRatio * 5))
      };
    }
    
    // Large orders with high impact need volume-based slicing
    if (slippageRatio > 2) {
      return {
        type: 'vwap',
        participationRate: 0.1, // 10% of volume
        slices: Math.min(this.config.maxSlices, Math.ceil(slippageRatio * 3))
      };
    }
    
    // Moderate orders use simple slicing
    if (slippageRatio > 1.5) {
      return {
        type: 'slice',
        slices: Math.min(10, Math.ceil(slippageRatio * 2)),
        delay: 5000 // 5 seconds between slices
      };
    }
    
    // Small adjustments - price improvement
    return {
      type: 'price_improve',
      priceAdjustment: expectedSlippage.absolute * 0.5
    };
  }

  async applyOptimization(order, strategy, marketData) {
    switch (strategy.type) {
      case 'twap':
        return this.applyTWAPOptimization(order, strategy, marketData);
      case 'vwap':
        return this.applyVWAPOptimization(order, strategy, marketData);
      case 'slice':
        return this.applySliceOptimization(order, strategy, marketData);
      case 'price_improve':
        return this.applyPriceImprovement(order, strategy, marketData);
      default:
        return order;
    }
  }

  applyTWAPOptimization(order, strategy, marketData) {
    const sliceSize = new Decimal(order.quantity).dividedBy(strategy.slices);
    const sliceDelay = strategy.duration * 1000 / strategy.slices; // Convert to milliseconds
    
    const slices = [];
    let remainingQuantity = new Decimal(order.quantity);
    
    for (let i = 0; i < strategy.slices && remainingQuantity.gt(0); i++) {
      const currentSliceSize = Decimal.min(sliceSize, remainingQuantity);
      
      slices.push({
        quantity: currentSliceSize.toString(),
        delay: i * sliceDelay,
        type: order.type,
        price: order.price
      });
      
      remainingQuantity = remainingQuantity.minus(currentSliceSize);
    }
    
    return {
      ...order,
      optimization: {
        type: 'twap',
        slices,
        expectedSlippage: this.estimateOptimizedSlippage(order, strategy, marketData),
        totalDuration: strategy.duration * 1000,
        reason: `Split into ${slices.length} TWAP slices over ${strategy.duration}s`
      }
    };
  }

  applyVWAPOptimization(order, strategy, marketData) {
    // Calculate volume schedule based on historical volume profile
    const volumeProfile = this.getVolumeProfile(order.symbol);
    const slices = this.calculateVWAPSlices(order, strategy, volumeProfile);
    
    return {
      ...order,
      optimization: {
        type: 'vwap',
        slices,
        participationRate: strategy.participationRate,
        expectedSlippage: this.estimateOptimizedSlippage(order, strategy, marketData),
        reason: `VWAP execution with ${strategy.participationRate * 100}% participation rate`
      }
    };
  }

  applySliceOptimization(order, strategy, marketData) {
    const sliceSize = new Decimal(order.quantity).dividedBy(strategy.slices);
    const slices = [];
    
    for (let i = 0; i < strategy.slices; i++) {
      slices.push({
        quantity: sliceSize.toString(),
        delay: i * strategy.delay,
        type: order.type,
        price: order.price
      });
    }
    
    return {
      ...order,
      optimization: {
        type: 'slice',
        slices,
        expectedSlippage: this.estimateOptimizedSlippage(order, strategy, marketData),
        reason: `Split into ${strategy.slices} equal slices`
      }
    };
  }

  applyPriceImprovement(order, strategy, marketData) {
    if (order.type !== 'limit') {
      return order; // Only apply to limit orders
    }
    
    const originalPrice = new Decimal(order.price);
    const adjustment = new Decimal(strategy.priceAdjustment);
    
    // Improve price in favorable direction
    const improvedPrice = order.side === 'buy' ? 
      originalPrice.minus(adjustment) : 
      originalPrice.plus(adjustment);
    
    return {
      ...order,
      price: improvedPrice.toString(),
      optimization: {
        type: 'price_improve',
        originalPrice: originalPrice.toString(),
        adjustment: adjustment.toString(),
        expectedSlippage: this.estimateOptimizedSlippage(order, strategy, marketData),
        reason: `Price improved by ${adjustment.toFixed(4)}`
      }
    };
  }

  calculateVWAPSlices(order, strategy, volumeProfile) {
    const totalQuantity = new Decimal(order.quantity);
    const participationRate = new Decimal(strategy.participationRate);
    
    const slices = [];
    let remainingQuantity = totalQuantity;
    
    // Use volume profile to determine slice sizes
    for (let i = 0; i < volumeProfile.length && remainingQuantity.gt(0); i++) {
      const intervalVolume = new Decimal(volumeProfile[i].volume);
      const maxSliceSize = intervalVolume.times(participationRate);
      const sliceSize = Decimal.min(maxSliceSize, remainingQuantity);
      
      if (sliceSize.gt(0)) {
        slices.push({
          quantity: sliceSize.toString(),
          delay: volumeProfile[i].startTime,
          type: order.type,
          price: order.price,
          targetVolume: intervalVolume.toString()
        });
        
        remainingQuantity = remainingQuantity.minus(sliceSize);
      }
    }
    
    return slices;
  }

  getVolumeProfile(symbol) {
    // Simplified volume profile (in production, would use historical data)
    const profile = [];
    const baseVolume = 100000;
    
    // 24 hour profile with higher volume during market hours
    for (let hour = 0; hour < 24; hour++) {
      let volumeMultiplier = 1;
      
      // Higher volume during market hours (9:30 AM - 4:00 PM EST)
      if (hour >= 9 && hour <= 16) {
        volumeMultiplier = 2.5;
      } else if (hour >= 7 && hour <= 9 || hour >= 16 && hour <= 18) {
        volumeMultiplier = 1.5;
      }
      
      profile.push({
        startTime: hour * 3600000, // Hour in milliseconds
        volume: baseVolume * volumeMultiplier,
        hour
      });
    }
    
    return profile;
  }

  estimateOptimizedSlippage(order, strategy, marketData) {
    // Simplified slippage estimation for optimized orders
    const baseSlippage = new Decimal(marketData.spread).dividedBy(2);
    
    let reductionFactor = 1;
    
    switch (strategy.type) {
      case 'twap':
        reductionFactor = Math.max(0.3, 1 - (strategy.slices * 0.05));
        break;
      case 'vwap':
        reductionFactor = Math.max(0.4, 1 - (strategy.participationRate * 2));
        break;
      case 'slice':
        reductionFactor = Math.max(0.5, 1 - (strategy.slices * 0.03));
        break;
      case 'price_improve':
        reductionFactor = 0.8;
        break;
    }
    
    // Get impact function
    const impactModel = this.models[model] || this.models[this.config.defaultModel];
    if (!impactModel) {
      throw new Error(`Unknown impact model: ${model}`);
    }

    // Calculate market impact for different execution speeds
    const strategies = [];
    const speedOptions = [1, 2, 5, 10, 20]; // Different numbers of slices

    for (const sliceCount of speedOptions) {
      const sliceSize = new Decimal(quantity).dividedBy(sliceCount);
      const timeInterval = timeHorizon / sliceCount;
      
      // Calculate expected slippage for this strategy
      const expectedSlippage = impactModel({
        quantity: sliceSize.toNumber(),
        volume: marketData.averageDailyVolume,
        volatility: marketData.volatility,
        spread: marketData.bidAskSpread,
        timeInterval
      });

      // Calculate total cost (slippage + timing risk)
      const timingRisk = this.calculateTimingRisk({
        timeHorizon,
        volatility: marketData.volatility,
        riskTolerance
      });

      const totalCost = expectedSlippage + timingRisk;
      const participationRate = sliceSize.toNumber() / marketData.averageDailyVolume;

      strategies.push({
        sliceCount,
        sliceSize: sliceSize.toNumber(),
        timeInterval,
        expectedSlippage,
        timingRisk,
        totalCost,
        participationRate
      });
    }

    // Select optimal strategy (minimize total cost while respecting constraints)
    const feasibleStrategies = strategies.filter(s => 
      s.expectedSlippage <= maxSlippage &&
      s.participationRate <= this.config.maxParticipationRate
    );

    if (feasibleStrategies.length === 0) {
      throw new Error('No feasible execution strategy found within constraints');
    }

    const optimalStrategy = feasibleStrategies.reduce((best, current) => 
      current.totalCost < best.totalCost ? current : best
    );

    return {
      ...optimalStrategy,
      executionPlan: this.createExecutionPlan({
        symbol,
        quantity,
        ...optimalStrategy
      }),
      confidence: this.calculateConfidence(optimalStrategy, this.getHistoricalSlippage(symbol))
    };
  }

  linearImpactModel(params) {
    const { quantity, volume, spread } = params;
    const participationRate = quantity / volume;
    
    // Linear impact: slippage = spread/2 + alpha * participation_rate
    const alpha = 0.1; // Impact coefficient
    return (spread / 2) + (alpha * participationRate);
  }

  squareRootImpactModel(params) {
    const { quantity, volume, volatility, spread } = params;
    const participationRate = quantity / volume;
    
    // Square root impact model
    const sigma = volatility; // Daily volatility
    const impact = (spread / 2) + (sigma * Math.sqrt(participationRate));
    
    return impact;
  }

  almgrenChrisModel(params) {
    const { quantity, volume, volatility, timeInterval } = params;
    
    // Almgren-Chriss model
    const gamma = 0.5; // Temporary impact parameter
    const eta = 0.1; // Permanent impact parameter
    const sigma = volatility;
    
    const participationRate = quantity / volume;
    const timeInDays = timeInterval / (24 * 60 * 60 * 1000);
    
    // Permanent impact
    const permanentImpact = eta * quantity;
    
    // Temporary impact
    const temporaryImpact = gamma * Math.sqrt(participationRate / timeInDays);
    
    return permanentImpact + temporaryImpact;
  }

  calculateTimingRisk(params) {
    const { timeHorizon, volatility, riskTolerance } = params;
    
    // Timing risk increases with time and volatility
    const timeInDays = timeHorizon / (24 * 60 * 60 * 1000);
    const timingRisk = volatility * Math.sqrt(timeInDays) * riskTolerance;
    
    return timingRisk;
  }

  createExecutionPlan(params) {
    const { symbol, quantity, sliceCount, sliceSize, timeInterval } = params;
    const plan = [];
    
    for (let i = 0; i < sliceCount; i++) {
      plan.push({
        symbol,
        sequence: i + 1,
        quantity: sliceSize,
        estimatedTime: new Date(Date.now() + (i * timeInterval)),
        orderType: i === 0 || i === sliceCount - 1 ? 'market' : 'limit',
        priority: i < sliceCount * 0.3 ? 'high' : 'normal'
      });
    }
    
    return plan;
  }

  calculateConfidence(strategy, historicalData = []) {
    if (!historicalData || historicalData.length === 0) {
      return 0.5; // Medium confidence with no historical data
    }
    
    // Calculate confidence based on historical accuracy
    const predictions = historicalData.map(h => h.predicted);
    const actuals = historicalData.map(h => h.actual);
    
    if (predictions.length === 0) return 0.5;
    
    const errors = predictions.map((pred, i) => Math.abs(pred - actuals[i]));
    const meanError = errors.reduce((sum, err) => sum + err, 0) / errors.length;
    const maxError = Math.max(...errors);
    
    // Confidence decreases with prediction error
    const confidence = Math.max(0.1, 1 - (meanError / maxError));
    
    return confidence;
  }

  recordSlippage(symbol, predicted, actual, metadata = {}) {
    if (!this.slippageHistory.has(symbol)) {
      this.slippageHistory.set(symbol, []);
    }
    
    const history = this.slippageHistory.get(symbol);
    history.push({
      predicted,
      actual,
      error: Math.abs(predicted - actual),
      timestamp: new Date(),
      ...metadata
    });
    
    // Limit history size
    if (history.length > this.maxHistorySize) {
      history.shift();
    }
    
    this.logger?.info(`Slippage recorded for ${symbol}:`, {
      predicted,
      actual,
      error: Math.abs(predicted - actual)
    });
  }

  getHistoricalSlippage(symbol) {
    return this.slippageHistory.get(symbol) || [];
  }

  getSlippageStats(symbol) {
    const history = this.getHistoricalSlippage(symbol);
    
    if (history.length === 0) {
      return null;
    }
    
    const errors = history.map(h => h.error);
    const predictions = history.map(h => h.predicted);
    const actuals = history.map(h => h.actual);
    
    return {
      count: history.length,
      meanError: errors.reduce((sum, err) => sum + err, 0) / errors.length,
      maxError: Math.max(...errors),
      minError: Math.min(...errors),
      meanPredicted: predictions.reduce((sum, p) => sum + p, 0) / predictions.length,
      meanActual: actuals.reduce((sum, a) => sum + a, 0) / actuals.length,
      accuracy: 1 - (errors.reduce((sum, err) => sum + err, 0) / errors.length)
    };
  }

  async getMarketData(symbol) {
    // Try to use market data service if available
    if (this.marketDataService) {
      try {
        return await this.marketDataService.getMarketData(symbol);
      } catch (error) {
        this.logger?.warn(`Failed to get market data from service: ${error.message}`);
      }
    }
    
    // Fallback to default data
    return {
      averageDailyVolume: 1000000,
      currentPrice: 100.00,
      bidAskSpread: 0.10,
      volatility: 0.25,
      bid: 100.00,
      ask: 100.10,
      orderBookDepth: {
        bids: [{ price: 99.95, quantity: 1000 }],
        asks: [{ price: 100.05, quantity: 1000 }]
      }
    };
  }

  async monitorExecution(order, fills) {
    try {
      if (!fills || fills.length === 0) return;
      
      // Calculate actual slippage
      const actualSlippage = this.calculateActualSlippage(order, fills);
      
      // Compare with expected slippage
      const expectedSlippage = order.optimization?.expectedSlippage || 0;
      const slippageDifference = actualSlippage - expectedSlippage;
      
      // Update models if significant difference
      if (Math.abs(slippageDifference) > 0.001) { // 0.1% threshold
        await this.updateImpactModels(order, fills, actualSlippage);
      }
      
      this.emit('execution_monitored', {
        orderId: order.id,
        expectedSlippage,
        actualSlippage,
        difference: slippageDifference,
        optimization: order.optimization?.type
      });
      
    } catch (error) {
      this.logger?.error('Error monitoring execution:', error);
    }
  }

  calculateActualSlippage(order, fills) {
    if (!fills || fills.length === 0) return 0;
    
    const totalQuantity = fills.reduce((sum, fill) => sum + parseFloat(fill.quantity), 0);
    const totalValue = fills.reduce((sum, fill) => sum + (parseFloat(fill.quantity) * parseFloat(fill.price)), 0);
    
    const avgFillPrice = totalValue / totalQuantity;
    const orderPrice = parseFloat(order.price) || avgFillPrice;
    
    const slippage = Math.abs(avgFillPrice - orderPrice) / orderPrice;
    
    return slippage;
  }

  async updateImpactModels(order, fills, actualSlippage) {
    // This would update the impact models based on actual execution data
    // For now, just log the information
    this.logger?.debug('Updating impact models with execution data', {
      orderId: order.id,
      symbol: order.symbol,
      actualSlippage,
      fillsCount: fills.length
    });
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      config: this.config,
      impactModels: Array.from(this.impactModels.keys()),
      historicalDataPoints: this.historicalData.size
    };
  }
}

module.exports = SlippageOptimizer;