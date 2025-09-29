/**
 * Jest Global Setup
 * Common setup for all test types
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/nexus_trade_test';
process.env.TEST_REDIS_URL = process.env.TEST_REDIS_URL || 'redis://localhost:6379/15';

// Global test timeout
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests
const originalConsole = global.console;
global.console = {
  ...originalConsole,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Global test utilities
global.testUtils = {
  // Generate mock market data
  generateMockMarketData: (count = 50, basePrice = 100) => {
    const data = [];
    let currentPrice = basePrice;
    
    for (let i = 0; i < count; i++) {
      const change = (Math.random() - 0.5) * 2; // -1 to 1
      currentPrice += change;
      
      const high = currentPrice + Math.random() * 2;
      const low = currentPrice - Math.random() * 2;
      const volume = Math.floor(1000 + Math.random() * 5000);
      
      data.push({
        timestamp: new Date(Date.now() + i * 60000).toISOString(),
        open: i === 0 ? basePrice : data[i-1].close,
        high: Math.max(high, currentPrice),
        low: Math.min(low, currentPrice),
        close: currentPrice,
        volume: volume
      });
    }
    
    return data;
  },
  
  // Generate mock trading signal
  generateMockSignal: (overrides = {}) => {
    return {
      id: `signal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: 'AAPL',
      action: 'BUY',
      price: 150 + Math.random() * 50,
      quantity: Math.floor(50 + Math.random() * 200),
      strategy: 'trend_following',
      confidence: 0.5 + Math.random() * 0.5,
      timestamp: new Date().toISOString(),
      stopLoss: null,
      takeProfit: null,
      ...overrides
    };
  },
  
  // Generate mock position
  generateMockPosition: (overrides = {}) => {
    const entryPrice = 150 + Math.random() * 50;
    const currentPrice = entryPrice + (Math.random() - 0.5) * 10;
    const quantity = Math.floor(50 + Math.random() * 200);
    
    return {
      symbol: 'AAPL',
      quantity: quantity,
      entryPrice: entryPrice,
      currentPrice: currentPrice,
      unrealizedPnL: (currentPrice - entryPrice) * quantity,
      strategy: 'trend_following',
      confidence: 0.5 + Math.random() * 0.5,
      openedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
      ...overrides
    };
  },
  
  // Wait for async operations
  wait: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Create mock Redis client
  createMockRedis: () => {
    const data = new Map();
    const subscribers = new Map();
    
    return {
      data: data,
      get: jest.fn((key) => Promise.resolve(data.get(key) || null)),
      set: jest.fn((key, value) => {
        data.set(key, value);
        return Promise.resolve('OK');
      }),
      setex: jest.fn((key, ttl, value) => {
        data.set(key, value);
        return Promise.resolve('OK');
      }),
      del: jest.fn((key) => {
        const existed = data.has(key);
        data.delete(key);
        return Promise.resolve(existed ? 1 : 0);
      }),
      lpush: jest.fn((key, value) => {
        const list = data.get(key) || [];
        list.unshift(value);
        data.set(key, list);
        return Promise.resolve(list.length);
      }),
      rpop: jest.fn((key) => {
        const list = data.get(key) || [];
        const value = list.pop();
        data.set(key, list);
        return Promise.resolve(value || null);
      }),
      llen: jest.fn((key) => {
        const list = data.get(key) || [];
        return Promise.resolve(list.length);
      }),
      flushdb: jest.fn(() => {
        data.clear();
        return Promise.resolve('OK');
      }),
      publish: jest.fn((channel, message) => {
        const channelSubscribers = subscribers.get(channel) || [];
        channelSubscribers.forEach(callback => {
          setImmediate(() => callback(channel, message));
        });
        return Promise.resolve(channelSubscribers.length);
      }),
      subscribe: jest.fn((channel) => {
        if (!subscribers.has(channel)) {
          subscribers.set(channel, []);
        }
        return Promise.resolve();
      }),
      on: jest.fn((event, callback) => {
        if (event === 'message') {
          // Store callback for all channels
          for (const [channel, callbacks] of subscribers.entries()) {
            callbacks.push(callback);
          }
        }
      }),
      disconnect: jest.fn(() => Promise.resolve())
    };
  },
  
  // Create mock database client
  createMockDatabase: () => {
    const tables = new Map();
    
    return {
      query: jest.fn((sql, params = []) => {
        // Simple mock implementation
        if (sql.includes('INSERT')) {
          return Promise.resolve({ rows: [{ id: Math.floor(Math.random() * 1000) }], rowCount: 1 });
        } else if (sql.includes('SELECT')) {
          return Promise.resolve({ rows: [], rowCount: 0 });
        } else if (sql.includes('UPDATE')) {
          return Promise.resolve({ rows: [], rowCount: 1 });
        } else if (sql.includes('DELETE')) {
          return Promise.resolve({ rows: [], rowCount: 1 });
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      }),
      connect: jest.fn(() => Promise.resolve({
        query: jest.fn(),
        release: jest.fn()
      })),
      end: jest.fn(() => Promise.resolve())
    };
  }
};

// Global error handler for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Cleanup after all tests
afterAll(async () => {
  // Restore console
  global.console = originalConsole;
  
  // Clean up any global resources
  if (global.testCleanup) {
    await global.testCleanup();
  }
});

// Custom matchers
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toBeValidSignal(received) {
    const requiredFields = ['symbol', 'action', 'price', 'strategy', 'confidence'];
    const validActions = ['BUY', 'SELL', 'HOLD'];
    
    const missingFields = requiredFields.filter(field => !received.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      return {
        message: () => `expected signal to have required fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
    
    if (!validActions.includes(received.action)) {
      return {
        message: () => `expected action to be one of ${validActions.join(', ')}, got ${received.action}`,
        pass: false,
      };
    }
    
    if (typeof received.price !== 'number' || received.price <= 0) {
      return {
        message: () => `expected price to be a positive number, got ${received.price}`,
        pass: false,
      };
    }
    
    if (typeof received.confidence !== 'number' || received.confidence < 0 || received.confidence > 1) {
      return {
        message: () => `expected confidence to be between 0 and 1, got ${received.confidence}`,
        pass: false,
      };
    }
    
    return {
      message: () => `expected signal to be invalid`,
      pass: true,
    };
  },
  
  toBeValidMarketData(received) {
    const requiredFields = ['open', 'high', 'low', 'close', 'volume'];
    const missingFields = requiredFields.filter(field => !received.hasOwnProperty(field));
    
    if (missingFields.length > 0) {
      return {
        message: () => `expected market data to have required fields: ${missingFields.join(', ')}`,
        pass: false,
      };
    }
    
    // Validate OHLC relationships
    if (received.high < received.low) {
      return {
        message: () => `expected high (${received.high}) to be >= low (${received.low})`,
        pass: false,
      };
    }
    
    if (received.high < received.open || received.high < received.close) {
      return {
        message: () => `expected high (${received.high}) to be >= open (${received.open}) and close (${received.close})`,
        pass: false,
      };
    }
    
    if (received.low > received.open || received.low > received.close) {
      return {
        message: () => `expected low (${received.low}) to be <= open (${received.open}) and close (${received.close})`,
        pass: false,
      };
    }
    
    if (received.volume < 0) {
      return {
        message: () => `expected volume to be non-negative, got ${received.volume}`,
        pass: false,
      };
    }
    
    return {
      message: () => `expected market data to be invalid`,
      pass: true,
    };
  }
});

console.log('Jest global setup completed');
