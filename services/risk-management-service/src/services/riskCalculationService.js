// src/services/riskCalculationService.js
const VarCalculator = require('../calculators/varCalculator');
const StressTestCalculator = require('../calculators/stressTestCalculator');
const LiquidityRiskCalculator = require('../calculators/liquidityRiskCalculator');
const CounterpartyRiskCalculator = require('../calculators/counterpartyRiskCalculator');

class RiskCalculationService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.metrics = options.metrics;
    
    // Initialize calculators
    this.varCalculator = new VarCalculator(options);
    this.stressTestCalculator = new StressTestCalculator(options);
    this.liquidityRiskCalculator = new LiquidityRiskCalculator(options);
    this.counterpartyRiskCalculator = new CounterpartyRiskCalculator(options);
    
    this.calculationCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    try {
      this.logger?.info('Initializing RiskCalculationService...');
      this.logger?.info('RiskCalculationService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize RiskCalculationService:', error);
      throw error;
    }
  }

  async calculateComprehensiveRisk(portfolioId, options = {}) {
    try {
      const startTime = Date.now();
      
      // Check cache first
      const cacheKey = `comprehensive_${portfolioId}_${JSON.stringify(options)}`;
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Get portfolio data
      const portfolio = await this.getPortfolioData(portfolioId);
      const positions = portfolio.positions || [];
      const exposures = portfolio.exposures || [];
      
      if (positions.length === 0) {
        throw new Error('No positions found for portfolio');
      }
      
      // Calculate all risk metrics in parallel
      const [
        varResults,
        stressTestResults,
        liquidityRisk,
        counterpartyRisk
      ] = await Promise.all([
        this.calculateVaRMetrics(positions, options),
        this.calculateStressTestMetrics(positions, options),
        this.liquidityRiskCalculator.calculatePortfolioLiquidityRisk(positions),
        exposures.length > 0 ? 
          this.counterpartyRiskCalculator.calculateCounterpartyRisk(exposures) : 
          null
      ]);
      
      // Combine results
      const comprehensiveRisk = {
        portfolioId,
        timestamp: new Date(),
        calculationTime: Date.now() - startTime,
        portfolioValue: this.calculatePortfolioValue(positions),
        riskMetrics: {
          var: varResults,
          stressTests: stressTestResults,
          liquidity: liquidityRisk,
          counterparty: counterpartyRisk
        },
        riskSummary: this.generateRiskSummary(varResults, stressTestResults, liquidityRisk, counterpartyRisk),
        alerts: this.generateRiskAlerts(varResults, stressTestResults, liquidityRisk, counterpartyRisk)
      };
      
      // Cache results
      this.setCache(cacheKey, comprehensiveRisk);
      
      // Update metrics
      if (this.metrics?.riskCalculationCounter) {
        this.metrics.riskCalculationCounter.inc({
          calculation_type: 'comprehensive',
          status: 'success'
        });
      }
      
      return comprehensiveRisk;
      
    } catch (error) {
      this.logger?.error('Error calculating comprehensive risk:', error);
      
      if (this.metrics?.riskCalculationCounter) {
        this.metrics.riskCalculationCounter.inc({
          calculation_type: 'comprehensive',
          status: 'error'
        });
      }
      
      throw error;
    }
  }

  async calculateVaRMetrics(positions, options = {}) {
    const confidenceLevels = options.confidenceLevels || [0.95, 0.99];
    const methods = options.methods || ['parametric', 'historical'];
    
    const results = {};
    
    for (const confidenceLevel of confidenceLevels) {
      results[`var${confidenceLevel * 100}`] = {};
      
      for (const method of methods) {
        try {
          const varResult = await this.varCalculator.calculatePortfolioVaR(positions, {
            confidenceLevel,
            method,
            timeHorizon: options.timeHorizon || 1
          });
          
          results[`var${confidenceLevel * 100}`][method] = varResult;
          
        } catch (error) {
          this.logger?.error(`Error calculating ${method} VaR at ${confidenceLevel}:`, error);
          results[`var${confidenceLevel * 100}`][method] = { error: error.message };
        }
      }
    }
    
    return results;
  }

  async calculateStressTestMetrics(positions, options = {}) {
    const scenarios = options.scenarios || ['market_crash', 'interest_rate_shock', 'liquidity_crisis'];
    const results = {};
    
    for (const scenario of scenarios) {
      try {
        const stressResult = await this.stressTestCalculator.runStressTest(positions, scenario);
        results[scenario] = stressResult;
        
      } catch (error) {
        this.logger?.error(`Error running stress test ${scenario}:`, error);
        results[scenario] = { error: error.message };
      }
    }
    
    return results;
  }

  generateRiskSummary(varResults, stressTestResults, liquidityRisk, counterpartyRisk) {
    const summary = {
      overallRiskLevel: 'medium',
      keyRisks: [],
      recommendations: []
    };
    
    // Analyze VaR results
    const var95 = varResults.var95?.parametric?.var || 0;
    const portfolioValue = varResults.var95?.parametric?.portfolio?.value || 1;
    const varRatio = var95 / portfolioValue;
    
    if (varRatio > 0.1) {
      summary.overallRiskLevel = 'high';
      summary.keyRisks.push('High VaR relative to portfolio value');
      summary.recommendations.push('Consider reducing position sizes or hedging exposure');
    }
    
    // Analyze stress test results
    const worstStressLoss = Math.max(
      ...Object.values(stressTestResults).map(result => 
        Math.abs(result.stressed?.impactPercent || 0)
      )
    );
    
    if (worstStressLoss > 25) {
      summary.overallRiskLevel = 'high';
      summary.keyRisks.push('High stress test losses');
      summary.recommendations.push('Improve portfolio diversification');
    }
    
    // Analyze liquidity risk
    if (liquidityRisk && liquidityRisk.overallLiquidityScore < 0.5) {
      summary.keyRisks.push('Low portfolio liquidity');
      summary.recommendations.push('Increase allocation to liquid assets');
    }
    
    // Analyze counterparty risk
    if (counterpartyRisk && counterpartyRisk.concentrationRisk.largestCounterparty > 25) {
      summary.keyRisks.push('High counterparty concentration');
      summary.recommendations.push('Diversify counterparty exposure');
    }
    
    return summary;
  }

  generateRiskAlerts(varResults, stressTestResults, liquidityRisk, counterpartyRisk) {
    const alerts = [];
    
    // VaR alerts
    const var95 = varResults.var95?.parametric?.var || 0;
    if (var95 > 100000) { // $100K threshold
      alerts.push({
        type: 'high_var',
        severity: 'medium',
        message: `95% VaR of ${var95.toFixed(0)} exceeds threshold`,
        value: var95,
        threshold: 100000
      });
    }
    
    // Stress test alerts
    Object.entries(stressTestResults).forEach(([scenario, result]) => {
      if (Math.abs(result.stressed?.impactPercent || 0) > 20) {
        alerts.push({
          type: 'stress_test_failure',
          severity: 'high',
          message: `${scenario} stress test shows ${result.stressed.impactPercent.toFixed(1)}% loss`,
          scenario,
          impact: result.stressed.impactPercent
        });
      }
    });
    
    return alerts;
  }

  async calculatePortfolioRisk() {
    try {
      const portfolios = await this.getActivePortfolios();
      
      for (const portfolio of portfolios) {
        await this.calculateComprehensiveRisk(portfolio.id);
      }
      
      this.logger?.info(`Risk calculation completed for ${portfolios.length} portfolios`);
      
    } catch (error) {
      this.logger?.error('Error in portfolio risk calculation:', error);
      throw error;
    }
  }

  async runStressTests() {
    try {
      const portfolios = await this.getActivePortfolios();
      
      for (const portfolio of portfolios) {
        const positions = await this.getPortfolioPositions(portfolio.id);
        
        if (positions.length === 0) continue;
        
        // Run all stress scenarios
        const scenarios = this.stressTestCalculator.getAvailableScenarios();
        
        for (const scenario of scenarios) {
          await this.stressTestCalculator.runStressTest(positions, scenario.id);
        }
      }
      
      this.logger?.info(`Stress tests completed for ${portfolios.length} portfolios`);
      
    } catch (error) {
      this.logger?.error('Error running stress tests:', error);
      throw error;
    }
  }

  async generateDailyReports() {
    try {
      const portfolios = await this.getActivePortfolios();
      const reports = [];
      
      for (const portfolio of portfolios) {
        const comprehensiveRisk = await this.calculateComprehensiveRisk(portfolio.id);
        
        const report = {
          portfolioId: portfolio.id,
          date: new Date().toISOString().split('T')[0],
          summary: comprehensiveRisk.riskSummary,
          keyMetrics: {
            var95: comprehensiveRisk.riskMetrics.var.var95?.parametric?.var || 0,
            worstStressLoss: Math.max(
              ...Object.values(comprehensiveRisk.riskMetrics.stressTests).map(r => 
                Math.abs(r.stressed?.impactPercent || 0)
              )
            ),
            liquidityScore: comprehensiveRisk.riskMetrics.liquidity?.overallLiquidityScore || 0
          },
          alerts: comprehensiveRisk.alerts
        };
        
        reports.push(report);
      }
      
      // Store reports (would save to database)
      this.logger?.info(`Generated daily risk reports for ${reports.length} portfolios`);
      
      return reports;
      
    } catch (error) {
      this.logger?.error('Error generating daily reports:', error);
      throw error;
    }
  }

  getFromCache(key) {
    const cached = this.calculationCache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.calculationCache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCache(key, data) {
    this.calculationCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  calculatePortfolioValue(positions) {
    return positions.reduce((total, position) => {
      return total + Math.abs(parseFloat(position.marketValue || 0));
    }, 0);
  }

  // Mock methods - would integrate with actual services
  async getPortfolioData(portfolioId) {
    return {
      id: portfolioId,
      positions: await this.getPortfolioPositions(portfolioId),
      exposures: await this.getPortfolioExposures(portfolioId)
    };
  }

  async getPortfolioPositions(portfolioId) {
    // Mock positions data
    return [
      {
        symbol: 'AAPL',
        quantity: 100,
        marketValue: '15000',
        unrealizedPnL: '500'
      },
      {
        symbol: 'GOOGL',
        quantity: 50,
        marketValue: '12000',
        unrealizedPnL: '-200'
      }
    ];
  }

  async getPortfolioExposures(portfolioId) {
    // Mock counterparty exposures
    return [
      {
        counterpartyId: 'CP001',
        amount: 50000,
        type: 'derivative',
        maturity: 0.5,
        volatility: 0.2
      }
    ];
  }

  async getActivePortfolios() {
    return [
      { id: 'portfolio1', userId: 'user1' },
      { id: 'portfolio2', userId: 'user2' }
    ];
  }
}

module.exports = RiskCalculationService;