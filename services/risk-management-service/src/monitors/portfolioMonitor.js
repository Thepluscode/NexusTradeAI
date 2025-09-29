// src/monitors/portfolioMonitor.js
const EventEmitter = require('events');
const VarCalculator = require('../calculators/varCalculator');
const StressTestCalculator = require('../calculators/stressTestCalculator');
const LiquidityRiskCalculator = require('../calculators/liquidityRiskCalculator');

class PortfolioMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Initialize calculators
    this.varCalculator = new VarCalculator(options);
    this.stressTestCalculator = new StressTestCalculator(options);
    this.liquidityRiskCalculator = new LiquidityRiskCalculator(options);
    
    this.monitoringFrequency = {
      realTime: 30000,      // 30 seconds
      riskCalculation: 300000, // 5 minutes
      stressTest: 3600000,   // 1 hour
      liquidityCheck: 600000 // 10 minutes
    };
    
    this.portfolioData = new Map(); // portfolioId -> latest data
  }

  async initialize() {
    try {
      this.logger?.info('Initializing PortfolioMonitor...');
      this.startMonitoringSchedules();
      this.logger?.info('PortfolioMonitor initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize PortfolioMonitor:', error);
      throw error;
    }
  }

  startMonitoringSchedules() {
    // Real-time monitoring (basic metrics)
    setInterval(async () => {
      try {
        await this.performRealTimeMonitoring();
      } catch (error) {
        this.logger?.error('Error in real-time monitoring:', error);
      }
    }, this.monitoringFrequency.realTime);
    
    // Risk calculation monitoring
    setInterval(async () => {
      try {
        await this.performRiskCalculationMonitoring();
      } catch (error) {
        this.logger?.error('Error in risk calculation monitoring:', error);
      }
    }, this.monitoringFrequency.riskCalculation);
    
    // Stress test monitoring
    setInterval(async () => {
      try {
        await this.performStressTestMonitoring();
      } catch (error) {
        this.logger?.error('Error in stress test monitoring:', error);
      }
    }, this.monitoringFrequency.stressTest);
    
    // Liquidity monitoring
    setInterval(async () => {
      try {
        await this.performLiquidityMonitoring();
      } catch (error) {
        this.logger?.error('Error in liquidity monitoring:', error);
      }
    }, this.monitoringFrequency.liquidityCheck);
    
    this.logger?.info('Portfolio monitoring schedules started');
  }

  async performRealTimeMonitoring() {
    const portfolios = await this.getActivePortfolios();
    
    for (const portfolio of portfolios) {
      try {
        const basicMetrics = await this.calculateBasicMetrics(portfolio);
        
        // Store latest data
        this.updatePortfolioData(portfolio.id, 'basicMetrics', basicMetrics);
        
        // Check for immediate alerts
        const alerts = this.checkBasicAlerts(portfolio.id, basicMetrics);
        if (alerts.length > 0) {
          this.emit('portfolio_alerts', {
            portfolioId: portfolio.id,
            alerts,
            metrics: basicMetrics
          });
        }
        
      } catch (error) {
        this.logger?.error(`Error monitoring portfolio ${portfolio.id}:`, error);
      }
    }
  }

  async performRiskCalculationMonitoring() {
    const portfolios = await this.getActivePortfolios();
    
    for (const portfolio of portfolios) {
      try {
        const positions = await this.getPortfolioPositions(portfolio.id);
        
        if (positions.length === 0) continue;
        
        // Calculate comprehensive risk metrics
        const varResult = await this.varCalculator.calculatePortfolioVaR(positions, {
          confidenceLevel: 0.95,
          method: 'parametric'
        });
        
        const var99Result = await this.varCalculator.calculatePortfolioVaR(positions, {
          confidenceLevel: 0.99,
          method: 'parametric'
        });
        
        const riskMetrics = {
          var95: varResult.var,
          var99: var99Result.var,
          expectedShortfall95: varResult.expectedShortfall,
          expectedShortfall99: var99Result.expectedShortfall,
          portfolioStats: varResult.portfolioStats,
          componentVaRs: varResult.componentVaRs,
          timestamp: new Date()
        };
        
        // Store results
        this.updatePortfolioData(portfolio.id, 'riskMetrics', riskMetrics);
        
        // Update metrics
        if (this.metrics?.riskMetricsGauge) {
          this.metrics.riskMetricsGauge.set(
            { metric_type: 'var95', portfolio_id: portfolio.id },
            riskMetrics.var95
          );
          this.metrics.riskMetricsGauge.set(
            { metric_type: 'var99', portfolio_id: portfolio.id },
            riskMetrics.var99
          );
        }
        
        this.emit('risk_metrics_updated', {
          portfolioId: portfolio.id,
          riskMetrics
        });
        
      } catch (error) {
        this.logger?.error(`Error calculating risk metrics for portfolio ${portfolio.id}:`, error);
      }
    }
  }

  async performStressTestMonitoring() {
    const portfolios = await this.getActivePortfolios();
    
    for (const portfolio of portfolios) {
      try {
        const positions = await this.getPortfolioPositions(portfolio.id);
        
        if (positions.length === 0) continue;
        
        // Run multiple stress scenarios
        const scenarios = ['market_crash', 'interest_rate_shock', 'liquidity_crisis'];
        const stressResults = {};
        
        for (const scenario of scenarios) {
          const result = await this.stressTestCalculator.runStressTest(positions, scenario);
          stressResults[scenario] = result;
        }
        
        // Store results
        this.updatePortfolioData(portfolio.id, 'stressTests', stressResults);
        
        // Check for stress test alerts
        const alerts = this.checkStressTestAlerts(portfolio.id, stressResults);
        if (alerts.length > 0) {
          this.emit('stress_test_alerts', {
            portfolioId: portfolio.id,
            alerts,
            stressResults
          });
        }
        
      } catch (error) {
        this.logger?.error(`Error running stress tests for portfolio ${portfolio.id}:`, error);
      }
    }
  }

  async performLiquidityMonitoring() {
    const portfolios = await this.getActivePortfolios();
    
    for (const portfolio of portfolios) {
      try {
        const positions = await this.getPortfolioPositions(portfolio.id);
        
        if (positions.length === 0) continue;
        
        // Calculate liquidity risk
        const liquidityRisk = await this.liquidityRiskCalculator.calculatePortfolioLiquidityRisk(positions);
        
        // Store results
        this.updatePortfolioData(portfolio.id, 'liquidityRisk', liquidityRisk);
        
        // Check for liquidity alerts
        const alerts = this.checkLiquidityAlerts(portfolio.id, liquidityRisk);
        if (alerts.length > 0) {
          this.emit('liquidity_alerts', {
            portfolioId: portfolio.id,
            alerts,
            liquidityRisk
          });
        }
        
      } catch (error) {
        this.logger?.error(`Error calculating liquidity risk for portfolio ${portfolio.id}:`, error);
      }
    }
  }

  async calculateBasicMetrics(portfolio) {
    const positions = await this.getPortfolioPositions(portfolio.id);
    
    const totalValue = positions.reduce((sum, pos) => 
      sum + Math.abs(parseFloat(pos.marketValue || 0)), 0
    );
    
    const totalPnL = positions.reduce((sum, pos) => 
      sum + parseFloat(pos.unrealizedPnL || 0), 0
    );
    
    const dayPnLPercent = totalValue > 0 ? totalPnL / totalValue : 0;
    
    // Calculate leverage
    const totalExposure = positions.reduce((sum, pos) => 
      sum + Math.abs(parseFloat(pos.marketValue || 0)), 0
    );
    const leverage = totalValue > 0 ? totalExposure / totalValue : 0;
    
    // Calculate concentration
    let maxPosition = 0;
    positions.forEach(pos => {
      const posValue = Math.abs(parseFloat(pos.marketValue || 0));
      maxPosition = Math.max(maxPosition, posValue);
    });
    const concentration = totalValue > 0 ? maxPosition / totalValue : 0;
    
    return {
      portfolioValue: totalValue,
      totalPnL,
      dayPnLPercent,
      leverage,
      concentration,
      positionCount: positions.length,
      timestamp: new Date()
    };
  }

  checkBasicAlerts(portfolioId, metrics) {
    const alerts = [];
    const limits = this.getPortfolioLimits(portfolioId);
    
    // Loss alert
    if (metrics.dayPnLPercent < -limits.maxDailyLoss) {
      alerts.push({
        type: 'daily_loss',
        severity: 'high',
        message: `Daily loss ${(metrics.dayPnLPercent * 100).toFixed(2)}% exceeds limit`,
        value: metrics.dayPnLPercent,
        limit: limits.maxDailyLoss
      });
    }
    
    // Leverage alert
    if (metrics.leverage > limits.maxLeverage) {
      alerts.push({
        type: 'leverage',
        severity: 'medium',
        message: `Leverage ${metrics.leverage.toFixed(2)}x exceeds limit`,
        value: metrics.leverage,
        limit: limits.maxLeverage
      });
    }
    
    return alerts;
  }

  checkStressTestAlerts(portfolioId, stressResults) {
    const alerts = [];
    const limits = this.getPortfolioLimits(portfolioId);
    
    Object.entries(stressResults).forEach(([scenario, result]) => {
      if (Math.abs(result.stressed.impactPercent) > limits.maxStressLoss) {
        alerts.push({
          type: 'stress_test',
          scenario,
          severity: 'high',
          message: `${scenario} stress test shows ${result.stressed.impactPercent.toFixed(1)}% loss`,
          value: Math.abs(result.stressed.impactPercent),
          limit: limits.maxStressLoss
        });
      }
    });
    
    return alerts;
  }

  checkLiquidityAlerts(portfolioId, liquidityRisk) {
    const alerts = [];
    const limits = this.getPortfolioLimits(portfolioId);
    
    if (liquidityRisk.overallLiquidityScore < limits.minLiquidityScore) {
      alerts.push({
        type: 'liquidity',
        severity: 'medium',
        message: `Portfolio liquidity score ${liquidityRisk.overallLiquidityScore.toFixed(2)} below minimum`,
        value: liquidityRisk.overallLiquidityScore,
        limit: limits.minLiquidityScore
      });
    }
    
    return alerts;
  }

  updatePortfolioData(portfolioId, dataType, data) {
    if (!this.portfolioData.has(portfolioId)) {
      this.portfolioData.set(portfolioId, {});
    }
    
    this.portfolioData.get(portfolioId)[dataType] = data;
  }

  getPortfolioData(portfolioId) {
    return this.portfolioData.get(portfolioId) || {};
  }

  getPortfolioLimits(portfolioId) {
    // Default limits - would be fetched from database
    return {
      maxDailyLoss: 0.05,     // 5%
      maxLeverage: 5.0,       // 5x
      maxStressLoss: 20,      // 20%
      minLiquidityScore: 0.6  // 60%
    };
  }

  // Placeholder methods
  async getActivePortfolios() {
    return [
      { id: 'portfolio1', userId: 'user1' },
      { id: 'portfolio2', userId: 'user2' }
    ];
  }

  async getPortfolioPositions(portfolioId) {
    return [];
  }

  getStatus() {
    return {
      monitoredPortfolios: this.portfolioData.size,
      lastUpdate: new Date(),
      monitoringFrequency: this.monitoringFrequency
    };
  }
}

module.exports = PortfolioMonitor;