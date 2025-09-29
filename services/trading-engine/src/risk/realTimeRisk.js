// src/risk/realTimeRisk.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class RealTimeRisk extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.positionService = options.positionService;
    this.marketDataService = options.marketDataService;
    
    // Real-time monitoring configuration
    this.config = {
      monitoringInterval: 1000,      // 1 second
      alertThresholds: {
        portfolioLoss: 0.05,         // 5% portfolio loss
        positionLoss: 0.10,          // 10% position loss
        leverageRatio: 8.0,          // 8x leverage
        marginUsage: 0.90,           // 90% margin usage
        concentrationRisk: 0.30      // 30% concentration
      },
      circuitBreakers: {
        dailyLossLimit: 0.15,        // 15% daily loss limit
        stopTradingOnBreach: true,   // Stop trading on breach
        cooldownPeriod: 300000       // 5 minutes cooldown
      }
    };
    
    // Risk monitoring state
    this.isMonitoring = false;
    this.monitoringTimer = null;
    this.riskAlerts = new Map();
    this.circuitBreakerStatus = new Map();
    
    // Real-time metrics
    this.riskMetrics = new Map();
    this.lastUpdateTime = null;
    
    // Performance tracking
    this.stats = {
      totalAlerts: 0,
      criticalAlerts: 0,
      circuitBreakerActivations: 0,
      avgCalculationTime: 0,
      monitoringUptime: 0,
      startTime: null
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing RealTimeRisk...');
      
      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize risk metrics
      await this.initializeRiskMetrics();
      
      this.logger?.info('RealTimeRisk initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize RealTimeRisk:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Listen for trade executions
    this.on('trade_executed', (trade) => {
      this.handleTradeExecution(trade);
    });
    
    // Listen for position updates
    this.on('position_updated', (position) => {
      this.handlePositionUpdate(position);
    });
    
    // Listen for market data updates
    this.on('market_data_updated', (marketData) => {
      this.handleMarketDataUpdate(marketData);
    });
  }

  async startMonitoring(userIds = []) {
    if (this.isMonitoring) {
      this.logger?.warn('Real-time risk monitoring already started');
      return;
    }
    
    this.isMonitoring = true;
    this.stats.startTime = new Date();
    
    // Start monitoring loop
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.performRiskMonitoring(userIds);
      } catch (error) {
        this.logger?.error('Error in risk monitoring loop:', error);
      }
    }, this.config.monitoringInterval);
    
    this.logger?.info(`Real-time risk monitoring started for ${userIds.length || 'all'} users`);
  }

  async stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }
    
    this.isMonitoring = false;
    
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
    
    // Calculate uptime
    if (this.stats.startTime) {
      this.stats.monitoringUptime += Date.now() - this.stats.startTime.getTime();
    }
    
    this.logger?.info('Real-time risk monitoring stopped');
  }

  async performRiskMonitoring(userIds) {
    const startTime = process.hrtime.bigint();
    
    try {
      const users = userIds.length > 0 ? userIds : await this.getActiveUsers();
      
      for (const userId of users) {
        await this.monitorUserRisk(userId);
      }
      
      // Update performance metrics
      const calculationTime = Number(process.hrtime.bigint() - startTime) / 1000000;
      this.updateCalculationTime(calculationTime);
      
      this.lastUpdateTime = new Date();
      
    } catch (error) {
      this.logger?.error('Error in risk monitoring cycle:', error);
    }
  }

  async monitorUserRisk(userId) {
    try {
      // Get current portfolio state
      const portfolio = await this.getPortfolioState(userId);
      
      // Calculate real-time risk metrics
      const riskMetrics = await this.calculateRiskMetrics(portfolio, userId);
      
      // Store metrics
      this.riskMetrics.set(userId, riskMetrics);
      
      // Check for risk alerts
      const alerts = this.checkRiskAlerts(userId, riskMetrics);
      
      // Process alerts
      for (const alert of alerts) {
        await this.processRiskAlert(userId, alert);
      }
      
      // Check circuit breakers
      await this.checkCircuitBreakers(userId, riskMetrics);
      
    } catch (error) {
      this.logger?.error(`Error monitoring risk for user ${userId}:`, error);
    }
  }

  async calculateRiskMetrics(portfolio, userId) {
    const metrics = {
      timestamp: new Date(),
      portfolioValue: portfolio.totalValue,
      totalPnL: portfolio.totalPnL,
      dayPnL: portfolio.dayPnL,
      dayPnLPercent: portfolio.totalValue > 0 ? portfolio.dayPnL / portfolio.totalValue : 0,
      leverage: portfolio.leverage,
      marginUsage: portfolio.marginUsage,
      concentrationRisk: await this.calculateConcentrationRisk(portfolio),
      var95: await this.calculateVaR(portfolio, 0.95),
      liquidityRisk: await this.calculateLiquidityRisk(portfolio),
      positionRisks: await this.calculatePositionRisks(portfolio)
    };
    
    // Calculate risk score
    metrics.riskScore = this.calculateOverallRiskScore(metrics);
    
    return metrics;
  }

  async calculateConcentrationRisk(portfolio) {
    if (portfolio.totalValue <= 0) return 0;
    
    const positionValues = Object.values(portfolio.positions).map(pos => Math.abs(pos.value));
    const maxPosition = Math.max(...positionValues);
    
    return maxPosition / portfolio.totalValue;
  }

  async calculateVaR(portfolio, confidenceLevel) {
    // Simplified VaR calculation
    const volatility = 0.02; // 2% daily volatility assumption
    const zScore = confidenceLevel === 0.95 ? 1.645 : 2.326;
    
    return portfolio.totalValue * volatility * zScore;
  }

  async calculateLiquidityRisk(portfolio) {
    // Mock liquidity calculation
    let liquidityScore = 0;
    let totalValue = 0;
    
    for (const [symbol, position] of Object.entries(portfolio.positions)) {
      const marketData = await this.getMarketData(symbol);
      const positionValue = Math.abs(position.value);
      const liquidityMultiplier = this.getAssetLiquidityScore(symbol, marketData);
      
      liquidityScore += positionValue * liquidityMultiplier;
      totalValue += positionValue;
    }
    
    return totalValue > 0 ? liquidityScore / totalValue : 1.0;
  }

  async calculatePositionRisks(portfolio) {
    const positionRisks = {};
    
    for (const [symbol, position] of Object.entries(portfolio.positions)) {
      const marketData = await this.getMarketData(symbol);
      
      positionRisks[symbol] = {
        value: position.value,
        pnl: position.unrealizedPnL,
        pnlPercent: position.avgPrice > 0 ? position.unrealizedPnL / (position.quantity * position.avgPrice) : 0,
        volatility: marketData.volatility || 0.25,
        beta: marketData.beta || 1.0,
        liquidityScore: this.getAssetLiquidityScore(symbol, marketData)
      };
    }
    
    return positionRisks;
  }

  getAssetLiquidityScore(symbol, marketData) {
    // Simple liquidity scoring based on volume and spread
    const volumeScore = Math.min(marketData.avgDailyVolume / 1000000, 1.0); // Normalize to $1M
    const spreadScore = Math.max(0, 1 - (marketData.spread || 0.01) / 0.05); // 5% spread = 0 score
    
    return (volumeScore + spreadScore) / 2;
  }

  calculateOverallRiskScore(metrics) {
    const weights = {
      dayPnLPercent: 0.3,
      leverage: 0.2,
      concentrationRisk: 0.2,
      marginUsage: 0.15,
      liquidityRisk: 0.15
    };
    
    let score = 0;
    
    // Day P&L component (higher loss = higher risk)
    score += Math.abs(Math.min(metrics.dayPnLPercent, 0)) * weights.dayPnLPercent * 100;
    
    // Leverage component
    score += (metrics.leverage / 10) * weights.leverage * 100;
    
    // Concentration component
    score += metrics.concentrationRisk * weights.concentrationRisk * 100;
    
    // Margin usage component
    score += metrics.marginUsage * weights.marginUsage * 100;
    
    // Liquidity risk component (lower liquidity = higher risk)
    score += (1 - metrics.liquidityRisk) * weights.liquidityRisk * 100;
    
    return Math.min(score, 100); // Cap at 100
  }

  checkRiskAlerts(userId, metrics) {
    const alerts = [];
    const thresholds = this.config.alertThresholds;
    
    // Portfolio loss alert
    if (metrics.dayPnLPercent < -thresholds.portfolioLoss) {
      alerts.push({
        type: 'portfolio_loss',
        severity: 'high',
        message: `Portfolio down ${(metrics.dayPnLPercent * 100).toFixed(2)}%`,
        value: metrics.dayPnLPercent,
        threshold: -thresholds.portfolioLoss
      });
    }
    
    // Leverage alert
    if (metrics.leverage > thresholds.leverageRatio) {
      alerts.push({
        type: 'high_leverage',
        severity: 'medium',
        message: `Leverage ${metrics.leverage.toFixed(2)}x exceeds threshold`,
        value: metrics.leverage,
        threshold: thresholds.leverageRatio
      });
    }
    
    // Margin usage alert
    if (metrics.marginUsage > thresholds.marginUsage) {
      alerts.push({
        type: 'high_margin_usage',
        severity: 'medium',
        message: `Margin usage ${(metrics.marginUsage * 100).toFixed(1)}% is high`,
        value: metrics.marginUsage,
        threshold: thresholds.marginUsage
      });
    }
    
    // Concentration risk alert
    if (metrics.concentrationRisk > thresholds.concentrationRisk) {
      alerts.push({
        type: 'concentration_risk',
        severity: 'medium',
        message: `Position concentration ${(metrics.concentrationRisk * 100).toFixed(1)}% is high`,
        value: metrics.concentrationRisk,
        threshold: thresholds.concentrationRisk
      });
    }
    
    // Position-specific alerts
    Object.entries(metrics.positionRisks).forEach(([symbol, risk]) => {
      if (risk.pnlPercent < -thresholds.positionLoss) {
        alerts.push({
          type: 'position_loss',
          severity: 'medium',
          symbol,
          message: `${symbol} position down ${(risk.pnlPercent * 100).toFixed(2)}%`,
          value: risk.pnlPercent,
          threshold: -thresholds.positionLoss
        });
      }
    });
    
    return alerts;
  }

  async processRiskAlert(userId, alert) {
    const alertKey = `${userId}_${alert.type}_${alert.symbol || 'portfolio'}`;
    const now = Date.now();
    
    // Check if alert was recently sent (avoid spam)
    const lastAlert = this.riskAlerts.get(alertKey);
    if (lastAlert && now - lastAlert < 60000) { // 1 minute cooldown
      return;
    }
    
    // Store alert timestamp
    this.riskAlerts.set(alertKey, now);
    
    // Emit alert event
    this.emit('risk_alert', {
      userId,
      alert,
      timestamp: new Date()
    });
    
    // Update statistics
    this.stats.totalAlerts++;
    if (alert.severity === 'high') {
      this.stats.criticalAlerts++;
    }
    
    this.logger?.warn(`Risk alert for user ${userId}:`, alert);
  }

  async checkCircuitBreakers(userId, metrics) {
    const breakers = this.config.circuitBreakers;
    
    // Daily loss circuit breaker
    if (metrics.dayPnLPercent < -breakers.dailyLossLimit) {
      await this.activateCircuitBreaker(userId, {
        type: 'daily_loss_limit',
        severity: 'critical',
        message: `Daily loss ${(metrics.dayPnLPercent * 100).toFixed(2)}% exceeds limit`,
        value: metrics.dayPnLPercent,
        limit: -breakers.dailyLossLimit,
        action: breakers.stopTradingOnBreach ? 'stop_trading' : 'alert_only'
      });
    }
  }

  async activateCircuitBreaker(userId, breaker) {
    const breakerKey = `${userId}_${breaker.type}`;
    const now = Date.now();
    
    // Check if circuit breaker is already active
    const existingBreaker = this.circuitBreakerStatus.get(breakerKey);
    if (existingBreaker && now - existingBreaker.activatedAt < this.config.circuitBreakers.cooldownPeriod) {
      return; // Still in cooldown
    }
    
    // Activate circuit breaker
    this.circuitBreakerStatus.set(breakerKey, {
      ...breaker,
      activatedAt: now,
      active: true
    });
    
    // Emit circuit breaker event
    this.emit('circuit_breaker_activated', {
      userId,
      breaker,
      timestamp: new Date()
    });
    
    // Update statistics
    this.stats.circuitBreakerActivations++;
    
    this.logger?.error(`Circuit breaker activated for user ${userId}:`, breaker);
    
    // Take action if configured
    if (breaker.action === 'stop_trading') {
      this.emit('stop_trading', { userId, reason: breaker.message });
    }
  }

  async handleTradeExecution(trade) {
    // Update real-time metrics after trade execution
    const userId = trade.userId;
    if (userId) {
      const portfolio = await this.getPortfolioState(userId);
      const metrics = await this.calculateRiskMetrics(portfolio, userId);
      this.riskMetrics.set(userId, metrics);
      
      // Check for immediate risk concerns
      const alerts = this.checkRiskAlerts(userId, metrics);
      for (const alert of alerts) {
        await this.processRiskAlert(userId, alert);
      }
    }
  }

  async handlePositionUpdate(position) {
    // Similar to trade execution handling
    const userId = position.userId;
    if (userId) {
      // Trigger risk recalculation
      const portfolio = await this.getPortfolioState(userId);
      const metrics = await this.calculateRiskMetrics(portfolio, userId);
      this.riskMetrics.set(userId, metrics);
    }
  }

  async handleMarketDataUpdate(marketData) {
    // Recalculate risk for users with positions in this symbol
    const affectedUsers = await this.getUsersWithPosition(marketData.symbol);
    
    for (const userId of affectedUsers) {
      const portfolio = await this.getPortfolioState(userId);
      const metrics = await this.calculateRiskMetrics(portfolio, userId);
      this.riskMetrics.set(userId, metrics);
    }
  }

  updateCalculationTime(calculationTime) {
    const totalCalculations = this.stats.totalAlerts + this.stats.criticalAlerts + 1;
    const totalTime = this.stats.avgCalculationTime * (totalCalculations - 1) + calculationTime;
    this.stats.avgCalculationTime = totalTime / totalCalculations;
  }

  // Helper methods - would integrate with actual services
  async getActiveUsers() {
    return ['user1', 'user2', 'user3']; // Mock user IDs
  }

  async getPortfolioState(userId) {
    // Mock portfolio state
    return {
      userId,
      totalValue: 100000,
      totalPnL: 5000,
      dayPnL: -2000,
      leverage: 2.5,
      marginUsage: 0.6,
      positions: {
        'AAPL': {
          quantity: 100,
          avgPrice: 150,
          value: 15000,
          unrealizedPnL: 500
        },
        'GOOGL': {
          quantity: 10,
          avgPrice: 2500,
          value: 25000,
          unrealizedPnL: -1000
        }
      }
    };
  }

  async getMarketData(symbol) {
    // Mock market data
    return {
      symbol,
      lastPrice: 150,
      avgDailyVolume: 75000000,
      spread: 0.05,
      volatility: 0.25,
      beta: 1.2
    };
  }

  async getUsersWithPosition(symbol) {
    return ['user1', 'user2']; // Mock users with positions
  }

  // Public API methods
  getRiskMetrics(userId) {
    return this.riskMetrics.get(userId);
  }

  getAllRiskMetrics() {
    return Object.fromEntries(this.riskMetrics);
  }

  getCircuitBreakerStatus(userId) {
    const userBreakers = {};
    this.circuitBreakerStatus.forEach((breaker, key) => {
      if (key.startsWith(`${userId}_`)) {
        userBreakers[breaker.type] = breaker;
      }
    });
    return userBreakers;
  }

  getStats() {
    const uptime = this.stats.startTime ? 
      this.stats.monitoringUptime + (Date.now() - this.stats.startTime.getTime()) :
      this.stats.monitoringUptime;
    
    return {
      ...this.stats,
      isMonitoring: this.isMonitoring,
      monitoringUptime: uptime,
      lastUpdateTime: this.lastUpdateTime,
      activeUsers: this.riskMetrics.size,
      activeCircuitBreakers: this.circuitBreakerStatus.size
    };
  }

  updateConfiguration(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    
    this.logger?.info('Real-time risk configuration updated:', newConfig);
  }
}

module.exports = RealTimeRisk;