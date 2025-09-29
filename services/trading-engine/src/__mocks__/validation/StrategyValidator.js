// Mock implementation of StrategyValidator for testing
const EventEmitter = require('events');

// First, define the class
class StrategyValidator extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger || {
      info: () => {},
      error: () => {},
      debug: () => {},
    };
    this.strategyPerformance = new Map();
  }

  async validateStrategy(strategyName, signal) {
    // Always return a valid validation result for testing
    return {
      strategyName,
      isValid: true,
      reasons: [],
      performance: {
        winRate: 0.85,
        profitFactor: 2.5,
        sharpeRatio: 1.8,
        maxDrawdown: 0.12,
        totalTrades: 150,
        winLossRatio: 2.1,
        lastUpdated: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    };
  }

  async validateExecutionRequest(executionRequest) {
    // Simple validation that always passes for testing
    return { error: null, value: executionRequest };
  }

  async validateStrategyParameters(strategy, parameters) {
    // Simple validation that always passes for testing
    return { error: null, value: parameters };
  }

  recordTradeResult(strategyName, trade) {
    // Mock implementation of recordTradeResult
    if (!this.strategyPerformance.has(strategyName)) {
      this.strategyPerformance.set(strategyName, {
        wins: 0,
        losses: 0,
        totalTrades: 0,
        totalProfit: 0,
        totalLoss: 0,
        trades: []
      });
    }

    const stats = this.strategyPerformance.get(strategyName);
    const isWin = trade.pnl >= 0;
    
    if (isWin) {
      stats.wins++;
      stats.totalProfit += trade.pnl;
    } else {
      stats.losses++;
      stats.totalLoss += Math.abs(trade.pnl);
    }
    
    stats.totalTrades++;
    stats.trades.push(trade);
    
    // Emit event for any listeners
    this.emit('tradeRecorded', { strategyName, trade, stats });
    
    return stats;
  }

  getStrategyPerformance(strategyName) {
    // Return mock performance data
    return Promise.resolve({
      strategyName,
      winRate: 0.85,
      profitFactor: 2.5,
      sharpeRatio: 1.8,
      maxDrawdown: 0.12,
      totalTrades: 150,
      winLossRatio: 2.1,
      lastUpdated: new Date().toISOString()
    });
  }

  // Add any other methods that might be called during testing
  reset() {
    this.strategyPerformance.clear();
  }
}

// Export the class as both default and named export
module.exports = StrategyValidator;
module.exports.StrategyValidator = StrategyValidator;
