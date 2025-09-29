// src/calculators/varCalculator.js
const Decimal = require('decimal.js');
const math = require('mathjs');
const ss = require('simple-statistics');

class VarCalculator {
  constructor(options = {}) {
    this.logger = options.logger;
    this.confidenceLevels = [0.95, 0.99, 0.999];
    this.timeHorizons = [1, 5, 10, 21]; // days
    this.methods = ['parametric', 'historical', 'monte_carlo'];
  }

  async calculatePortfolioVaR(portfolio, options = {}) {
    const {
      confidenceLevel = 0.95,
      timeHorizon = 1,
      method = 'parametric',
      iterations = 10000
    } = options;

    try {
      let varResult;

      switch (method) {
        case 'parametric':
          varResult = await this.calculateParametricVaR(portfolio, confidenceLevel, timeHorizon);
          break;
        case 'historical':
          varResult = await this.calculateHistoricalVaR(portfolio, confidenceLevel, timeHorizon);
          break;
        case 'monte_carlo':
          varResult = await this.calculateMonteCarloVaR(portfolio, confidenceLevel, timeHorizon, iterations);
          break;
        default:
          throw new Error(`Unknown VaR method: ${method}`);
      }

      return {
        ...varResult,
        method,
        confidenceLevel,
        timeHorizon,
        portfolio: {
          value: this.calculatePortfolioValue(portfolio),
          positions: portfolio.length
        },
        timestamp: new Date()
      };

    } catch (error) {
      this.logger?.error('Error calculating VaR:', error);
      throw error;
    }
  }

  async calculateParametricVaR(portfolio, confidenceLevel, timeHorizon) {
    // Calculate portfolio statistics
    const portfolioStats = await this.calculatePortfolioStatistics(portfolio);
    const zScore = this.getZScore(confidenceLevel);
    
    // Portfolio VaR using portfolio volatility
    const portfolioValue = new Decimal(portfolioStats.value);
    const portfolioVolatility = new Decimal(portfolioStats.volatility);
    const timeAdjustment = Math.sqrt(timeHorizon);
    
    const var_ = portfolioValue.times(portfolioVolatility).times(zScore).times(timeAdjustment);
    
    // Component VaR for each position
    const componentVaRs = await this.calculateComponentVaRs(portfolio, portfolioStats, zScore, timeHorizon);
    
    return {
      var: var_.toNumber(),
      expectedShortfall: var_.times(this.getExpectedShortfallMultiplier(confidenceLevel)).toNumber(),
      componentVaRs,
      portfolioStats,
      volatilityContributions: this.calculateVolatilityContributions(portfolio, portfolioStats)
    };
  }

  async calculateHistoricalVaR(portfolio, confidenceLevel, timeHorizon) {
    // Get historical returns for portfolio
    const historicalReturns = await this.getHistoricalPortfolioReturns(portfolio, 252); // 1 year
    
    if (historicalReturns.length < 100) {
      throw new Error('Insufficient historical data for historical VaR calculation');
    }
    
    // Adjust returns for time horizon
    const adjustedReturns = historicalReturns.map(r => r * Math.sqrt(timeHorizon));
    
    // Sort returns and find percentile
    const sortedReturns = adjustedReturns.sort((a, b) => a - b);
    const percentileIndex = Math.floor((1 - confidenceLevel) * sortedReturns.length);
    const varReturn = sortedReturns[percentileIndex];
    
    const portfolioValue = this.calculatePortfolioValue(portfolio);
    const var_ = Math.abs(portfolioValue * varReturn);
    
    // Expected Shortfall (average of returns worse than VaR)
    const tailReturns = sortedReturns.slice(0, percentileIndex);
    const expectedShortfallReturn = tailReturns.length > 0 ? 
      tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length : varReturn;
    const expectedShortfall = Math.abs(portfolioValue * expectedShortfallReturn);
    
    return {
      var: var_,
      expectedShortfall,
      historicalData: {
        observations: historicalReturns.length,
        worst: Math.min(...sortedReturns),
        best: Math.max(...sortedReturns),
        percentile: percentileIndex / sortedReturns.length
      }
    };
  }

  async calculateMonteCarloVaR(portfolio, confidenceLevel, timeHorizon, iterations) {
    const portfolioValue = this.calculatePortfolioValue(portfolio);
    const correlationMatrix = await this.getCorrelationMatrix(portfolio);
    const volatilities = await this.getAssetVolatilities(portfolio);
    
    const simulatedReturns = [];
    
    for (let i = 0; i < iterations; i++) {
      // Generate correlated random returns
      const randomReturns = this.generateCorrelatedReturns(portfolio, correlationMatrix, volatilities, timeHorizon);
      
      // Calculate portfolio return
      let portfolioReturn = 0;
      portfolio.forEach((position, index) => {
        const weight = Math.abs(parseFloat(position.marketValue)) / portfolioValue;
        portfolioReturn += weight * randomReturns[index];
      });
      
      simulatedReturns.push(portfolioReturn);
    }
    
    // Sort and find VaR
    const sortedReturns = simulatedReturns.sort((a, b) => a - b);
    const percentileIndex = Math.floor((1 - confidenceLevel) * iterations);
    const varReturn = sortedReturns[percentileIndex];
    const var_ = Math.abs(portfolioValue * varReturn);
    
    // Expected Shortfall
    const tailReturns = sortedReturns.slice(0, percentileIndex);
    const expectedShortfallReturn = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
    const expectedShortfall = Math.abs(portfolioValue * expectedShortfallReturn);
    
    return {
      var: var_,
      expectedShortfall,
      simulation: {
        iterations,
        mean: ss.mean(simulatedReturns),
        standardDeviation: ss.standardDeviation(simulatedReturns),
        skewness: ss.sampleSkewness(simulatedReturns),
        kurtosis: ss.sampleKurtosis(simulatedReturns)
      }
    };
  }

  async calculateComponentVaRs(portfolio, portfolioStats, zScore, timeHorizon) {
    const componentVaRs = [];
    const portfolioVolatility = new Decimal(portfolioStats.volatility);
    const portfolioValue = new Decimal(portfolioStats.value);
    
    for (const position of portfolio) {
      const positionValue = new Decimal(Math.abs(parseFloat(position.marketValue || 0)));
      const weight = positionValue.dividedBy(portfolioValue);
      
      // Get position volatility and correlation with portfolio
      const positionVolatility = await this.getAssetVolatility(position.symbol);
      const beta = await this.getAssetBeta(position.symbol, portfolio);
      
      // Component VaR = Weight × Portfolio VaR × Beta
      const portfolioVaR = portfolioValue.times(portfolioVolatility).times(zScore).times(Math.sqrt(timeHorizon));
      const componentVaR = weight.times(portfolioVaR).times(beta);
      
      componentVaRs.push({
        symbol: position.symbol,
        weight: weight.toNumber(),
        volatility: positionVolatility,
        beta: beta,
        componentVaR: componentVaR.toNumber(),
        contribution: componentVaR.dividedBy(portfolioVaR).times(100).toNumber()
      });
    }
    
    return componentVaRs;
  }

  async calculatePortfolioStatistics(portfolio) {
    const totalValue = this.calculatePortfolioValue(portfolio);
    const correlationMatrix = await this.getCorrelationMatrix(portfolio);
    
    // Calculate portfolio volatility
    let portfolioVariance = 0;
    
    for (let i = 0; i < portfolio.length; i++) {
      for (let j = 0; j < portfolio.length; j++) {
        const weightI = Math.abs(parseFloat(portfolio[i].marketValue || 0)) / totalValue;
        const weightJ = Math.abs(parseFloat(portfolio[j].marketValue || 0)) / totalValue;
        const volI = await this.getAssetVolatility(portfolio[i].symbol);
        const volJ = await this.getAssetVolatility(portfolio[j].symbol);
        const correlation = i === j ? 1 : correlationMatrix[i][j];
        
        portfolioVariance += weightI * weightJ * volI * volJ * correlation;
      }
    }
    
    const portfolioVolatility = Math.sqrt(portfolioVariance);
    
    return {
      value: totalValue,
      volatility: portfolioVolatility,
      positions: portfolio.length,
      diversificationRatio: this.calculateDiversificationRatio(portfolio, portfolioVolatility)
    };
  }

  calculateDiversificationRatio(portfolio, portfolioVolatility) {
    // Diversification ratio = Weighted average volatility / Portfolio volatility
    const totalValue = this.calculatePortfolioValue(portfolio);
    let weightedVolatility = 0;
    
    portfolio.forEach(async (position) => {
      const weight = Math.abs(parseFloat(position.marketValue || 0)) / totalValue;
      const volatility = await this.getAssetVolatility(position.symbol);
      weightedVolatility += weight * volatility;
    });
    
    return portfolioVolatility > 0 ? weightedVolatility / portfolioVolatility : 1;
  }

  calculateVolatilityContributions(portfolio, portfolioStats) {
    const totalValue = portfolioStats.value;
    const portfolioVolatility = portfolioStats.volatility;
    
    return portfolio.map(async (position) => {
      const weight = Math.abs(parseFloat(position.marketValue || 0)) / totalValue;
      const volatility = await this.getAssetVolatility(position.symbol);
      const contribution = (weight * volatility) / portfolioVolatility;
      
      return {
        symbol: position.symbol,
        weight,
        volatility,
        contribution: contribution * 100 // percentage
      };
    });
  }

  generateCorrelatedReturns(portfolio, correlationMatrix, volatilities, timeHorizon) {
    // Generate uncorrelated random numbers
    const randomNumbers = portfolio.map(() => this.normalRandom());
    
    // Apply Cholesky decomposition for correlation
    const cholesky = this.choleskyDecomposition(correlationMatrix);
    const correlatedReturns = math.multiply(cholesky, randomNumbers);
    
    // Apply volatilities and time horizon
    return correlatedReturns.map((value, index) => {
      return value * volatilities[index] * Math.sqrt(timeHorizon);
    });
  }

  choleskyDecomposition(matrix) {
    const n = matrix.length;
    const L = Array(n).fill().map(() => Array(n).fill(0));
    
    for (let i = 0; i < n; i++) {
      for (let j = 0; j <= i; j++) {
        if (i === j) {
          let sum = 0;
          for (let k = 0; k < j; k++) {
            sum += L[j][k] * L[j][k];
          }
          L[i][j] = Math.sqrt(matrix[i][i] - sum);
        } else {
          let sum = 0;
          for (let k = 0; k < j; k++) {
            sum += L[i][k] * L[j][k];
          }
          L[i][j] = (matrix[i][j] - sum) / L[j][j];
        }
      }
    }
    
    return L;
  }

  normalRandom() {
    // Box-Muller transformation
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }

  calculatePortfolioValue(portfolio) {
    return portfolio.reduce((total, position) => {
      return total + Math.abs(parseFloat(position.marketValue || 0));
    }, 0);
  }

  getZScore(confidenceLevel) {
    const zScores = {
      0.90: 1.282,
      0.95: 1.645,
      0.99: 2.326,
      0.999: 3.090
    };
    return zScores[confidenceLevel] || 1.645;
  }

  getExpectedShortfallMultiplier(confidenceLevel) {
    // Approximate multiplier for Expected Shortfall
    const multipliers = {
      0.90: 1.28,
      0.95: 1.34,
      0.99: 1.48,
      0.999: 1.58
    };
    return multipliers[confidenceLevel] || 1.34;
  }

  // Placeholder methods - would connect to market data service
  async getAssetVolatility(symbol) {
    const volatilityMap = {
      'AAPL': 0.25,
      'GOOGL': 0.28,
      'MSFT': 0.22,
      'TSLA': 0.45,
      'BTCUSDT': 0.60,
      'ETHUSDT': 0.65
    };
    return volatilityMap[symbol] || 0.25;
  }

  async getAssetBeta(symbol, portfolio) {
    // Simplified beta calculation relative to portfolio
    const betaMap = {
      'AAPL': 1.2,
      'GOOGL': 1.1,
      'MSFT': 0.9,
      'TSLA': 1.8,
      'BTCUSDT': 2.0,
      'ETHUSDT': 1.9
    };
    return betaMap[symbol] || 1.0;
  }

  async getCorrelationMatrix(portfolio) {
    // Simplified correlation matrix
    const n = portfolio.length;
    const matrix = Array(n).fill().map(() => Array(n).fill(0.3)); // Default 30% correlation
    
    // Diagonal is 1 (perfect correlation with itself)
    for (let i = 0; i < n; i++) {
      matrix[i][i] = 1.0;
    }
    
    return matrix;
  }

  async getAssetVolatilities(portfolio) {
    const volatilities = [];
    for (const position of portfolio) {
      volatilities.push(await this.getAssetVolatility(position.symbol));
    }
    return volatilities;
  }

  async getHistoricalPortfolioReturns(portfolio, days) {
    // Simplified historical returns generation
    const returns = [];
    for (let i = 0; i < days; i++) {
      let portfolioReturn = 0;
      const totalValue = this.calculatePortfolioValue(portfolio);
      
      portfolio.forEach(async (position) => {
        const weight = Math.abs(parseFloat(position.marketValue || 0)) / totalValue;
        const volatility = await this.getAssetVolatility(position.symbol);
        const dailyReturn = this.normalRandom() * volatility / Math.sqrt(252); // Daily return
        portfolioReturn += weight * dailyReturn;
      });
      
      returns.push(portfolioReturn);
    }
    return returns;
  }
}

module.exports = VarCalculator;