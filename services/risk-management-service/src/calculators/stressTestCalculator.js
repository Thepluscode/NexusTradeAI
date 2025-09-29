// src/calculators/stressTestCalculator.js
const Decimal = require('decimal.js');
const VarCalculator = require('./varCalculator');

class StressTestCalculator {
  constructor(options = {}) {
    this.logger = options.logger;
    this.varCalculator = new VarCalculator(options);
    
    // Predefined stress scenarios
    this.scenarios = new Map([
      ['market_crash', {
        name: 'Market Crash (-30%)',
        shocks: { equity: -0.30, credit: -0.20, commodities: -0.35, fx: -0.15 },
        correlations: 0.9,
        volatilityMultiplier: 3.0
      }],
      ['interest_rate_shock', {
        name: 'Interest Rate Shock (+300bp)',
        shocks: { rates: 0.03, duration: -0.25, credit: -0.15, equity: -0.10 },
        correlations: 0.7,
        volatilityMultiplier: 2.0
      }],
      ['liquidity_crisis', {
        name: 'Liquidity Crisis',
        shocks: { liquidity: -0.80, credit: -0.25, equity: -0.20 },
        correlations: 0.95,
        volatilityMultiplier: 4.0
      }],
      ['geopolitical_crisis', {
        name: 'Geopolitical Crisis',
        shocks: { equity: -0.15, commodities: 0.25, fx: 0.10, volatility: 2.5 },
        correlations: 0.8,
        volatilityMultiplier: 2.5
      }]
    ]);
  }

  async runStressTest(portfolio, scenarioName, customShocks = null) {
    try {
      const scenario = customShocks ? 
        { name: 'Custom', shocks: customShocks, correlations: 0.8, volatilityMultiplier: 2.0 } :
        this.scenarios.get(scenarioName);
      
      if (!scenario) {
        throw new Error(`Unknown stress scenario: ${scenarioName}`);
      }

      const baselineValue = this.calculatePortfolioValue(portfolio);
      const stressedPortfolio = this.applyStressShocks(portfolio, scenario.shocks);
      const stressedValue = this.calculatePortfolioValue(stressedPortfolio);
      
      const impact = new Decimal(stressedValue).minus(baselineValue);
      const impactPercent = baselineValue > 0 ? impact.dividedBy(baselineValue).times(100) : new Decimal(0);
      
      // Calculate stressed VaR
      const stressedVaR = await this.calculateStressedVaR(stressedPortfolio, scenario);
      
      // Position-level impacts
      const positionImpacts = portfolio.map((position, index) => {
        const originalValue = parseFloat(position.marketValue || 0);
        const stressedPos = stressedPortfolio[index];
        const stressedPosValue = parseFloat(stressedPos.marketValue || 0);
        const posImpact = stressedPosValue - originalValue;
        
        return {
          symbol: position.symbol,
          originalValue,
          stressedValue: stressedPosValue,
          impact: posImpact,
          impactPercent: originalValue !== 0 ? (posImpact / originalValue) * 100 : 0
        };
      });

      return {
        scenario: scenario.name,
        baseline: {
          value: baselineValue,
          var95: await this.varCalculator.calculatePortfolioVaR(portfolio, { confidenceLevel: 0.95 })
        },
        stressed: {
          value: stressedValue,
          var95: stressedVaR,
          impact: impact.toNumber(),
          impactPercent: impactPercent.toNumber()
        },
        positionImpacts,
        riskMetrics: this.calculateStressRiskMetrics(positionImpacts, impact),
        timestamp: new Date()
      };

    } catch (error) {
      this.logger?.error('Error running stress test:', error);
      throw error;
    }
  }

  applyStressShocks(portfolio, shocks) {
    return portfolio.map(position => {
      const assetClass = this.getAssetClass(position.symbol);
      const shock = shocks[assetClass] || 0;
      
      const originalValue = parseFloat(position.marketValue || 0);
      const stressedValue = originalValue * (1 + shock);
      
      return {
        ...position,
        marketValue: stressedValue.toString(),
        stressShock: shock
      };
    });
  }

  async calculateStressedVaR(stressedPortfolio, scenario) {
    // Adjust VaR calculation for stress conditions
    const baseVaR = await this.varCalculator.calculatePortfolioVaR(stressedPortfolio, { confidenceLevel: 0.95 });
    
    // Apply volatility multiplier and correlation adjustment
    const stressedVaR = baseVaR.var * scenario.volatilityMultiplier * (1 + scenario.correlations * 0.2);
    
    return {
      ...baseVaR,
      var: stressedVaR,
      stressAdjustments: {
        volatilityMultiplier: scenario.volatilityMultiplier,
        correlationAdjustment: scenario.correlations
      }
    };
  }

  calculateStressRiskMetrics(positionImpacts, totalImpact) {
    const impacts = positionImpacts.map(p => p.impact);
    
    return {
      worstPosition: Math.min(...impacts),
      bestPosition: Math.max(...impacts),
      averageImpact: impacts.reduce((sum, i) => sum + i, 0) / impacts.length,
      concentrationRisk: this.calculateConcentrationRisk(positionImpacts),
      diversificationBenefit: impacts.reduce((sum, i) => sum + Math.abs(i), 0) - Math.abs(totalImpact.toNumber()),
      tailRisk: impacts.filter(i => i < -50000).length // Positions losing >$50k
    };
  }

  calculateConcentrationRisk(positionImpacts) {
    const sortedImpacts = positionImpacts
      .map(p => Math.abs(p.impact))
      .sort((a, b) => b - a);
    
    const top5Impact = sortedImpacts.slice(0, 5).reduce((sum, i) => sum + i, 0);
    const totalImpact = sortedImpacts.reduce((sum, i) => sum + i, 0);
    
    return totalImpact > 0 ? top5Impact / totalImpact : 0;
  }

  getAssetClass(symbol) {
    const assetMap = {
      'AAPL': 'equity', 'GOOGL': 'equity', 'MSFT': 'equity', 'TSLA': 'equity',
      'TLT': 'rates', 'IEF': 'rates', 'LQD': 'credit',
      'GLD': 'commodities', 'USO': 'commodities',
      'BTCUSDT': 'crypto', 'ETHUSDT': 'crypto',
      'EURUSD': 'fx', 'GBPUSD': 'fx'
    };
    return assetMap[symbol] || 'equity';
  }

  calculatePortfolioValue(portfolio) {
    return portfolio.reduce((total, position) => {
      return total + Math.abs(parseFloat(position.marketValue || 0));
    }, 0);
  }

  getAvailableScenarios() {
    return Array.from(this.scenarios.entries()).map(([key, scenario]) => ({
      id: key,
      name: scenario.name,
      description: `Stress test scenario: ${scenario.name}`
    }));
  }
}

module.exports = StressTestCalculator;