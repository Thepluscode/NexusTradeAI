// src/services/analyticsService.js
const EventEmitter = require('events');
const math = require('mathjs');
const ss = require('simple-statistics');
const Trade = require('../models/Trade');
const Portfolio = require('../models/Portfolio');

class AnalyticsService extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
  }

  async initialize() {
    this.logger?.info('Initializing AnalyticsService...');
  }

  async calculatePerformanceMetrics(userId, dateRange = {}) {
    try {
      const { startDate, endDate } = this.normalizeDateRange(dateRange);
      
      // Get user trades and portfolio data
      const trades = await Trade.find({
        userId,
        executedAt: { $gte: startDate, $lte: endDate }
      }).sort({ executedAt: 1 });

      const portfolios = await Portfolio.find({ userId });

      // Calculate metrics
      const metrics = {
        totalReturn: await this.calculateTotalReturn(trades, portfolios),
        sharpeRatio: await this.calculateSharpeRatio(trades),
        maxDrawdown: await this.calculateMaxDrawdown(trades),
        volatility: await this.calculateVolatility(trades),
        winRate: await this.calculateWinRate(trades),
        profitFactor: await this.calculateProfitFactor(trades),
        averageHoldingPeriod: await this.calculateAverageHoldingPeriod(trades),
        tradingFrequency: await this.calculateTradingFrequency(trades, dateRange),
        riskAdjustedReturn: 0, // Will be calculated
        benchmarkComparison: await this.compareToBenchmark(trades, 'SPY')
      };

      // Calculate risk-adjusted return
      metrics.riskAdjustedReturn = metrics.volatility > 0 ? 
        metrics.totalReturn / metrics.volatility : 0;

      this.logger?.info(`Performance metrics calculated for user: ${userId}`);
      
      return metrics;

    } catch (error) {
      this.logger?.error('Error calculating performance metrics:', error);
      throw error;
    }
  }

  async calculateTotalReturn(trades, portfolios) {
    try {
      let totalInvested = 0;
      let totalCurrentValue = 0;

      // Calculate from portfolio values
      for (const portfolio of portfolios) {
        totalInvested += portfolio.totalCost || 0;
        totalCurrentValue += portfolio.totalValue || 0;
      }

      const totalReturn = totalInvested > 0 ? 
        ((totalCurrentValue - totalInvested) / totalInvested) * 100 : 0;

      return {
        absolute: totalCurrentValue - totalInvested,
        percentage: totalReturn,
        invested: totalInvested,
        currentValue: totalCurrentValue
      };

    } catch (error) {
      throw new Error(`Error calculating total return: ${error.message}`);
    }
  }

  async calculateSharpeRatio(trades, riskFreeRate = 0.02) {
    try {
      if (trades.length < 2) return 0;

      // Calculate daily returns
      const returns = this.calculateDailyReturns(trades);
      
      if (returns.length < 2) return 0;

      const meanReturn = ss.mean(returns);
      const stdReturn = ss.standardDeviation(returns);
      
      // Annualize the Sharpe ratio
      const annualizedReturn = meanReturn * 252; // 252 trading days
      const annualizedVolatility = stdReturn * Math.sqrt(252);
      
      const sharpeRatio = annualizedVolatility > 0 ? 
        (annualizedReturn - riskFreeRate) / annualizedVolatility : 0;

      return {
        ratio: sharpeRatio,
        annualizedReturn,
        annualizedVolatility,
        riskFreeRate
      };

    } catch (error) {
      throw new Error(`Error calculating Sharpe ratio: ${error.message}`);
    }
  }

  async calculateMaxDrawdown(trades) {
    try {
      if (trades.length < 2) return { percentage: 0, peak: 0, trough: 0 };

      // Calculate cumulative returns
      const cumulativeReturns = this.calculateCumulativeReturns(trades);
      
      let maxDrawdown = 0;
      let peak = cumulativeReturns[0];
      let peakIndex = 0;
      let troughIndex = 0;

      for (let i = 1; i < cumulativeReturns.length; i++) {
        if (cumulativeReturns[i] > peak) {
          peak = cumulativeReturns[i];
          peakIndex = i;
        }

        const drawdown = (peak - cumulativeReturns[i]) / peak * 100;
        if (drawdown > maxDrawdown) {
          maxDrawdown = drawdown;
          troughIndex = i;
        }
      }

      return {
        percentage: maxDrawdown,
        peak: peak,
        trough: cumulativeReturns[troughIndex],
        peakDate: trades[peakIndex]?.executedAt,
        troughDate: trades[troughIndex]?.executedAt
      };

    } catch (error) {
      throw new Error(`Error calculating max drawdown: ${error.message}`);
    }
  }

  async calculateVolatility(trades) {
    try {
      const returns = this.calculateDailyReturns(trades);
      
      if (returns.length < 2) return 0;

      const volatility = ss.standardDeviation(returns);
      const annualizedVolatility = volatility * Math.sqrt(252);

      return {
        daily: volatility,
        annualized: annualizedVolatility
      };

    } catch (error) {
      throw new Error(`Error calculating volatility: ${error.message}`);
    }
  }

  async calculateWinRate(trades) {
    try {
      const profitableTrades = trades.filter(trade => 
        (trade.realizedGainLoss || 0) > 0
      ).length;
      
      const totalTrades = trades.length;
      const winRate = totalTrades > 0 ? (profitableTrades / totalTrades) * 100 : 0;

      return {
        percentage: winRate,
        winningTrades: profitableTrades,
        totalTrades
      };

    } catch (error) {
      throw new Error(`Error calculating win rate: ${error.message}`);
    }
  }

  async calculateProfitFactor(trades) {
    try {
      const winningTradesProfit = trades
        .filter(trade => (trade.realizedGainLoss || 0) > 0)
        .reduce((sum, trade) => sum + (trade.realizedGainLoss || 0), 0);

      const losingTradesLoss = Math.abs(trades
        .filter(trade => (trade.realizedGainLoss || 0) < 0)
        .reduce((sum, trade) => sum + (trade.realizedGainLoss || 0), 0));

      const profitFactor = losingTradesLoss > 0 ? 
        winningTradesProfit / losingTradesLoss : 
        winningTradesProfit > 0 ? Infinity : 0;

      return {
        ratio: profitFactor,
        grossProfit: winningTradesProfit,
        grossLoss: losingTradesLoss
      };

    } catch (error) {
      throw new Error(`Error calculating profit factor: ${error.message}`);
    }
  }

  async calculateAverageHoldingPeriod(trades) {
    try {
      const holdingPeriods = [];

      // Group trades by symbol to calculate holding periods
      const tradesBySymbol = trades.reduce((acc, trade) => {
        if (!acc[trade.symbol]) acc[trade.symbol] = [];
        acc[trade.symbol].push(trade);
        return acc;
      }, {});

      for (const symbol in tradesBySymbol) {
        const symbolTrades = tradesBySymbol[symbol].sort((a, b) => 
          new Date(a.executedAt) - new Date(b.executedAt)
        );

        for (let i = 0; i < symbolTrades.length - 1; i++) {
          if (symbolTrades[i].side === 'buy' && symbolTrades[i + 1].side === 'sell') {
            const holdingTime = new Date(symbolTrades[i + 1].executedAt) - 
                              new Date(symbolTrades[i].executedAt);
            holdingPeriods.push(holdingTime / (1000 * 60 * 60 * 24)); // Convert to days
          }
        }
      }

      const averageHoldingPeriod = holdingPeriods.length > 0 ? 
        ss.mean(holdingPeriods) : 0;

      return {
        days: averageHoldingPeriod,
        median: holdingPeriods.length > 0 ? ss.median(holdingPeriods) : 0,
        samples: holdingPeriods.length
      };

    } catch (error) {
      throw new Error(`Error calculating average holding period: ${error.message}`);
    }
  }

  async calculateTradingFrequency(trades, dateRange) {
    try {
      const { startDate, endDate } = dateRange;
      const daysDifference = (endDate - startDate) / (1000 * 60 * 60 * 24);
      
      const tradesPerDay = daysDifference > 0 ? trades.length / daysDifference : 0;
      const tradesPerWeek = tradesPerDay * 7;
      const tradesPerMonth = tradesPerDay * 30;

      return {
        daily: tradesPerDay,
        weekly: tradesPerWeek,
        monthly: tradesPerMonth,
        total: trades.length,
        period: daysDifference
      };

    } catch (error) {
      throw new Error(`Error calculating trading frequency: ${error.message}`);
    }
  }

  async compareToBenchmark(trades, benchmarkSymbol = 'SPY') {
    try {
      // Mock implementation - would integrate with market data service
      // to get benchmark performance for the same period
      
      const userReturn = await this.calculateTotalReturn(trades, []);
      const benchmarkReturn = 8.5; // Mock S&P 500 annual return
      
      const alpha = userReturn.percentage - benchmarkReturn;
      const outperformed = alpha > 0;

      return {
        benchmarkSymbol,
        benchmarkReturn,
        userReturn: userReturn.percentage,
        alpha,
        outperformed,
        trackingError: Math.abs(alpha) // Simplified tracking error
      };

    } catch (error) {
      throw new Error(`Error comparing to benchmark: ${error.message}`);
    }
  }

  // Helper methods
  calculateDailyReturns(trades) {
    if (trades.length < 2) return [];

    const returns = [];
    let previousValue = trades[0].price * trades[0].quantity;

    for (let i = 1; i < trades.length; i++) {
      const currentValue = trades[i].price * trades[i].quantity;
      const dailyReturn = (currentValue - previousValue) / previousValue;
      returns.push(dailyReturn);
      previousValue = currentValue;
    }

    return returns;
  }

  calculateCumulativeReturns(trades) {
    const returns = this.calculateDailyReturns(trades);
    const cumulativeReturns = [1]; // Start with 1 (100%)

    for (const dailyReturn of returns) {
      const lastValue = cumulativeReturns[cumulativeReturns.length - 1];
      cumulativeReturns.push(lastValue * (1 + dailyReturn));
    }

    return cumulativeReturns;
  }

  normalizeDateRange(dateRange) {
    const endDate = dateRange.endDate ? new Date(dateRange.endDate) : new Date();
    const startDate = dateRange.startDate ? 
      new Date(dateRange.startDate) : 
      new Date(endDate.getTime() - (90 * 24 * 60 * 60 * 1000)); // Default 90 days

    return { startDate, endDate };
  }

  async generatePerformanceReport(userId, options = {}) {
    try {
      const metrics = await this.calculatePerformanceMetrics(userId, options.dateRange);
      
      const report = {
        userId,
        generatedAt: new Date(),
        period: options.dateRange || {},
        summary: {
          totalReturn: metrics.totalReturn,
          sharpeRatio: metrics.sharpeRatio.ratio,
          maxDrawdown: metrics.maxDrawdown.percentage,
          winRate: metrics.winRate.percentage
        },
        detailedMetrics: metrics,
        recommendations: this.generateRecommendations(metrics)
      };

      this.logger?.info(`Performance report generated for user: ${userId}`);
      
      return report;

    } catch (error) {
      this.logger?.error('Error generating performance report:', error);
      throw error;
    }
  }

  generateRecommendations(metrics) {
    const recommendations = [];

    // Risk management recommendations
    if (metrics.maxDrawdown.percentage > 20) {
      recommendations.push({
        type: 'risk_management',
        priority: 'high',
        message: 'Consider implementing stricter stop-loss orders to reduce maximum drawdown',
        category: 'Risk Control'
      });
    }

    // Diversification recommendations
    if (metrics.volatility.annualized > 30) {
      recommendations.push({
        type: 'diversification',
        priority: 'medium',
        message: 'High volatility detected. Consider diversifying across different asset classes',
        category: 'Portfolio Management'
      });
    }

    // Performance improvement
    if (metrics.sharpeRatio.ratio < 1) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        message: 'Sharpe ratio below 1. Focus on risk-adjusted returns rather than absolute returns',
        category: 'Performance Optimization'
      });
    }

    // Trading frequency
    if (metrics.tradingFrequency && metrics.tradingFrequency.daily > 10) {
      recommendations.push({
        type: 'trading_frequency',
        priority: 'low',
        message: 'High trading frequency detected. Consider longer-term strategies to reduce costs',
        category: 'Cost Management'
      });
    }

    return recommendations;
  }
}

module.exports = AnalyticsService;