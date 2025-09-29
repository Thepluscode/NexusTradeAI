const EventEmitter = require('events');

// Create a mock function that will be used as the constructor
const StrategyValidator = jest.fn().mockImplementation(function(options = {}) {
  this.logger = options.logger || {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  this.strategyPerformance = new Map();
  
  // Mock the methods
  this.validateStrategy = jest.fn().mockResolvedValue({
    strategyName: 'mock-strategy',
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
  });
  
  this.validateExecutionRequest = jest.fn().mockResolvedValue({ 
    error: null, 
    value: {} 
  });
  
  this.validateStrategyParameters = jest.fn().mockResolvedValue({ 
    error: null, 
    value: {} 
  });
  
  this.recordTradeResult = jest.fn().mockImplementation((strategyName, trade) => {
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
    
    return stats;
  });
  
  this.getStrategyPerformance = jest.fn().mockResolvedValue({
    strategyName: 'mock-strategy',
    winRate: 0.85,
    profitFactor: 2.5,
    sharpeRatio: 1.8,
    maxDrawdown: 0.12,
    totalTrades: 150,
    winLossRatio: 2.1,
    lastUpdated: new Date().toISOString()
  });
  
  this.reset = jest.fn().mockImplementation(() => {
    this.strategyPerformance.clear();
  });
  
  // Make it an EventEmitter
  EventEmitter.call(this);
});

// Set up the prototype chain
Object.setPrototypeOf(StrategyValidator.prototype, EventEmitter.prototype);
Object.setPrototypeOf(StrategyValidator, EventEmitter);

// Add static methods if needed
StrategyValidator.mockClear = function() {
  this.mockClear();
};

module.exports = StrategyValidator;
