// Multi-Strategy Orchestration Engine
// Advanced coordination system with dynamic allocation, regime detection, and cross-asset rotation

const EventEmitter = require('events');
const RegimeDetector = require('./RegimeDetector');
const StrategyAllocator = require('./StrategyAllocator');
const CrossAssetRotator = require('./CrossAssetRotator');
const PerformanceAnalyzer = require('./PerformanceAnalyzer');

class MultiStrategyOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.redis = options.redis;
    
    // Initialize core components
    this.regimeDetector = new RegimeDetector(options);
    this.strategyAllocator = new StrategyAllocator(options);
    this.crossAssetRotator = new CrossAssetRotator(options);
    this.performanceAnalyzer = new PerformanceAnalyzer(options);
    
    // Strategy registry
    this.strategies = new Map();
    this.activeAllocations = new Map();
    this.performanceHistory = new Map();
    
    // Market regime state
    this.currentRegime = {
      type: 'NEUTRAL',
      confidence: 0.5,
      duration: 0,
      characteristics: {},
      lastUpdate: Date.now()
    };
    
    // Orchestration configuration
    this.config = {
      rebalanceFrequency: options.rebalanceFrequency || 300000, // 5 minutes
      regimeUpdateFrequency: options.regimeUpdateFrequency || 60000, // 1 minute
      minAllocationChange: options.minAllocationChange || 0.05, // 5%
      maxStrategyWeight: options.maxStrategyWeight || 0.4, // 40%
      minStrategyWeight: options.minStrategyWeight || 0.05, // 5%
      performanceWindow: options.performanceWindow || 86400000, // 24 hours
      riskBudget: options.riskBudget || 0.15, // 15% max portfolio risk
      correlationThreshold: options.correlationThreshold || 0.7,
      ...options.config
    };
    
    // Performance tracking
    this.metrics = {
      totalStrategies: 0,
      activeStrategies: 0,
      totalAllocatedCapital: 0,
      portfolioReturn: 0,
      portfolioVolatility: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      regimeAccuracy: 0,
      rebalanceCount: 0,
      lastRebalance: null
    };
    
    this.initializeOrchestrator();
  }

  /**
   * Initialize the orchestration system
   */
  async initializeOrchestrator() {
    try {
      // Load available strategies
      await this.loadStrategies();
      
      // Initialize regime detection
      await this.regimeDetector.initialize();
      
      // Start orchestration loops
      this.startRegimeMonitoring();
      this.startRebalancing();
      this.startPerformanceTracking();
      
      // Setup event handlers
      this.setupEventHandlers();
      
      this.logger?.info('🎼 Multi-Strategy Orchestrator initialized');
      
    } catch (error) {
      this.logger?.error('Failed to initialize orchestrator:', error);
      throw error;
    }
  }

  /**
   * Load and register available trading strategies
   */
  async loadStrategies() {
    const strategyConfigs = [
      {
        id: 'deep_learning_multi_asset',
        name: 'Deep Learning Multi-Asset',
        type: 'AI',
        assetClasses: ['stocks', 'crypto', 'forex'],
        expectedReturn: 0.25,
        expectedVolatility: 0.12,
        maxDrawdown: 0.08,
        capacity: 50000000, // $50M capacity
        regimePreference: ['BULL', 'NEUTRAL'],
        correlationProfile: 'LOW',
        institutionalGrade: true
      },
      {
        id: 'reinforcement_learning_market_making',
        name: 'RL Market Making',
        type: 'AI',
        assetClasses: ['stocks', 'crypto'],
        expectedReturn: 0.18,
        expectedVolatility: 0.06,
        maxDrawdown: 0.04,
        capacity: 100000000, // $100M capacity
        regimePreference: ['NEUTRAL', 'VOLATILE'],
        correlationProfile: 'VERY_LOW',
        institutionalGrade: true
      },
      {
        id: 'transformer_sentiment_trading',
        name: 'Transformer Sentiment Trading',
        type: 'AI',
        assetClasses: ['stocks', 'crypto'],
        expectedReturn: 0.22,
        expectedVolatility: 0.15,
        maxDrawdown: 0.10,
        capacity: 30000000, // $30M capacity
        regimePreference: ['BULL', 'VOLATILE'],
        correlationProfile: 'MEDIUM',
        institutionalGrade: true
      },
      {
        id: 'multi_confirmation_momentum',
        name: 'Multi-Confirmation Momentum',
        type: 'TRADITIONAL',
        assetClasses: ['stocks', 'forex', 'commodities'],
        expectedReturn: 0.15,
        expectedVolatility: 0.10,
        maxDrawdown: 0.06,
        capacity: 200000000, // $200M capacity
        regimePreference: ['BULL', 'TREND'],
        correlationProfile: 'HIGH',
        institutionalGrade: false
      },
      {
        id: 'ai_pattern_recognition',
        name: 'AI Pattern Recognition',
        type: 'HYBRID',
        assetClasses: ['stocks', 'crypto'],
        expectedReturn: 0.20,
        expectedVolatility: 0.13,
        maxDrawdown: 0.08,
        capacity: 75000000, // $75M capacity
        regimePreference: ['BULL', 'NEUTRAL', 'VOLATILE'],
        correlationProfile: 'MEDIUM',
        institutionalGrade: false
      }
    ];
    
    for (const config of strategyConfigs) {
      this.strategies.set(config.id, {
        ...config,
        currentAllocation: 0,
        performance: {
          returns: [],
          sharpeRatio: 0,
          maxDrawdown: 0,
          winRate: 0,
          profitFactor: 0,
          lastUpdate: Date.now()
        },
        isActive: false,
        lastRebalance: null
      });
    }
    
    this.metrics.totalStrategies = this.strategies.size;
    this.logger?.info(`Loaded ${this.strategies.size} trading strategies`);
  }

  /**
   * Start regime monitoring loop
   */
  startRegimeMonitoring() {
    setInterval(async () => {
      try {
        await this.updateMarketRegime();
      } catch (error) {
        this.logger?.error('Error in regime monitoring:', error);
      }
    }, this.config.regimeUpdateFrequency);
  }

  /**
   * Update market regime detection
   */
  async updateMarketRegime() {
    try {
      const newRegime = await this.regimeDetector.detectCurrentRegime();
      
      if (newRegime.type !== this.currentRegime.type || 
          Math.abs(newRegime.confidence - this.currentRegime.confidence) > 0.1) {
        
        const previousRegime = { ...this.currentRegime };
        this.currentRegime = {
          ...newRegime,
          duration: newRegime.type === previousRegime.type 
            ? this.currentRegime.duration + this.config.regimeUpdateFrequency
            : 0,
          lastUpdate: Date.now()
        };
        
        this.logger?.info(`Market regime changed: ${previousRegime.type} → ${newRegime.type} (confidence: ${(newRegime.confidence * 100).toFixed(1)}%)`);
        
        // Trigger regime-based rebalancing
        await this.handleRegimeChange(previousRegime, this.currentRegime);
        
        this.emit('regimeChange', {
          previous: previousRegime,
          current: this.currentRegime
        });
      }
      
    } catch (error) {
      this.logger?.error('Error updating market regime:', error);
    }
  }

  /**
   * Handle market regime changes
   */
  async handleRegimeChange(previousRegime, currentRegime) {
    try {
      // Calculate new optimal allocations based on regime
      const newAllocations = await this.calculateRegimeBasedAllocations(currentRegime);
      
      // Check if rebalancing is needed
      const rebalanceNeeded = this.shouldRebalance(newAllocations);
      
      if (rebalanceNeeded) {
        await this.executeRebalancing(newAllocations, 'REGIME_CHANGE');
      }
      
      // Update cross-asset rotation
      await this.crossAssetRotator.updateRotation(currentRegime);
      
    } catch (error) {
      this.logger?.error('Error handling regime change:', error);
    }
  }

  /**
   * Calculate optimal strategy allocations based on current regime
   */
  async calculateRegimeBasedAllocations(regime) {
    const allocations = new Map();
    let totalWeight = 0;
    
    // Score strategies based on regime preference
    const strategyScores = new Map();
    
    for (const [strategyId, strategy] of this.strategies) {
      let score = 0;
      
      // Regime preference score (40% weight)
      const regimeScore = strategy.regimePreference.includes(regime.type) ? 1.0 : 0.3;
      score += regimeScore * 0.4;
      
      // Recent performance score (30% weight)
      const performanceScore = await this.calculatePerformanceScore(strategyId);
      score += performanceScore * 0.3;
      
      // Risk-adjusted return score (20% weight)
      const riskAdjustedScore = strategy.expectedReturn / strategy.expectedVolatility;
      score += (riskAdjustedScore / 3) * 0.2; // Normalize assuming max ratio of 3
      
      // Capacity utilization score (10% weight)
      const capacityScore = Math.max(0, 1 - (strategy.currentAllocation / strategy.capacity));
      score += capacityScore * 0.1;
      
      strategyScores.set(strategyId, Math.max(score, 0));
    }
    
    // Apply regime confidence weighting
    const confidenceMultiplier = 0.5 + (regime.confidence * 0.5);
    
    // Calculate allocations using Black-Litterman inspired approach
    for (const [strategyId, score] of strategyScores) {
      const strategy = this.strategies.get(strategyId);
      
      // Base allocation from score
      let allocation = score * confidenceMultiplier;
      
      // Apply constraints
      allocation = Math.max(allocation, this.config.minStrategyWeight);
      allocation = Math.min(allocation, this.config.maxStrategyWeight);
      
      // Check correlation constraints
      allocation = await this.applyCorrelationConstraints(strategyId, allocation, allocations);
      
      allocations.set(strategyId, allocation);
      totalWeight += allocation;
    }
    
    // Normalize to sum to 1
    if (totalWeight > 0) {
      for (const [strategyId, allocation] of allocations) {
        allocations.set(strategyId, allocation / totalWeight);
      }
    }
    
    return allocations;
  }

  /**
   * Apply correlation constraints to prevent over-concentration
   */
  async applyCorrelationConstraints(strategyId, proposedAllocation, existingAllocations) {
    const strategy = this.strategies.get(strategyId);
    let adjustedAllocation = proposedAllocation;
    
    // Check correlation with already allocated strategies
    for (const [allocatedStrategyId, allocation] of existingAllocations) {
      if (allocation === 0) continue;
      
      const allocatedStrategy = this.strategies.get(allocatedStrategyId);
      const correlation = await this.calculateStrategyCorrelation(strategy, allocatedStrategy);
      
      if (correlation > this.config.correlationThreshold) {
        // Reduce allocation for highly correlated strategies
        const reductionFactor = 1 - ((correlation - this.config.correlationThreshold) * 2);
        adjustedAllocation *= Math.max(reductionFactor, 0.3);
      }
    }
    
    return adjustedAllocation;
  }

  /**
   * Calculate correlation between two strategies
   */
  async calculateStrategyCorrelation(strategy1, strategy2) {
    // Simplified correlation calculation based on asset classes and types
    let correlation = 0;
    
    // Asset class overlap
    const assetOverlap = strategy1.assetClasses.filter(asset => 
      strategy2.assetClasses.includes(asset)
    ).length;
    const maxAssets = Math.max(strategy1.assetClasses.length, strategy2.assetClasses.length);
    correlation += (assetOverlap / maxAssets) * 0.4;
    
    // Strategy type correlation
    if (strategy1.type === strategy2.type) {
      correlation += 0.3;
    }
    
    // Correlation profile
    const profileCorrelation = {
      'VERY_LOW': { 'VERY_LOW': 0.1, 'LOW': 0.2, 'MEDIUM': 0.3, 'HIGH': 0.4 },
      'LOW': { 'VERY_LOW': 0.2, 'LOW': 0.3, 'MEDIUM': 0.5, 'HIGH': 0.6 },
      'MEDIUM': { 'VERY_LOW': 0.3, 'LOW': 0.5, 'MEDIUM': 0.7, 'HIGH': 0.8 },
      'HIGH': { 'VERY_LOW': 0.4, 'LOW': 0.6, 'MEDIUM': 0.8, 'HIGH': 0.9 }
    };
    
    correlation += profileCorrelation[strategy1.correlationProfile]?.[strategy2.correlationProfile] || 0.5;
    correlation *= 0.3;
    
    return Math.min(correlation, 1.0);
  }

  /**
   * Start rebalancing loop
   */
  startRebalancing() {
    setInterval(async () => {
      try {
        await this.performScheduledRebalancing();
      } catch (error) {
        this.logger?.error('Error in scheduled rebalancing:', error);
      }
    }, this.config.rebalanceFrequency);
  }

  /**
   * Perform scheduled rebalancing
   */
  async performScheduledRebalancing() {
    try {
      // Calculate current optimal allocations
      const optimalAllocations = await this.calculateRegimeBasedAllocations(this.currentRegime);
      
      // Check if rebalancing is needed
      if (this.shouldRebalance(optimalAllocations)) {
        await this.executeRebalancing(optimalAllocations, 'SCHEDULED');
      }
      
      // Update performance metrics
      await this.updatePerformanceMetrics();
      
    } catch (error) {
      this.logger?.error('Error in scheduled rebalancing:', error);
    }
  }

  /**
   * Check if rebalancing is needed
   */
  shouldRebalance(newAllocations) {
    for (const [strategyId, newAllocation] of newAllocations) {
      const strategy = this.strategies.get(strategyId);
      const currentAllocation = strategy.currentAllocation;
      
      const allocationDiff = Math.abs(newAllocation - currentAllocation);
      
      if (allocationDiff > this.config.minAllocationChange) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * Execute rebalancing with new allocations
   */
  async executeRebalancing(newAllocations, reason) {
    try {
      const rebalanceId = `rebalance_${Date.now()}`;
      const changes = [];
      
      this.logger?.info(`Starting rebalancing: ${reason} (ID: ${rebalanceId})`);
      
      for (const [strategyId, newAllocation] of newAllocations) {
        const strategy = this.strategies.get(strategyId);
        const oldAllocation = strategy.currentAllocation;
        const change = newAllocation - oldAllocation;
        
        if (Math.abs(change) > this.config.minAllocationChange) {
          strategy.currentAllocation = newAllocation;
          strategy.lastRebalance = Date.now();
          
          // Update active status
          strategy.isActive = newAllocation > this.config.minStrategyWeight;
          
          changes.push({
            strategyId,
            strategyName: strategy.name,
            oldAllocation,
            newAllocation,
            change,
            reason
          });
          
          // Store allocation in active allocations
          this.activeAllocations.set(strategyId, {
            allocation: newAllocation,
            timestamp: Date.now(),
            reason
          });
        }
      }
      
      // Update metrics
      this.metrics.activeStrategies = Array.from(this.strategies.values())
        .filter(s => s.isActive).length;
      this.metrics.rebalanceCount++;
      this.metrics.lastRebalance = Date.now();
      
      // Emit rebalancing event
      this.emit('rebalancing', {
        id: rebalanceId,
        reason,
        changes,
        regime: this.currentRegime,
        timestamp: Date.now()
      });
      
      this.logger?.info(`Rebalancing completed: ${changes.length} strategies updated`);
      
      return {
        success: true,
        rebalanceId,
        changes,
        reason
      };
      
    } catch (error) {
      this.logger?.error('Error executing rebalancing:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate performance score for a strategy
   */
  async calculatePerformanceScore(strategyId) {
    try {
      const strategy = this.strategies.get(strategyId);
      if (!strategy || strategy.performance.returns.length === 0) {
        return 0.5; // Default neutral score
      }

      const returns = strategy.performance.returns.slice(-30); // Last 30 periods

      // Calculate metrics
      const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
      const volatility = this.calculateVolatility(returns);
      const sharpeRatio = volatility > 0 ? avgReturn / volatility : 0;
      const maxDrawdown = this.calculateMaxDrawdown(returns);

      // Composite score (0-1 scale)
      let score = 0.5; // Base score

      // Return component (30%)
      score += Math.min(avgReturn * 10, 0.3); // Cap at 30% contribution

      // Sharpe ratio component (40%)
      score += Math.min(sharpeRatio / 3, 0.4); // Normalize assuming max Sharpe of 3

      // Drawdown penalty (30%)
      score -= Math.min(maxDrawdown * 3, 0.3); // Penalty for drawdowns

      return Math.max(0, Math.min(score, 1));

    } catch (error) {
      this.logger?.error('Error calculating performance score:', error);
      return 0.5;
    }
  }

  /**
   * Calculate volatility of returns
   */
  calculateVolatility(returns) {
    if (returns.length < 2) return 0;

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (returns.length - 1);

    return Math.sqrt(variance);
  }

  /**
   * Calculate maximum drawdown
   */
  calculateMaxDrawdown(returns) {
    if (returns.length === 0) return 0;

    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;

    for (const ret of returns) {
      cumulative += ret;
      peak = Math.max(peak, cumulative);
      const drawdown = (peak - cumulative) / Math.max(peak, 1);
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }

    return maxDrawdown;
  }

  /**
   * Start performance tracking
   */
  startPerformanceTracking() {
    setInterval(async () => {
      try {
        await this.updatePerformanceMetrics();
      } catch (error) {
        this.logger?.error('Error in performance tracking:', error);
      }
    }, 300000); // Every 5 minutes
  }

  /**
   * Update performance metrics
   */
  async updatePerformanceMetrics() {
    try {
      let portfolioReturn = 0;
      let portfolioVolatility = 0;
      let totalAllocatedCapital = 0;

      // Calculate portfolio-level metrics
      for (const [strategyId, strategy] of this.strategies) {
        if (strategy.isActive && strategy.currentAllocation > 0) {
          const strategyReturn = strategy.performance.returns.slice(-1)[0] || 0;
          portfolioReturn += strategyReturn * strategy.currentAllocation;

          const strategyCapital = strategy.currentAllocation * 100000000; // Assume $100M total
          totalAllocatedCapital += strategyCapital;
        }
      }

      // Update metrics
      this.metrics.portfolioReturn = portfolioReturn;
      this.metrics.totalAllocatedCapital = totalAllocatedCapital;

      // Calculate Sharpe ratio and other metrics
      const performanceHistory = this.performanceHistory.get('portfolio') || [];
      if (performanceHistory.length > 0) {
        const returns = performanceHistory.map(p => p.return);
        this.metrics.portfolioVolatility = this.calculateVolatility(returns);
        this.metrics.sharpeRatio = this.metrics.portfolioVolatility > 0
          ? this.metrics.portfolioReturn / this.metrics.portfolioVolatility
          : 0;
        this.metrics.maxDrawdown = this.calculateMaxDrawdown(returns);
      }

      // Store performance snapshot
      performanceHistory.push({
        timestamp: Date.now(),
        return: portfolioReturn,
        volatility: this.metrics.portfolioVolatility,
        sharpeRatio: this.metrics.sharpeRatio,
        regime: this.currentRegime.type,
        activeStrategies: this.metrics.activeStrategies
      });

      // Keep only last 1000 snapshots
      if (performanceHistory.length > 1000) {
        performanceHistory.splice(0, performanceHistory.length - 1000);
      }

      this.performanceHistory.set('portfolio', performanceHistory);

    } catch (error) {
      this.logger?.error('Error updating performance metrics:', error);
    }
  }

  /**
   * Setup event handlers
   */
  setupEventHandlers() {
    // Handle regime detector events
    this.regimeDetector.on('regimeUpdate', (regime) => {
      this.emit('regimeUpdate', regime);
    });

    // Handle strategy allocator events
    this.strategyAllocator.on('allocationUpdate', (allocation) => {
      this.emit('allocationUpdate', allocation);
    });

    // Handle cross-asset rotator events
    this.crossAssetRotator.on('rotationUpdate', (rotation) => {
      this.emit('rotationUpdate', rotation);
    });
  }

  /**
   * Get current orchestration status
   */
  getOrchestrationStatus() {
    const activeStrategies = Array.from(this.strategies.values())
      .filter(s => s.isActive)
      .map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        allocation: s.currentAllocation,
        performance: s.performance,
        lastRebalance: s.lastRebalance
      }));

    return {
      regime: this.currentRegime,
      strategies: {
        total: this.strategies.size,
        active: activeStrategies.length,
        allocations: activeStrategies
      },
      performance: this.metrics,
      lastUpdate: Date.now()
    };
  }

  /**
   * Get strategy performance analytics
   */
  getStrategyAnalytics(strategyId) {
    const strategy = this.strategies.get(strategyId);
    if (!strategy) return null;

    const performanceHistory = this.performanceHistory.get(strategyId) || [];

    return {
      strategy: {
        id: strategy.id,
        name: strategy.name,
        type: strategy.type,
        assetClasses: strategy.assetClasses,
        currentAllocation: strategy.currentAllocation,
        isActive: strategy.isActive
      },
      performance: {
        ...strategy.performance,
        history: performanceHistory.slice(-100) // Last 100 data points
      },
      regimePerformance: this.calculateRegimePerformance(strategyId),
      riskMetrics: this.calculateRiskMetrics(strategyId)
    };
  }

  /**
   * Calculate regime-specific performance
   */
  calculateRegimePerformance(strategyId) {
    const performanceHistory = this.performanceHistory.get(strategyId) || [];
    const regimePerformance = {};

    for (const snapshot of performanceHistory) {
      const regime = snapshot.regime || 'UNKNOWN';

      if (!regimePerformance[regime]) {
        regimePerformance[regime] = {
          returns: [],
          count: 0,
          avgReturn: 0,
          volatility: 0,
          sharpeRatio: 0
        };
      }

      regimePerformance[regime].returns.push(snapshot.return);
      regimePerformance[regime].count++;
    }

    // Calculate metrics for each regime
    for (const [regime, data] of Object.entries(regimePerformance)) {
      if (data.returns.length > 0) {
        data.avgReturn = data.returns.reduce((sum, r) => sum + r, 0) / data.returns.length;
        data.volatility = this.calculateVolatility(data.returns);
        data.sharpeRatio = data.volatility > 0 ? data.avgReturn / data.volatility : 0;
      }
    }

    return regimePerformance;
  }

  /**
   * Calculate risk metrics for strategy
   */
  calculateRiskMetrics(strategyId) {
    const strategy = this.strategies.get(strategyId);
    if (!strategy || strategy.performance.returns.length === 0) {
      return {
        var95: 0,
        var99: 0,
        expectedShortfall: 0,
        beta: 0,
        trackingError: 0
      };
    }

    const returns = strategy.performance.returns;
    const sortedReturns = [...returns].sort((a, b) => a - b);

    // Value at Risk (95% and 99%)
    const var95Index = Math.floor(returns.length * 0.05);
    const var99Index = Math.floor(returns.length * 0.01);

    const var95 = sortedReturns[var95Index] || 0;
    const var99 = sortedReturns[var99Index] || 0;

    // Expected Shortfall (average of worst 5% returns)
    const worstReturns = sortedReturns.slice(0, var95Index + 1);
    const expectedShortfall = worstReturns.length > 0
      ? worstReturns.reduce((sum, r) => sum + r, 0) / worstReturns.length
      : 0;

    return {
      var95: Math.abs(var95),
      var99: Math.abs(var99),
      expectedShortfall: Math.abs(expectedShortfall),
      beta: this.calculateBeta(strategyId),
      trackingError: this.calculateTrackingError(strategyId)
    };
  }

  /**
   * Calculate beta relative to portfolio
   */
  calculateBeta(strategyId) {
    // Simplified beta calculation
    const strategy = this.strategies.get(strategyId);
    const portfolioHistory = this.performanceHistory.get('portfolio') || [];

    if (!strategy || strategy.performance.returns.length < 10 || portfolioHistory.length < 10) {
      return 1.0; // Default beta
    }

    // Use correlation and volatility ratio as proxy for beta
    const strategyVol = this.calculateVolatility(strategy.performance.returns);
    const portfolioVol = this.calculateVolatility(portfolioHistory.map(p => p.return));

    if (portfolioVol === 0) return 1.0;

    // Simplified beta calculation
    return strategyVol / portfolioVol;
  }

  /**
   * Calculate tracking error
   */
  calculateTrackingError(strategyId) {
    const strategy = this.strategies.get(strategyId);
    const portfolioHistory = this.performanceHistory.get('portfolio') || [];

    if (!strategy || strategy.performance.returns.length === 0 || portfolioHistory.length === 0) {
      return 0;
    }

    // Calculate difference in returns
    const minLength = Math.min(strategy.performance.returns.length, portfolioHistory.length);
    const differences = [];

    for (let i = 0; i < minLength; i++) {
      const strategyReturn = strategy.performance.returns[strategy.performance.returns.length - 1 - i];
      const portfolioReturn = portfolioHistory[portfolioHistory.length - 1 - i].return;
      differences.push(strategyReturn - portfolioReturn);
    }

    return this.calculateVolatility(differences);
  }

  /**
   * Force rebalancing with custom allocations
   */
  async forceRebalancing(customAllocations, reason = 'MANUAL') {
    try {
      // Validate allocations
      const totalAllocation = Array.from(customAllocations.values())
        .reduce((sum, allocation) => sum + allocation, 0);

      if (Math.abs(totalAllocation - 1.0) > 0.01) {
        throw new Error('Allocations must sum to 1.0');
      }

      // Execute rebalancing
      return await this.executeRebalancing(customAllocations, reason);

    } catch (error) {
      this.logger?.error('Error in forced rebalancing:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get orchestration metrics for monitoring
   */
  getOrchestrationMetrics() {
    return {
      ...this.metrics,
      regime: this.currentRegime,
      strategies: {
        total: this.strategies.size,
        active: Array.from(this.strategies.values()).filter(s => s.isActive).length,
        byType: this.getStrategyCountByType(),
        byRegimePreference: this.getStrategyCountByRegimePreference()
      },
      allocations: Array.from(this.activeAllocations.entries()).map(([id, allocation]) => ({
        strategyId: id,
        allocation: allocation.allocation,
        timestamp: allocation.timestamp,
        reason: allocation.reason
      })),
      lastUpdate: Date.now()
    };
  }

  /**
   * Get strategy count by type
   */
  getStrategyCountByType() {
    const counts = { AI: 0, TRADITIONAL: 0, HYBRID: 0 };

    for (const strategy of this.strategies.values()) {
      if (strategy.isActive) {
        counts[strategy.type] = (counts[strategy.type] || 0) + 1;
      }
    }

    return counts;
  }

  /**
   * Get strategy count by regime preference
   */
  getStrategyCountByRegimePreference() {
    const counts = {};

    for (const strategy of this.strategies.values()) {
      if (strategy.isActive) {
        for (const regime of strategy.regimePreference) {
          counts[regime] = (counts[regime] || 0) + 1;
        }
      }
    }

    return counts;
  }
}

module.exports = MultiStrategyOrchestrator;
