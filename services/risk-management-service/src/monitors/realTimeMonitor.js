// src/monitors/realTimeMonitor.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class RealTimeMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    this.io = options.io;
    this.isRunning = false;
    
    // Monitoring configuration
    this.config = {
      monitoringInterval: 5000,    // 5 seconds
      alertThresholds: {
        var95Breach: 1.5,          // 1.5x VaR limit
        leverageBreach: 1.2,       // 1.2x leverage limit
        concentrationBreach: 1.3,   // 1.3x concentration limit
        liquidityBreach: 0.7       // 70% of liquidity threshold
      },
      windowSize: 100,             // Keep last 100 measurements
      emergencyThresholds: {
        portfolioLoss: 0.15,       // 15% portfolio loss
        var95Multiple: 3.0,        // 3x VaR breach
        leverageMultiple: 2.0      // 2x leverage breach
      }
    };
    
    // Data storage for monitoring
    this.monitoringData = new Map(); // portfolioId -> monitoring data
    this.alertHistory = [];
    this.lastMonitoringRun = null;
  }

  async initialize() {
    try {
      this.logger?.info('Initializing RealTimeMonitor...');
      this.isRunning = true;
      this.startMonitoring();
      this.logger?.info('RealTimeMonitor initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize RealTimeMonitor:', error);
      throw error;
    }
  }

  startMonitoring() {
    setInterval(async () => {
      if (this.isRunning) {
        try {
          await this.performMonitoringCycle();
        } catch (error) {
          this.logger?.error('Error in monitoring cycle:', error);
        }
      }
    }, this.config.monitoringInterval);
    
    this.logger?.info('Real-time risk monitoring started');
  }

  async performMonitoringCycle() {
    const startTime = Date.now();
    
    try {
      // Get list of portfolios to monitor
      const portfolios = await this.getActivePortfolios();
      
      const monitoringResults = [];
      
      for (const portfolio of portfolios) {
        const result = await this.monitorPortfolio(portfolio);
        monitoringResults.push(result);
        
        // Check for alerts
        await this.checkAlerts(portfolio.id, result);
        
        // Update metrics
        this.updateMonitoringMetrics(portfolio.id, result);
      }
      
      this.lastMonitoringRun = new Date();
      
      // Emit monitoring update
      this.emit('monitoring_cycle_complete', {
        portfolios: monitoringResults.length,
        alerts: monitoringResults.filter(r => r.alerts.length > 0).length,
        duration: Date.now() - startTime,
        timestamp: new Date()
      });
      
    } catch (error) {
      this.logger?.error('Error in monitoring cycle:', error);
      this.emit('monitoring_error', error);
    }
  }

  async monitorPortfolio(portfolio) {
    try {
      const portfolioId = portfolio.id;
      
      // Get current portfolio state
      const positions = await this.getPortfolioPositions(portfolioId);
      const portfolioValue = this.calculatePortfolioValue(positions);
      
      // Calculate current risk metrics
      const riskMetrics = await this.calculateCurrentRiskMetrics(positions, portfolioValue);
      
      // Get risk limits
      const riskLimits = await this.getRiskLimits(portfolioId);
      
      // Check for limit breaches
      const breaches = this.checkLimitBreaches(riskMetrics, riskLimits);
      
      // Calculate risk trends
      const trends = this.calculateRiskTrends(portfolioId, riskMetrics);
      
      // Generate alerts
      const alerts = this.generateAlerts(portfolioId, breaches, trends, riskMetrics);
      
      // Store monitoring data
      this.storeMonitoringData(portfolioId, {
        timestamp: new Date(),
        portfolioValue,
        riskMetrics,
        breaches,
        trends,
        alerts
      });
      
      // Emit real-time updates via WebSocket
      if (this.io) {
        this.io.to(`portfolio_risk_${portfolioId}`).emit('risk_update', {
          portfolioId,
          riskMetrics,
          breaches,
          alerts,
          timestamp: new Date()
        });
      }
      
      return {
        portfolioId,
        portfolioValue,
        riskMetrics,
        breaches,
        trends,
        alerts
      };
      
    } catch (error) {
      this.logger?.error(`Error monitoring portfolio ${portfolio.id}:`, error);
      return {
        portfolioId: portfolio.id,
        error: error.message,
        alerts: [{
          type: 'monitoring_error',
          severity: 'high',
          message: 'Failed to monitor portfolio risk'
        }]
      };
    }
  }

  async calculateCurrentRiskMetrics(positions, portfolioValue) {
    // Calculate key risk metrics in real-time
    const totalExposure = positions.reduce((sum, pos) => 
      sum + Math.abs(parseFloat(pos.marketValue || 0)), 0
    );
    
    const leverage = portfolioValue > 0 ? totalExposure / portfolioValue : 0;
    
    // Calculate concentration (largest position)
    let maxPosition = 0;
    let maxPositionSymbol = '';
    positions.forEach(pos => {
      const posValue = Math.abs(parseFloat(pos.marketValue || 0));
      if (posValue > maxPosition) {
        maxPosition = posValue;
        maxPositionSymbol = pos.symbol;
      }
    });
    
    const concentration = portfolioValue > 0 ? maxPosition / portfolioValue : 0;
    
    // Estimate current P&L
    const dayPnL = positions.reduce((sum, pos) => {
      const unrealizedPnL = parseFloat(pos.unrealizedPnL || 0);
      return sum + unrealizedPnL;
    }, 0);
    
    const dayPnLPercent = portfolioValue > 0 ? dayPnL / portfolioValue : 0;
    
    // Quick VaR estimate (would use full calculation for accuracy)
    const portfolioVolatility = await this.estimatePortfolioVolatility(positions);
    const estimatedVaR = portfolioValue * portfolioVolatility * 1.645; // 95% VaR
    
    return {
      portfolioValue,
      totalExposure,
      leverage,
      concentration,
      maxPositionSymbol,
      dayPnL,
      dayPnLPercent,
      estimatedVaR,
      volatility: portfolioVolatility,
      positionCount: positions.length
    };
  }

  checkLimitBreaches(riskMetrics, riskLimits) {
    const breaches = [];
    
    // Leverage breach
    if (riskMetrics.leverage > riskLimits.maxLeverage) {
      breaches.push({
        type: 'leverage_breach',
        current: riskMetrics.leverage,
        limit: riskLimits.maxLeverage,
        severity: this.calculateBreachSeverity(riskMetrics.leverage, riskLimits.maxLeverage),
        multiple: riskMetrics.leverage / riskLimits.maxLeverage
      });
    }
    
    // Concentration breach
    if (riskMetrics.concentration > riskLimits.maxConcentration) {
      breaches.push({
        type: 'concentration_breach',
        current: riskMetrics.concentration,
        limit: riskLimits.maxConcentration,
        severity: this.calculateBreachSeverity(riskMetrics.concentration, riskLimits.maxConcentration),
        symbol: riskMetrics.maxPositionSymbol
      });
    }
    
    // VaR breach
    if (riskMetrics.estimatedVaR > riskLimits.maxVaR) {
      breaches.push({
        type: 'var_breach',
        current: riskMetrics.estimatedVaR,
        limit: riskLimits.maxVaR,
        severity: this.calculateBreachSeverity(riskMetrics.estimatedVaR, riskLimits.maxVaR),
        multiple: riskMetrics.estimatedVaR / riskLimits.maxVaR
      });
    }
    
    // Daily loss breach
    if (Math.abs(riskMetrics.dayPnLPercent) > riskLimits.maxDailyLoss) {
      breaches.push({
        type: 'daily_loss_breach',
        current: Math.abs(riskMetrics.dayPnLPercent),
        limit: riskLimits.maxDailyLoss,
        severity: this.calculateBreachSeverity(Math.abs(riskMetrics.dayPnLPercent), riskLimits.maxDailyLoss),
        pnl: riskMetrics.dayPnL
      });
    }
    
    return breaches;
  }

  calculateBreachSeverity(current, limit) {
    const multiple = current / limit;
    
    if (multiple >= 2.0) return 'critical';
    if (multiple >= 1.5) return 'high';
    if (multiple >= 1.2) return 'medium';
    return 'low';
  }

  calculateRiskTrends(portfolioId, currentMetrics) {
    const historicalData = this.monitoringData.get(portfolioId) || [];
    
    if (historicalData.length < 2) {
      return {
        leverage: 'stable',
        concentration: 'stable',
        var: 'stable',
        pnl: 'stable'
      };
    }
    
    const previous = historicalData[historicalData.length - 1].riskMetrics;
    
    return {
      leverage: this.calculateTrend(previous.leverage, currentMetrics.leverage),
      concentration: this.calculateTrend(previous.concentration, currentMetrics.concentration),
      var: this.calculateTrend(previous.estimatedVaR, currentMetrics.estimatedVaR),
      pnl: this.calculateTrend(previous.dayPnLPercent, currentMetrics.dayPnLPercent)
    };
  }

  calculateTrend(previous, current) {
    const changePercent = previous !== 0 ? (current - previous) / Math.abs(previous) : 0;
    
    if (Math.abs(changePercent) < 0.05) return 'stable';
    return changePercent > 0 ? 'increasing' : 'decreasing';
  }

  generateAlerts(portfolioId, breaches, trends, riskMetrics) {
    const alerts = [];
    
    // Breach alerts
    breaches.forEach(breach => {
      alerts.push({
        type: 'limit_breach',
        subType: breach.type,
        severity: breach.severity,
        message: this.generateBreachMessage(breach),
        portfolioId,
        timestamp: new Date(),
        data: breach
      });
    });
    
    // Trend alerts
    if (trends.leverage === 'increasing' && riskMetrics.leverage > 0.8) {
      alerts.push({
        type: 'trend_alert',
        subType: 'leverage_trend',
        severity: 'medium',
        message: 'Leverage trending upward and approaching limits',
        portfolioId,
        timestamp: new Date()
      });
    }
    
    // Emergency alerts
    if (riskMetrics.dayPnLPercent < -this.config.emergencyThresholds.portfolioLoss) {
      alerts.push({
        type: 'emergency',
        subType: 'large_loss',
        severity: 'critical',
        message: `Portfolio loss exceeds ${this.config.emergencyThresholds.portfolioLoss * 100}%`,
        portfolioId,
        timestamp: new Date(),
        requiresImmediateAction: true
      });
    }
    
    return alerts;
  }

  generateBreachMessage(breach) {
    const percentage = ((breach.current / breach.limit - 1) * 100).toFixed(1);
    
    switch (breach.type) {
      case 'leverage_breach':
        return `Leverage ${breach.current.toFixed(2)}x exceeds limit ${breach.limit.toFixed(2)}x (+${percentage}%)`;
      case 'concentration_breach':
        return `Position concentration ${(breach.current * 100).toFixed(1)}% exceeds limit ${(breach.limit * 100).toFixed(1)}% (+${percentage}%) for ${breach.symbol}`;
      case 'var_breach':
        return `VaR ${breach.current.toFixed(0)} exceeds limit ${breach.limit.toFixed(0)} (+${percentage}%)`;
      case 'daily_loss_breach':
        return `Daily loss ${(breach.current * 100).toFixed(2)}% exceeds limit ${(breach.limit * 100).toFixed(2)}% (+${percentage}%)`;
      default:
        return `Risk limit breach detected: ${breach.type}`;
    }
  }

  storeMonitoringData(portfolioId, data) {
    if (!this.monitoringData.has(portfolioId)) {
      this.monitoringData.set(portfolioId, []);
    }
    
    const history = this.monitoringData.get(portfolioId);
    history.push(data);
    
    // Keep only recent data
    if (history.length > this.config.windowSize) {
      history.shift();
    }
  }

  updateMonitoringMetrics(portfolioId, result) {
    if (this.metrics?.riskMetricsGauge) {
      this.metrics.riskMetricsGauge.set(
        { metric_type: 'leverage', portfolio_id: portfolioId },
        result.riskMetrics.leverage
      );
      
      this.metrics.riskMetricsGauge.set(
        { metric_type: 'concentration', portfolio_id: portfolioId },
        result.riskMetrics.concentration
      );
      
      this.metrics.riskMetricsGauge.set(
        { metric_type: 'var', portfolio_id: portfolioId },
        result.riskMetrics.estimatedVaR
      );
    }
    
    if (this.metrics?.alertCounter && result.alerts.length > 0) {
      result.alerts.forEach(alert => {
        this.metrics.alertCounter.inc({
          alert_type: alert.type,
          severity: alert.severity,
          portfolio_id: portfolioId
        });
      });
    }
  }

  async checkAlerts(portfolioId, result) {
    for (const alert of result.alerts) {
      if (alert.severity === 'critical' || alert.requiresImmediateAction) {
        // Emit immediate alert
        this.emit('critical_alert', {
          portfolioId,
          alert,
          riskMetrics: result.riskMetrics
        });
        
        // Send real-time notification
        if (this.io) {
          this.io.to(`alerts_${portfolioId}`).emit('critical_alert', alert);
        }
      }
    }
    
    // Store alert history
    this.alertHistory.push(...result.alerts.map(alert => ({
      ...alert,
      portfolioId,
      timestamp: new Date()
    })));
    
    // Keep alert history manageable
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-500);
    }
  }

  async estimatePortfolioVolatility(positions) {
    // Quick volatility estimate for real-time monitoring
    let weightedVolatility = 0;
    const totalValue = this.calculatePortfolioValue(positions);
    
    for (const position of positions) {
      const weight = Math.abs(parseFloat(position.marketValue || 0)) / totalValue;
      const assetVolatility = await this.getAssetVolatility(position.symbol);
      weightedVolatility += weight * assetVolatility;
    }
    
    // Apply correlation adjustment (simplified)
    return weightedVolatility * 0.8; // Assume 80% correlation effect
  }

  calculatePortfolioValue(positions) {
    return positions.reduce((total, position) => {
      return total + Math.abs(parseFloat(position.marketValue || 0));
    }, 0);
  }

  // Placeholder methods - would connect to actual services
  async getActivePortfolios() {
    return [
      { id: 'portfolio1', userId: 'user1' },
      { id: 'portfolio2', userId: 'user2' }
    ];
  }

  async getPortfolioPositions(portfolioId) {
    // Would fetch from position service
    return [];
  }

  async getRiskLimits(portfolioId) {
    return {
      maxLeverage: 5.0,
      maxConcentration: 0.25,
      maxVaR: 100000,
      maxDailyLoss: 0.05
    };
  }

  async getAssetVolatility(symbol) {
    const volatilityMap = {
      'AAPL': 0.25, 'GOOGL': 0.28, 'MSFT': 0.22, 'TSLA': 0.45,
      'BTCUSDT': 0.60, 'ETHUSDT': 0.65
    };
    return volatilityMap[symbol] || 0.25;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastMonitoringRun: this.lastMonitoringRun,
      monitoredPortfolios: this.monitoringData.size,
      alertHistory: this.alertHistory.length,
      config: this.config
    };
  }

  stop() {
    this.isRunning = false;
    this.logger?.info('Real-time monitoring stopped');
  }
}

module.exports = RealTimeMonitor;