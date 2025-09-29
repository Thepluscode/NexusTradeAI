// Setup test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = 0; // Use random port for tests

// Mock the logger
jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
  silly: jest.fn()
}));

// Mock StrategyValidator
jest.mock('../src/validation/StrategyValidator', () => {
  const { EventEmitter } = require('events');
  
  // Create a mock class that extends EventEmitter
  class MockStrategyValidator extends EventEmitter {
    constructor(options = {}) {
      super();
      this.logger = options.logger || {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      this.strategyPerformance = new Map();
    }

    async validateStrategy() {
      return {
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
      };
    }

    async validateExecutionRequest() {
      return { error: null, value: {} };
    }

    async validateStrategyParameters() {
      return { error: null, value: {} };
    }

    recordTradeResult(strategyName, trade) {
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
      
      this.emit('tradeRecorded', { strategyName, trade, stats });
      
      return stats;
    }

    getStrategyPerformance() {
      return Promise.resolve({
        strategyName: 'mock-strategy',
        winRate: 0.85,
        profitFactor: 2.5,
        sharpeRatio: 1.8,
        maxDrawdown: 0.12,
        totalTrades: 150,
        winLossRatio: 2.1,
        lastUpdated: new Date().toISOString()
      });
    }

    reset() {
      this.strategyPerformance.clear();
    }
  }

  return MockStrategyValidator;
});

// Mock MongoDB
jest.mock('mongoose', () => {
  return {
    connect: jest.fn().mockResolvedValue({}),
    connection: {
      on: jest.fn(),
      once: jest.fn()
    },
    Schema: jest.fn(),
    model: jest.fn().mockReturnValue({
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue({}),
      findById: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
      deleteOne: jest.fn().mockResolvedValue({}),
      countDocuments: jest.fn().mockResolvedValue(0)
    })
  };
});

// Mock Redis
jest.mock('redis', () => {
  const redisMock = require('redis-mock');
  const client = redisMock.createClient();
  
  // Add promise support to the mock client
  client.get = jest.fn().mockResolvedValue(null);
  client.set = jest.fn().mockResolvedValue('OK');
  client.del = jest.fn().mockResolvedValue(1);
  client.expire = jest.fn().mockResolvedValue(1);
  client.connect = jest.fn().mockResolvedValue('OK');
  client.quit = jest.fn().mockResolvedValue('OK');
  
  return {
    createClient: jest.fn(() => client)
  };
});

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    connect: jest.fn().mockResolvedValue('OK'),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn().mockImplementation((event, callback) => {
      if (event === 'connect') callback();
      if (event === 'error') callback(new Error('Redis error'));
      return this;
    })
  }));
});

// Mock the TradeExecutionEngine
jest.mock('../src/execution/TradeExecutionEngine', () => {
  return jest.fn().mockImplementation(() => ({
    executeStrategy: jest.fn().mockResolvedValue({
      success: true,
      executionId: 'test-execution-123',
      status: 'pending'
    }),
    cancelExecution: jest.fn().mockResolvedValue(true),
    getExecutionStatus: jest.fn(),
    getExecutionHistory: jest.fn()
  }));
});

// Mock the StrategyValidator
jest.mock('../src/validation/StrategyValidator', () => ({
  validateStrategy: jest.fn().mockImplementation((strategy, params) => ({
    valid: true,
    errors: []
  }))
}));

// Mock the database module
jest.mock('../src/db', () => ({
  saveExecution: jest.fn().mockImplementation((execution) => 
    Promise.resolve({ ...execution, id: 'test-execution-id' })
  ),
  getExecutionById: jest.fn().mockImplementation((id) => 
    Promise.resolve({ id, status: 'completed' })
  ),
  updateExecutionStatus: jest.fn().mockResolvedValue(true),
  getExecutions: jest.fn().mockResolvedValue({ 
    data: [], 
    total: 0 
  })
}));

// Mock the market data service
jest.mock('../src/services/marketDataService', () => ({
  getMarketData: jest.fn().mockResolvedValue({
    symbol: 'BTC-USD',
    timeframe: '1d',
    data: [
      { timestamp: '2023-01-01T00:00:00Z', open: 100, high: 105, low: 95, close: 102, volume: 1000 },
      { timestamp: '2023-01-02T00:00:00Z', open: 102, high: 108, low: 98, close: 105, volume: 1200 },
      { timestamp: '2023-01-03T00:00:00Z', open: 105, high: 110, low: 100, close: 98, volume: 1500 },
    ]
  })
}));

// Mock the order service
jest.mock('../src/services/orderService', () => ({
  createOrder: jest.fn().mockResolvedValue({
    id: 'order-123',
    status: 'filled',
    symbol: 'BTC-USD',
    side: 'buy',
    quantity: 0.5,
    price: 30000.50,
    timestamp: new Date().toISOString()
  }),
  cancelOrder: jest.fn().mockResolvedValue(true)
}));

// Mock the notification service
jest.mock('../src/services/notificationService', () => ({
  sendNotification: jest.fn().mockResolvedValue(true)
}));

// Mock the strategy factory
jest.mock('../src/strategies/strategyFactory', () => ({
  createStrategy: jest.fn().mockImplementation((strategyName, params) => ({
    name: strategyName,
    params,
    execute: jest.fn().mockResolvedValue({
      signal: 'buy',
      confidence: 0.85,
      price: 30000.50,
      stopLoss: 29500.00,
      takeProfit: 31000.00,
      timestamp: new Date().toISOString()
    })
  }))
}));

// Mock the risk management service
jest.mock('../src/services/riskManagementService', () => ({
  calculatePositionSize: jest.fn().mockResolvedValue(0.5),
  validateRiskParameters: jest.fn().mockResolvedValue({ valid: true, errors: [] })
}));

// Mock the JWT verification
jest.mock('jsonwebtoken', () => ({
  verify: jest.fn().mockImplementation((token, secret, callback) => {
    if (token === 'valid-token') {
      callback(null, { userId: 'test-user-123', email: 'test@example.com' });
    } else {
      callback(new Error('Invalid token'));
    }
  })
}));

// Mock the UUID module
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-execution-id')
}));

// Mock the date to be consistent in tests
const mockDate = new Date('2023-06-15T14:30:00Z');
global.Date = jest.fn(() => mockDate);
global.Date.now = jest.fn(() => mockDate.getTime());

// Mock the console methods to keep test output clean
global.console = {
  ...console,
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

// Mock the process.exit to prevent tests from exiting
process.exit = jest.fn();
