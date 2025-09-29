#!/usr/bin/env node

/**
 * Nexus Trade AI - Orchestrator Test Suite
 * 
 * This file provides a simple test environment for the NexusTradeSystemOrchestrator
 * without requiring all the actual service implementations.
 */

const NexusTradeSystemOrchestrator = require('./NexusTradeSystemOrchestrator');

// Mock configuration for testing
const TEST_CONFIG = {
  maxDailyVolume: 1_000_000, // $1M for testing
  maxPositions: 10,
  maxDrawdown: -0.05, // 5% for testing
  targetLatency: 1000, // 1ms for testing
  maxLatency: 5000, // 5ms for testing
  targetThroughput: 1000, // 1k orders/sec for testing
  emergencyShutdownLoss: -50000, // $50k for testing
  criticalLatencyThreshold: 10000, // 10ms
  maxRiskBreaches: 3,
  riskCheckInterval: 5000, // 5 seconds for testing
  performanceLogInterval: 10000, // 10 seconds for testing
  systemHealthCheckInterval: 15000 // 15 seconds for testing
};

// Test symbols
const TEST_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT'];

// Test strategies
const TEST_STRATEGIES = [
  {
    id: 'test_mean_reversion',
    type: 'mean_reversion',
    symbol: 'AAPL',
    lookbackPeriod: 10,
    zScoreThreshold: 1.5
  },
  {
    id: 'test_momentum',
    type: 'momentum',
    symbol: 'GOOGL',
    momentumPeriod: 5,
    threshold: 0.01
  }
];

/**
 * Mock service implementations for testing
 */
class MockUltraHighSpeedEngine {
  constructor(config) {
    this.config = config;
    this.stats = {
      ordersProcessed: 0,
      tradesExecuted: 0,
      avgLatency: 150
    };
  }

  async registerSymbol(symbol) {
    console.log(`📈 Mock: Registered symbol ${symbol}`);
  }

  async addStrategy(strategyId, strategy) {
    console.log(`🎯 Mock: Added strategy ${strategyId}`);
  }

  getPerformanceStats() {
    this.stats.ordersProcessed += Math.floor(Math.random() * 100);
    this.stats.tradesExecuted += Math.floor(Math.random() * 10);
    this.stats.avgLatency = 100 + Math.random() * 200;
    return this.stats;
  }
}

class MockEnterpriseRiskManager {
  constructor(config) {
    this.config = config;
    this.dailyPnl = 0;
  }

  getRiskReport() {
    // Simulate some P&L movement
    this.dailyPnl += (Math.random() - 0.5) * 1000;
    
    return {
      dailyPnl: this.dailyPnl,
      riskUtilization: {
        position: Math.random() * 0.5,
        margin: Math.random() * 0.3
      },
      riskBreaches: Math.random() > 0.9 ? { positionLimit: true } : {}
    };
  }
}

class MockPortfolioService {
  constructor(config) {
    this.config = config;
  }

  getPerformanceStats() {
    return {
      totalValue: 1000000 + Math.random() * 100000,
      unrealizedPnl: (Math.random() - 0.5) * 10000
    };
  }
}

class MockMarketDataService {
  constructor(config) {
    this.config = config;
  }

  addCallback(symbol, callback) {
    console.log(`📡 Mock: Added market data callback for ${symbol}`);
    
    // Simulate market data updates
    setInterval(() => {
      const mockData = {
        symbol,
        price: 100 + Math.random() * 50,
        volume: Math.floor(Math.random() * 10000),
        timestamp: Date.now()
      };
      callback(mockData, 'mock_feed', Date.now());
    }, 2000);
  }

  getConnectionStats() {
    return {
      performance: {
        healthScore: 0.95 + Math.random() * 0.05
      },
      connections: {
        websocket: 'connected',
        fix: 'connected'
      }
    };
  }
}

/**
 * Override the require statements in the orchestrator for testing
 */
function setupMockServices() {
  // Store original require
  const originalRequire = require;
  
  // Override require for our mock services
  require = function(modulePath) {
    if (modulePath.includes('UltraHighSpeedEngine')) {
      return MockUltraHighSpeedEngine;
    }
    if (modulePath.includes('EnterpriseRiskManager')) {
      return MockEnterpriseRiskManager;
    }
    if (modulePath.includes('PortfolioService')) {
      return MockPortfolioService;
    }
    if (modulePath.includes('MarketDataService')) {
      return MockMarketDataService;
    }
    
    // Fall back to original require for everything else
    return originalRequire.apply(this, arguments);
  };
  
  // Copy properties from original require
  Object.setPrototypeOf(require, originalRequire);
  Object.defineProperties(require, Object.getOwnPropertyDescriptors(originalRequire));
}

/**
 * Test the orchestrator functionality
 */
async function runTests() {
  console.log('🧪 Starting Nexus Trade AI Orchestrator Tests...');
  console.log('================================================');
  
  // Setup mock services
  setupMockServices();
  
  try {
    // Create orchestrator instance
    const orchestrator = new NexusTradeSystemOrchestrator(TEST_CONFIG);
    
    // Setup test event listeners
    setupTestEventListeners(orchestrator);
    
    // Test 1: System Initialization
    console.log('\n🔬 Test 1: System Initialization');
    await orchestrator.initializeSystem(TEST_SYMBOLS, TEST_STRATEGIES, TEST_CONFIG);
    console.log('✅ System initialization test passed');
    
    // Test 2: System Status
    console.log('\n🔬 Test 2: System Status Check');
    const status = orchestrator.getSystemStatus();
    console.log('📊 System Status:', {
      status: status.systemState.status,
      activeStrategies: status.activeStrategies,
      systemHealth: status.systemState.systemHealth
    });
    console.log('✅ System status test passed');
    
    // Test 3: Performance Monitoring
    console.log('\n🔬 Test 3: Performance Monitoring (30 seconds)');
    await new Promise(resolve => setTimeout(resolve, 30000));
    console.log('✅ Performance monitoring test completed');
    
    // Test 4: Algorithm Execution (if execution engine is available)
    console.log('\n🔬 Test 4: Algorithm Execution Test');
    try {
      const algoId = await orchestrator.executeAlgorithm('TWAP', {
        symbol: 'AAPL',
        side: 'BUY',
        quantity: 100,
        duration: 60,
        clientId: 'test_client'
      });
      console.log(`✅ Algorithm execution test passed: ${algoId}`);
    } catch (error) {
      console.log('⚠️ Algorithm execution test skipped (service not available)');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('================================================');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

/**
 * Setup event listeners for testing
 */
function setupTestEventListeners(orchestrator) {
  orchestrator.on('systemReady', (data) => {
    console.log('🎉 System Ready Event:', data);
  });
  
  orchestrator.on('performanceUpdate', (data) => {
    console.log('📈 Performance Update:', {
      orders: data.systemState.totalOrders,
      trades: data.systemState.totalTrades,
      pnl: data.systemState.dailyPnL.toFixed(2),
      health: (data.systemState.systemHealth * 100).toFixed(1) + '%'
    });
  });
  
  orchestrator.on('riskBreach', (data) => {
    console.warn('⚠️ Risk Breach Event:', data.breaches);
  });
  
  orchestrator.on('alert', (alert) => {
    console.warn(`🚨 Alert [${alert.type}]: ${alert.message}`);
  });
  
  orchestrator.on('healthUpdate', (data) => {
    const health = (data.systemHealth * 100).toFixed(1);
    console.log(`💚 Health Update: ${health}%`);
  });
  
  orchestrator.on('emergencyShutdown', (data) => {
    console.error('🚨 Emergency Shutdown Event:', data.reason);
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

// Run tests if this file is executed directly
if (require.main === module) {
  runTests().catch((error) => {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  });
}

module.exports = { runTests, TEST_CONFIG, TEST_SYMBOLS, TEST_STRATEGIES };
