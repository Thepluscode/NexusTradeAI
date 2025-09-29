// src/services/performanceService.js
const EventEmitter = require('events');
const Decimal = require('decimal.js');
const ss = require('simple-statistics');

class PerformanceService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.portfolioService = options.portfolioService;
    this.positionService = options.positionService;
    
    // Performance calculation intervals
    this.intervals = {
      realTime: 30000,      // 30 seconds
      daily: 86400000,      // 24 hours  
      weekly: 604800000,    // 7 days
      monthly: 2592000000   // 30 days
    };
    
    // Benchmark data cache
    this.benchmarkCache = new Map();
    this.benchmarkCacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  async initialize() {
    try {
      this.logger?.info('Initializing PerformanceService...');
      
      // Setup performance calculation timers
      this.setupPerformanceTimers();
      
      this.logger?.info('PerformanceService initialized successfully');
    } catch (error) {
      this.logger?.error('Failed to initialize PerformanceService:', error);
      throw error;
    }
  }

  setupPerformanceTimers() {
    // Real-time performance updates
    setInterval(async () => {
      try {
        await this.updateRealTimePerformance();
      } catch (error) {
        this.logger?.error('Error in real-time performance update:', error);
      }
    }, this.intervals.realTime);
    
    // Daily performance calculations
    setInterval(async () => {
      try {
        await this.calculateDailyPerformance();
      } catch (error) {
        this.logger?.error('Error in daily performance calculation:', error);
      }
    }, this.intervals.daily);
  }

  async calculatePerformanceMetrics() {
    try {
      this.logger?.info('Starting performance metrics calculation...');
      
      // Get all active portfolios
      const portfolios = await this.getAllActivePortfolios();
      
      let processedCount = 0;
      
      for (const portfolio of portfolios) {
        try {
          await this.calculatePortfolioPerformance(portfolio.id);
          processedCount++;
        } catch (error) {
          this.logger?.error(`Error calculating performance for portfolio ${portfolio.id}:`, error);
        }
      }
      
      this.logger?.info(`Performance metrics calculated for ${processedCount} portfolios`);
      
      return { processed: processedCount };
      
    } catch (error) {
      this.logger?.error('Error in performance metrics calculation:', error);
      throw error;
    }
  }

  async calculatePortfolioPerformance(portfolioId) {
    try {
      const portfolio = await this.portfolioService.getPortfolio(portfolioId, { 
        includePositions: true 
      });
      
      // Get historical values for performance calculation
      const historicalValues = await this.getPortfolioHistoricalValues(portfolioId);
      
      // Calculate various performance metrics
      const performance = {
        totalReturn: this.calculateTotalReturn(portfolio),
        totalReturnPercent: this.calculateTotalReturnPercent(portfolio),
        dayReturn: this.calculateDayReturn(portfolio, historicalValues),
        dayReturnPercent: this.calculateDayReturnPercent(portfolio, historicalValues),
        weekReturn: this.calculatePeriodReturn(portfolio, historicalValues, 7),
        monthReturn: this.calculatePeriodReturn(portfolio, historicalValues, 30),
        yearReturn: this.calculatePeriodReturn(portfolio, historicalValues, 365),
        annualizedReturn: this.calculateAnnualizedReturn(portfolio, historicalValues),
        sharpeRatio: await this.calculateSharpeRatio(portfolio, historicalValues),
        maxDrawdown: this.calculateMaxDrawdown(historicalValues),
        volatility: this.calculateVolatility(historicalValues),
        beta: await this.calculateBeta(portfolio, historicalValues),
        alpha: await this.calculateAlpha(portfolio, historicalValues)
      };
      
      // Update portfolio with performance metrics
      await this.updatePortfolioPerformance(portfolioId, performance);
      
      // Emit performance update event
      this.emit('performance_calculated', {
        portfolioId,
        performance,
        timestamp: new Date()
      });
      
      return performance;
      
    } catch (error) {
      this.logger?.error(`Error calculating portfolio performance for ${portfolioId}:`, error);
      throw error;
    }
  }

  calculateTotalReturn(portfolio) {
    return portfolio.totalValue - (portfolio.totalCost || 0) + (portfolio.totalRealizedPnL || 0);
  }

  calculateTotalReturnPercent(portfolio) {
    const totalCost = portfolio.totalCost || 0;
    if (totalCost === 0) return 0;
    
    const totalReturn = this.calculateTotalReturn(portfolio);
    return (totalReturn / totalCost) * 100;
  }

  calculateDayReturn(portfolio, historicalValues) {
    const yesterday = this.getValueByDate(historicalValues, this.getDateDaysAgo(1));
    if (!yesterday) return 0;
    
    return portfolio.totalValue - yesterday.value;
  }

  calculateDayReturnPercent(portfolio, historicalValues) {
    const yesterday = this.getValueByDate(historicalValues, this.getDateDaysAgo(1));
    if (!yesterday || yesterday.value === 0) return 0;
    
    const dayReturn = this.calculateDayReturn(portfolio, historicalValues);
    return (dayReturn / yesterday.value) * 100;
  }

  calculatePeriodReturn(portfolio, historicalValues, days) {
    const pastDate = this.getDateDaysAgo(days);
    const pastValue = this.getValueByDate(historicalValues, pastDate);
    
    if (!pastValue) return 0;
    
    return portfolio.totalValue - pastValue.value;
  }

  calculateAnnualizedReturn(portfolio, historicalValues) {
    if (historicalValues.length < 2) return 0;
    
    // Sort historical values by date
    const sortedValues = historicalValues.sort((a, b) => new Date(a.date) - new Date(b.date));
    const firstValue = sortedValues[0];
    const lastValue = sortedValues[sortedValues.length - 1];
    
    const daysDiff = (new Date(lastValue.date) - new Date(firstValue.date)) / (24 * 60 * 60 * 1000);
    if (daysDiff === 0 || firstValue.value === 0) return 0;
    
    const totalReturn = (lastValue.value / firstValue.value) - 1;
    const yearsFraction = daysDiff / 365.25;
    
    return Math.pow(1 + totalReturn, 1 / yearsFraction) - 1;
  }

  async calculateSharpeRatio(portfolio, historicalValues) {
    try {
      const dailyReturns = this.calculateDailyReturns(historicalValues);
      if (dailyReturns.length < 30) return 0; // Need at least 30 days
      
      const avgDailyReturn = ss.mean(dailyReturns);
      const stdDailyReturn = ss.standardDeviation(dailyReturns);
      
      if (stdDailyReturn === 0) return 0;
      
      // Assume 2% risk-free rate (annualized)
      const riskFreeRate = 0.02;
      const dailyRiskFreeRate = riskFreeRate / 365;
      
      const excessReturn = avgDailyReturn - dailyRiskFreeRate;
      const sharpeRatio = excessReturn / stdDailyReturn;
      
      // Annualize the Sharpe ratio
      return sharpeRatio * Math.sqrt(365);
      
    } catch (error) {
      this.logger?.error('Error calculating Sharpe ratio:', error);
      return 0;
    }
  }

  calculateMaxDrawdown(historicalValues) {
    if (historicalValues.length < 2) return 0;
    
    let maxDrawdown = 0;
    let peak = 0;
    
    for (const value of historicalValues) {
      if (value.value > peak) {
        peak = value.value;
      }
      
      const drawdown = peak > 0 ? (peak - value.value) / peak : 0;
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
    
    return maxDrawdown;
  }

  calculateVolatility(historicalValues) {
    const dailyReturns = this.calculateDailyReturns(historicalValues);
    if (dailyReturns.length < 2) return 0;
    
    const volatility = ss.standardDeviation(dailyReturns);
    
    // Annualize the volatility
    return volatility * Math.sqrt(365);
  }

  async calculateBeta(portfolio, historicalValues) {
    try {
      // Get benchmark returns (default to S&P 500)
      const benchmarkReturns = await this.getBenchmarkReturns(
        portfolio.benchmarkIndex || 'SPY',
        historicalValues.length
      );
      
      const portfolioReturns = this.calculateDailyReturns(historicalValues);
      
      if (portfolioReturns.length !== benchmarkReturns.length || portfolioReturns.length < 30) {
        return 1; // Default beta
      }
      
      // Calculate covariance and variance
      const covariance = ss.sampleCovariance(portfolioReturns, benchmarkReturns);
      const benchmarkVariance = ss.sampleVariance(benchmarkReturns);
      
      if (benchmarkVariance === 0) return 1;
      
      return covariance / benchmarkVariance;
      
    } catch (error) {
      this.logger?.error('Error calculating beta:', error);
      return 1;
    }
  }

  async calculateAlpha(portfolio, historicalValues) {
    try {
      const annualizedReturn = this.calculateAnnualizedReturn(portfolio, historicalValues);
      const beta = await this.calculateBeta(portfolio, historicalValues);
      
      // Get benchmark return
      const benchmarkReturn = await this.getBenchmarkAnnualizedReturn(
        portfolio.benchmarkIndex || 'SPY'
      );
      
      const riskFreeRate = 0.02; // 2% risk-free rate
      
      // Alpha = Portfolio Return - [Risk-free Rate + Beta * (Benchmark Return - Risk-free Rate)]
      const alpha = annualizedReturn - (riskFreeRate + beta * (benchmarkReturn - riskFreeRate));
      
      return alpha;
      
    } catch (error) {
      this.logger?.error('Error calculating alpha:', error);
      return 0;
    }
  }

  calculateDailyReturns(historicalValues) {
    if (historicalValues.length < 2) return [];
    
    const sortedValues = historicalValues.sort((a, b) => new Date(a.date) - new Date(b.date));
    const returns = [];
    
    for (let i = 1; i < sortedValues.length; i++) {
      const currentValue = sortedValues[i].value;
      const previousValue = sortedValues[i - 1].value;
      
      if (previousValue > 0) {
        const dailyReturn = (currentValue - previousValue) / previousValue;
        returns.push(dailyReturn);
      }
    }
    
    return returns;
  }

  async updateRealTimePerformance() {
    // Update real-time performance for active portfolios
    // This would be called frequently to keep performance metrics current
  }

  async calculateDailyPerformance() {
    // Calculate end-of-day performance metrics
    // This would run once per day to calculate daily returns, etc.
  }

  // Helper methods
  getDateDaysAgo(days) {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date;
  }

  getValueByDate(historicalValues, targetDate) {
    const targetDateStr = targetDate.toISOString().split('T')[0];
    return historicalValues.find(v => 
      new Date(v.date).toISOString().split('T')[0] === targetDateStr
    );
  }

  async updatePortfolioPerformance(portfolioId, performance) {
    // Update the portfolio document with new performance metrics
    await this.portfolioService.updatePortfolio(portfolioId, { performance });
  }

  async getAllActivePortfolios() {
    // This would fetch from the database
    return [];
  }

  async getPortfolioHistoricalValues(portfolioId) {
    // This would fetch historical portfolio values from database
    return [];
  }

  async getBenchmarkReturns(symbol, days) {
    // Mock benchmark returns - would fetch from market data service
    const returns = [];
    for (let i = 0; i < days; i++) {
      returns.push((Math.random() - 0.5) * 0.02); // Random returns between -1% and 1%
    }
    return returns;
  }

  async getBenchmarkAnnualizedReturn(symbol) {
    // Mock benchmark return - would fetch from market data service
    return 0.10; // 10% annual return
  }
}

module.exports = PerformanceService;