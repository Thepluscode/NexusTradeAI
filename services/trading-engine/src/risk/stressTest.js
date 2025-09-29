// src/risk/stressTest.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');

class StressTest extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.scenarios = new Map();
    this.isInitialized = false;
    
    // Historical correlation matrices
    this.correlationMatrices = new Map();
    this.volatilityModels = new Map();
    
    // Stress test parameters
    this.config = {
      confidenceLevel: 0.01, // 1% tail risk
      monteCarloIterations: 10000,
      lookbackDays: 252, // 1 year of trading days
      shockMagnitudes: {
        market_crash: -0.20,
        volatility_spike: 2.0,
        correlation_breakdown: 0.9,
        liquidity_crisis: 0.5,
        interest_rate_shock: 0.02
      }
    };
  }

  async initialize() {
    try {
      this.logger?.info('Initializing StressTest module...');
      
      // Load predefined stress scenarios
      this.loadStressScenarios();
      
      // Initialize correlation matrices
      await this.loadCorrelationData();
      
      this.isInitialized = true;
      this.logger?.info('StressTest module initialized successfully');
      
    } catch (error) {
      this.logger?.error('Failed to initialize StressTest:', error);
      throw error;
    }
  }

  loadStressScenarios() {
    // Market Crash Scenario (2008-style)
    this.scenarios.set('market_crash', {
      name: 'Market Crash',
      description: 'Severe market downturn with 20% decline across all risk assets',
      shocks: {
        equity: -0.20,
        credit: -0.15,
        commodities: -0.25,
        fx_emerging: -0.30,
        volatility: 2.5,
        correlation: 0.8
      },
      probability: 0.01,
      duration: 30 // days
    });

    // Volatility Spike (VIX to 80+)
    this.scenarios.set('volatility_spike', {
      name: 'Volatility Spike',
      description: 'Extreme volatility increase similar to March 2020',
      shocks: {
        equity: -0.10,
        volatility: 3.0,
        correlation: 0.9,
        liquidity: -0.50
      },
      probability: 0.02,
      duration: 14
    });

    // Correlation Breakdown
    this.scenarios.set('correlation_breakdown', {
      name: 'Correlation Breakdown',
      description: 'Traditional correlations break down, hedges fail',
      shocks: {
        correlation: -0.5, // Negative correlation becomes positive
        hedge_effectiveness: -0.70,
        dispersion: 2.0
      },
      probability: 0.03,
      duration: 60
    });

    // Liquidity Crisis
    this.scenarios.set('liquidity_crisis', {
      name: 'Liquidity Crisis',
      description: 'Market liquidity dries up, bid-ask spreads widen dramatically',
      shocks: {
        liquidity: -0.80,
        transaction_costs: 5.0,
        market_impact: 3.0,
        volatility: 1.5
      },
      probability: 0.015,
      duration: 21
    });

    // Interest Rate Shock
    this.scenarios.set('interest_rate_shock', {
      name: 'Interest Rate Shock',
      description: 'Sudden 200bp rate increase',
      shocks: {
        rates: 0.02,
        duration: -0.15, // Duration risk
        credit: -0.10,
        fx: 0.05 // USD strength
      },
      probability: 0.05,
      duration: 90
    });

    // Geopolitical Crisis
    this.scenarios.set('geopolitical_crisis', {
      name: 'Geopolitical Crisis',
      description: 'Major geopolitical event affecting global markets',
      shocks: {
        equity: -0.15,
        commodities: 0.30, // Flight to commodities
        fx_safe_haven: 0.10,
        volatility: 2.0,
        correlation: 0.7
      },
      probability: 0.025,
      duration: 45
    });
  }

  async loadCorrelationData() {
    // Simplified correlation matrices - in production would load from historical data
    const assetClasses = ['equity', 'fixed_income', 'commodities', 'fx', 'crypto'];
    
    // Normal market correlations
    this.correlationMatrices.set('normal', new Map([
      ['equity-fixed_income', -0.2],
      ['equity-commodities', 0.3],
      ['equity-fx', 0.1],
      ['equity-crypto', 0.4],
      ['fixed_income-commodities', -0.1],
      ['fixed_income-fx', -0.3],
      ['fixed_income-crypto', -0.1],
      ['commodities-fx', 0.2],
      ['commodities-crypto', 0.3],
      ['fx-crypto', 0.1]
    ]));

    // Stress correlations (crisis)
    this.correlationMatrices.set('stress', new Map([
      ['equity-fixed_income', 0.5], // Flight to quality breaks down
      ['equity-commodities', 0.8],
      ['equity-fx', 0.6],
      ['equity-crypto', 0.9],
      ['fixed_income-commodities', 0.3],
      ['fixed_income-fx', 0.2],
      ['fixed_income-crypto', 0.4],
      ['commodities-fx', 0.7],
      ['commodities-crypto', 0.8],
      ['fx-crypto', 0.6]
    ]));
  }

  async runStressTest(portfolio, scenarioName, customShocks = null) {
    try {
      if (!this.isInitialized) {
        throw new Error('StressTest not initialized');
      }

      const startTime = Date.now();
      
      let scenario;
      let shocks;

      if (customShocks) {
        scenario = { name: 'Custom', description: 'Custom stress scenario' };
        shocks = customShocks;
      } else {
        scenario = this.scenarios.get(scenarioName);
        if (!scenario) {
          throw new Error(`Unknown stress scenario: ${scenarioName}`);
        }
        shocks = scenario.shocks;
      }

      this.logger?.info(`Running stress test: ${scenario.name}`, {
        portfolioSize: portfolio.length,
        scenario: scenarioName
      });

      // Calculate baseline portfolio value
      const baselineValue = this.calculatePortfolioValue(portfolio);
      
      // Apply shocks to each position
      const stressedPositions = await this.applyShocks(portfolio, shocks);
      
      // Calculate stressed portfolio value
      const stressedValue = this.calculatePortfolioValue(stressedPositions);
      
      // Calculate portfolio-level impacts
      const portfolioImpact = stressedValue.minus(baselineValue);
      const portfolioImpactPercent = baselineValue.gt(0) ? 
        portfolioImpact.dividedBy(baselineValue).times(100) : new Decimal(0);

      // Calculate position-level impacts
      const positionImpacts = portfolio.map((position, index) => {
        const originalValue = new Decimal(position.marketValue || 0);
        const stressedPos = stressedPositions[index];
        const stressedPosValue = new Decimal(stressedPos.marketValue || 0);
        const impact = stressedPosValue.minus(originalValue);
        const impactPercent = originalValue.gt(0) ? 
          impact.dividedBy(originalValue).times(100) : new Decimal(0);

        return {
          symbol: position.symbol,
          originalValue: originalValue.toNumber(),
          stressedValue: stressedPosValue.toNumber(),
          impact: impact.toNumber(),
          impactPercent: impactPercent.toNumber(),
          assetClass: this.getAssetClass(position.symbol)
        };
      });

      // Calculate risk metrics
      const riskMetrics = this.calculateStressRiskMetrics(positionImpacts, portfolioImpact);

      const results = {
        scenario: scenario.name,
        description: scenario.description,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        portfolio: {
          baselineValue: baselineValue.toNumber(),
          stressedValue: stressedValue.toNumber(),
          totalImpact: portfolioImpact.toNumber(),
          impactPercent: portfolioImpactPercent.toNumber()
        },
        positions: positionImpacts,
        riskMetrics,
        shocks,
        warnings: this.generateWarnings(riskMetrics, portfolioImpactPercent)
      };

      this.emit('stress_test_completed', results);
      
      return results;

    } catch (error) {
      this.logger?.error('Error running stress test:', error);
      throw error;
    }
  }

  async applyShocks(portfolio, shocks) {
    const stressedPortfolio = [];

    for (const position of portfolio) {
      const assetClass = this.getAssetClass(position.symbol);
      const stressedPosition = { ...position };
      
      // Apply direct shocks
      let totalShock = new Decimal(0);
      
      // Asset class specific shocks
      if (shocks[assetClass]) {
        totalShock = totalShock.plus(shocks[assetClass]);
      }

      // Apply volatility shock
      if (shocks.volatility) {
        const volShock = this.calculateVolatilityShock(position, shocks.volatility);
        totalShock = totalShock.plus(volShock);
      }

      // Apply correlation shock
      if (shocks.correlation) {
        const corrShock = await this.calculateCorrelationShock(position, portfolio, shocks.correlation);
        totalShock = totalShock.plus(corrShock);
      }

      // Apply liquidity shock
      if (shocks.liquidity) {
        const liquidityShock = this.calculateLiquidityShock(position, shocks.liquidity);
        totalShock = totalShock.plus(liquidityShock);
      }

      // Update position values
      const originalValue = new Decimal(position.marketValue || 0);
      const shockMultiplier = new Decimal(1).plus(totalShock);
      const newValue = originalValue.times(shockMultiplier);
      
      stressedPosition.marketValue = newValue.toString();
      stressedPosition.stressedPrice = new Decimal(position.lastPrice || 0)
        .times(shockMultiplier).toString();
      
      // Recalculate P&L
      const avgPrice = new Decimal(position.averagePrice || 0);
      const quantity = new Decimal(position.quantity || 0);
      const newPrice = new Decimal(stressedPosition.stressedPrice);
      
      stressedPosition.stressedUnrealizedPnL = quantity.times(newPrice.minus(avgPrice)).toString();
      
      stressedPortfolio.push(stressedPosition);
    }

    return stressedPortfolio;
  }

  calculateVolatilityShock(position, volShockMagnitude) {
    // Higher volatility increases the potential price movement
    const baseVolatility = 0.02; // 2% daily vol assumption
    const volIncrease = volShockMagnitude - 1; // e.g., 2.0 means double vol
    const additionalRisk = baseVolatility * volIncrease;
    
    // Apply random direction with increased magnitude
    const direction = Math.random() > 0.5 ? 1 : -1;
    return new Decimal(additionalRisk * direction);
  }

  async calculateCorrelationShock(position, portfolio, correlationShock) {
    // When correlations increase (approach 1), diversification benefits decrease
    const assetClass = this.getAssetClass(position.symbol);
    let correlationImpact = new Decimal(0);
    
    // Find other positions in different asset classes
    const otherAssetClasses = portfolio
      .filter(p => this.getAssetClass(p.symbol) !== assetClass)
      .map(p => this.getAssetClass(p.symbol));
    
    if (otherAssetClasses.length > 0) {
      // Simplified correlation impact calculation
      const avgCorrelationIncrease = new Decimal(correlationShock).minus(1);
      correlationImpact = avgCorrelationIncrease.times(0.1); // 10% of correlation change
    }
    
    return correlationImpact;
  }

  calculateLiquidityShock(position, liquidityShock) {
    // Liquidity shock increases transaction costs and market impact
    const positionSize = Math.abs(parseFloat(position.marketValue || 0));
    const liquidityImpact = new Decimal(liquidityShock).abs(); // Make positive
    
    // Larger positions are more affected by liquidity issues
    const sizeMultiplier = Math.min(positionSize / 100000, 2.0); // Cap at 2x
    
    return liquidityImpact.times(sizeMultiplier).times(-0.05); // Negative impact
  }

  calculatePortfolioValue(portfolio) {
    return portfolio.reduce((total, position) => {
      return total.plus(Math.abs(parseFloat(position.marketValue || 0)));
    }, new Decimal(0));
  }

  calculateStressRiskMetrics(positionImpacts, portfolioImpact) {
    const impacts = positionImpacts.map(p => p.impact);
    
    // Sort impacts to find worst positions
    const sortedImpacts = [...impacts].sort((a, b) => a - b);
    
    // Calculate concentration risk
    const worstImpacts = sortedImpacts.slice(0, 5); // Top 5 worst
    const concentrationRisk = worstImpacts.reduce((sum, impact) => sum + Math.abs(impact), 0);
    
    // Calculate diversification benefit (or lack thereof)
    const sumOfAbsoluteImpacts = impacts.reduce((sum, impact) => sum + Math.abs(impact), 0);
    const diversificationBenefit = sumOfAbsoluteImpacts - Math.abs(portfolioImpact.toNumber());
    
    return {
      worstPositionImpact: Math.min(...impacts),
      bestPositionImpact: Math.max(...impacts),
      averagePositionImpact: impacts.reduce((sum, i) => sum + i, 0) / impacts.length,
      concentrationRisk,
      diversificationBenefit,
      positionsAtRisk: impacts.filter(i => i < -10000).length, // Positions losing >$10k
      severelyImpactedPositions: positionImpacts.filter(p => p.impactPercent < -10).length
    };
  }

  generateWarnings(riskMetrics, portfolioImpactPercent) {
    const warnings = [];
    
    if (portfolioImpactPercent.lt(-10)) {
      warnings.push({
        level: 'HIGH',
        message: `Portfolio loss exceeds 10%: ${portfolioImpactPercent.toFixed(2)}%`
      });
    }
    
    if (riskMetrics.concentrationRisk > 500000) {
      warnings.push({
        level: 'MEDIUM',
        message: `High concentration risk: top 5 positions lose $${(riskMetrics.concentrationRisk / 1000).toFixed(0)}k`
      });
    }
    
    if (riskMetrics.diversificationBenefit < 0) {
      warnings.push({
        level: 'MEDIUM',
        message: 'Diversification provides no benefit in this scenario'
      });
    }
    
    if (riskMetrics.severelyImpactedPositions > 5) {
      warnings.push({
        level: 'LOW',
        message: `${riskMetrics.severelyImpactedPositions} positions lose more than 10%`
      });
    }
    
    return warnings;
  }

  getAssetClass(symbol) {
    // Simplified asset class mapping
    const assetClassMap = {
      'BTC': 'crypto',
      'ETH': 'crypto',
      'AAPL': 'equity',
      'GOOGL': 'equity',
      'MSFT': 'equity',
      'TSLA': 'equity',
      'GLD': 'commodities',
      'USO': 'commodities',
      'TLT': 'fixed_income',
      'IEF': 'fixed_income',
      'USD': 'fx',
      'EUR': 'fx'
    };
    
    // Extract base symbol (remove USDT, USD suffixes)
    const baseSymbol = symbol.replace(/USDT?$/, '').replace(/USD$/, '');
    return assetClassMap[baseSymbol] || 'equity'; // Default to equity
  }

  async runMonteCarloStressTest(portfolio, iterations = 10000) {
    try {
      const results = [];
      const baselineValue = this.calculatePortfolioValue(portfolio);
      
      for (let i = 0; i < iterations; i++) {
        // Generate random shocks
        const randomShocks = this.generateRandomShocks();
        
        // Apply shocks
        const stressedPortfolio = await this.applyShocks(portfolio, randomShocks);
        const stressedValue = this.calculatePortfolioValue(stressedPortfolio);
        const impact = stressedValue.minus(baselineValue);
        
        results.push({
          iteration: i + 1,
          portfolioValue: stressedValue.toNumber(),
          impact: impact.toNumber(),
          impactPercent: baselineValue.gt(0) ? impact.dividedBy(baselineValue).times(100).toNumber() : 0
        });
      }
      
      // Calculate statistics
      const impacts = results.map(r => r.impact).sort((a, b) => a - b);
      const impactPercents = results.map(r => r.impactPercent).sort((a, b) => a - b);
      
      const stats = {
        iterations,
        baselineValue: baselineValue.toNumber(),
        mean: impacts.reduce((sum, i) => sum + i, 0) / iterations,
        median: impacts[Math.floor(iterations / 2)],
        var95: impacts[Math.floor(iterations * 0.05)], // 5th percentile
        var99: impacts[Math.floor(iterations * 0.01)], // 1st percentile
        var995: impacts[Math.floor(iterations * 0.005)], // 0.5th percentile
        worst: Math.min(...impacts),
        best: Math.max(...impacts),
        standardDeviation: this.calculateStandardDeviation(impacts)
      };
      
      return {
        type: 'monte_carlo',
        timestamp: new Date(),
        statistics: stats,
        results: results.slice(0, 1000) // Return first 1000 for analysis
      };
      
    } catch (error) {
      this.logger?.error('Error running Monte Carlo stress test:', error);
      throw error;
    }
  }

  generateRandomShocks() {
    // Generate correlated random shocks using simplified approach
    const shocks = {};
    
    // Base shock from normal distribution
    const marketShock = this.normalRandom() * 0.05; // 5% std dev
    
    // Correlated shocks for different asset classes
    shocks.equity = marketShock + this.normalRandom() * 0.02;
    shocks.fixed_income = -marketShock * 0.3 + this.normalRandom() * 0.01; // Negative correlation
    shocks.commodities = marketShock * 0.5 + this.normalRandom() * 0.03;
    shocks.fx = this.normalRandom() * 0.02;
    shocks.crypto = marketShock * 1.5 + this.normalRandom() * 0.08; // Higher vol
    
    // Volatility shock
    shocks.volatility = 1 + Math.abs(this.normalRandom()) * 0.5; // 1 to 1.5x vol
    
    return shocks;
  }

  normalRandom() {
    // Box-Muller transformation for normal distribution
    let u = 0, v = 0;
    while(u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  calculateStandardDeviation(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }

  getAvailableScenarios() {
    return Array.from(this.scenarios.entries()).map(([key, scenario]) => ({
      id: key,
      name: scenario.name,
      description: scenario.description,
      probability: scenario.probability,
      duration: scenario.duration
    }));
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      availableScenarios: this.scenarios.size,
      correlationMatrices: this.correlationMatrices.size,
      config: this.config
    };
  }
}

module.exports = StressTest;