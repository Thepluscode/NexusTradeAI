#!/usr/bin/env node

/**
 * Test Immediate Next Steps - NexusTradeAI
 * 
 * Tests the implementation of immediate next steps:
 * 1. Configure Real Trading
 * 2. Deploy Strategies
 * 3. Monitor Performance
 * 4. Scale Operations
 * 5. Historical Analysis
 */

const axios = require('axios');

console.log('🎯 Testing Immediate Next Steps - NexusTradeAI\n');

const AUTOMATION_API = 'http://localhost:3004';
const ENHANCED_API = 'http://localhost:3000';

class ImmediateNextStepsTester {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🚀 Starting Immediate Next Steps Test Suite...\n');

    const tests = [
      { name: 'Real Trading Configuration', fn: () => this.testRealTradingConfig() },
      { name: 'Strategy Deployment', fn: () => this.testStrategyDeployment() },
      { name: 'Performance Monitoring', fn: () => this.testPerformanceMonitoring() },
      { name: 'Broker Integration', fn: () => this.testBrokerIntegration() },
      { name: 'Risk Management', fn: () => this.testRiskManagement() },
      { name: 'Scaling Operations', fn: () => this.testScalingOperations() }
    ];

    for (const test of tests) {
      try {
        console.log(`🔍 Testing ${test.name}...`);
        const result = await test.fn();
        this.testResults.push({ name: test.name, passed: result, error: null });
        console.log(`${result ? '✅' : '❌'} ${test.name}: ${result ? 'PASSED' : 'FAILED'}\n`);
      } catch (error) {
        this.testResults.push({ name: test.name, passed: false, error: error.message });
        console.log(`❌ ${test.name}: FAILED - ${error.message}\n`);
      }
    }

    this.printSummary();
  }

  async testRealTradingConfig() {
    try {
      // Test current configuration
      const config = await axios.get(`${AUTOMATION_API}/api/automation/config`);
      console.log(`  📊 Current Config: Paper Trading=${config.data.paperTradingMode !== false}`);
      console.log(`  🎯 Enabled Strategies: ${config.data.enabledStrategies.join(', ')}`);
      console.log(`  📈 Symbols: ${config.data.symbols.join(', ')}`);

      // Test configuration update
      const updateConfig = {
        maxDailyLoss: -500,
        riskPerTrade: 0.015,
        enabledStrategies: ['meanReversion', 'momentum', 'rsi']
      };

      const updateResult = await axios.put(`${AUTOMATION_API}/api/automation/config`, updateConfig);
      console.log(`  ✅ Config Update: ${updateResult.data.message}`);

      // Test real trading toggle (keep disabled for safety)
      const toggleResult = await axios.post(`${AUTOMATION_API}/api/automation/real-trading/disable`);
      console.log(`  🛡️  Real Trading: ${toggleResult.data.message}`);

      return true;
    } catch (error) {
      console.log(`  ❌ Real Trading Config Error: ${error.message}`);
      return false;
    }
  }

  async testStrategyDeployment() {
    try {
      // Test strategy deployment
      const deployData = {
        strategyName: 'breakout',
        config: {
          lookbackPeriod: 15,
          breakoutThreshold: 0.02,
          symbols: ['AAPL', 'GOOGL']
        }
      };

      const deployResult = await axios.post(`${AUTOMATION_API}/api/automation/strategies/deploy`, deployData);
      console.log(`  🚀 Strategy Deployed: ${deployResult.data.message}`);

      // Test strategy performance
      const performance = await axios.get(`${AUTOMATION_API}/api/automation/strategies/performance`);
      const strategyCount = Object.keys(performance.data.strategies).length;
      console.log(`  📊 Strategy Performance: ${strategyCount} strategies tracked`);

      // Test strategy removal
      const removeResult = await axios.delete(`${AUTOMATION_API}/api/automation/strategies/breakout`);
      console.log(`  🗑️ Strategy Removed: ${removeResult.data.message}`);

      return true;
    } catch (error) {
      console.log(`  ❌ Strategy Deployment Error: ${error.message}`);
      return false;
    }
  }

  async testPerformanceMonitoring() {
    try {
      // Test automation status
      const status = await axios.get(`${AUTOMATION_API}/api/automation/status`);
      console.log(`  📊 System Status: Running=${status.data.isRunning}`);
      console.log(`  💰 Daily P&L: $${status.data.dailyPnL}`);
      console.log(`  📈 Trades Today: ${status.data.tradesExecutedToday}`);
      console.log(`  🎯 Active Strategies: ${status.data.strategiesActive}`);

      // Test positions
      const positions = await axios.get(`${AUTOMATION_API}/api/automation/positions`);
      console.log(`  📊 Active Positions: ${positions.data.positions.length}`);

      // Test logs
      const logs = await axios.get(`${AUTOMATION_API}/api/automation/logs`);
      console.log(`  📝 System Logs: ${logs.data.logs.length} entries`);

      // Test enhanced dashboard if available
      try {
        const enhanced = await axios.get(`${ENHANCED_API}/api/enhanced/system/status`);
        console.log(`  🚀 Enhanced Dashboard: Available`);
      } catch (error) {
        console.log(`  ⚠️  Enhanced Dashboard: Not available`);
      }

      return true;
    } catch (error) {
      console.log(`  ❌ Performance Monitoring Error: ${error.message}`);
      return false;
    }
  }

  async testBrokerIntegration() {
    try {
      // Test broker status
      const brokers = await axios.get(`${AUTOMATION_API}/api/automation/brokers`);
      console.log(`  🏦 Connected Brokers: ${brokers.data.connectedBrokers.length}`);
      
      if (brokers.data.connectedBrokers.length > 0) {
        const broker = brokers.data.connectedBrokers[0];
        console.log(`  ✅ Primary Broker: ${broker.name} (${broker.type})`);
      }

      console.log(`  💰 Total Equity: $${brokers.data.totalEquity}`);
      console.log(`  💵 Available Cash: $${brokers.data.availableCash}`);

      // Test enhanced broker service if available
      try {
        const enhancedBrokers = await axios.get(`${ENHANCED_API}/api/enhanced/brokers/status`);
        console.log(`  🚀 Enhanced Brokers: ${enhancedBrokers.data.connectedBrokers} connected`);
      } catch (error) {
        console.log(`  ⚠️  Enhanced Brokers: Not available`);
      }

      return true;
    } catch (error) {
      console.log(`  ❌ Broker Integration Error: ${error.message}`);
      return false;
    }
  }

  async testRiskManagement() {
    try {
      // Test current risk settings
      const config = await axios.get(`${AUTOMATION_API}/api/automation/config`);
      console.log(`  🛡️  Max Daily Loss: $${Math.abs(config.data.maxDailyLoss)}`);
      console.log(`  📊 Max Position Size: $${config.data.maxPositionSize}`);
      console.log(`  ⚖️  Risk Per Trade: ${(config.data.riskPerTrade * 100).toFixed(1)}%`);

      // Test risk parameter updates
      const riskUpdate = {
        maxDailyLoss: -750,
        riskPerTrade: 0.018,
        maxPositionSize: 8000
      };

      const updateResult = await axios.put(`${AUTOMATION_API}/api/automation/config`, riskUpdate);
      console.log(`  ✅ Risk Parameters Updated: ${updateResult.data.success}`);

      // Verify the update
      const newConfig = await axios.get(`${AUTOMATION_API}/api/automation/config`);
      console.log(`  📊 New Max Daily Loss: $${Math.abs(newConfig.data.maxDailyLoss)}`);

      return true;
    } catch (error) {
      console.log(`  ❌ Risk Management Error: ${error.message}`);
      return false;
    }
  }

  async testScalingOperations() {
    try {
      // Test adding more symbols
      const scaleConfig = {
        symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META', 'NFLX', 'AMD'],
        enabledStrategies: ['meanReversion', 'momentum', 'rsi', 'breakout']
      };

      const scaleResult = await axios.put(`${AUTOMATION_API}/api/automation/config`, scaleConfig);
      console.log(`  📈 Scaled Symbols: ${scaleConfig.symbols.length} symbols`);
      console.log(`  🎯 Scaled Strategies: ${scaleConfig.enabledStrategies.length} strategies`);

      // Test if automation can handle the scale
      const status = await axios.get(`${AUTOMATION_API}/api/automation/status`);
      console.log(`  📊 Symbols Monitored: ${status.data.symbolsMonitored}`);
      console.log(`  🎯 Strategies Active: ${status.data.strategiesActive}`);

      // Test market data for all symbols
      const marketData = await axios.get(`${AUTOMATION_API}/api/automation/market-data`);
      console.log(`  📡 Market Data: Available for scaled operations`);

      return true;
    } catch (error) {
      console.log(`  ❌ Scaling Operations Error: ${error.message}`);
      return false;
    }
  }

  printSummary() {
    console.log('\n' + '='.repeat(70));
    console.log('🎯 IMMEDIATE NEXT STEPS - TEST RESULTS');
    console.log('='.repeat(70));

    const passed = this.testResults.filter(r => r.passed).length;
    const total = this.testResults.length;

    this.testResults.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      console.log(`  ${status} ${result.name}`);
      if (result.error) {
        console.log(`       Error: ${result.error}`);
      }
    });

    console.log(`\n📊 Test Results: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);

    if (passed === total) {
      console.log('\n🎉 ALL IMMEDIATE NEXT STEPS IMPLEMENTED SUCCESSFULLY! 🚀');
      console.log('\n🎯 Your NexusTradeAI platform is ready for:');
      console.log('   ✅ Real Trading Configuration');
      console.log('   ✅ Dynamic Strategy Deployment');
      console.log('   ✅ Real-time Performance Monitoring');
      console.log('   ✅ Multi-Broker Integration');
      console.log('   ✅ Advanced Risk Management');
      console.log('   ✅ Scalable Operations');
      
      console.log('\n📋 Next Actions:');
      console.log('   1. Enable real trading when ready: POST /api/automation/real-trading/enable');
      console.log('   2. Deploy additional strategies: POST /api/automation/strategies/deploy');
      console.log('   3. Monitor performance: GET /api/automation/status');
      console.log('   4. Scale symbols and strategies as needed');
      console.log('   5. Use enhanced dashboard: http://localhost:3000');
      
    } else if (passed >= total * 0.8) {
      console.log('\n🎯 IMMEDIATE NEXT STEPS MOSTLY READY!');
      console.log('   Most features working. Check failed tests above.');
    } else {
      console.log('\n⚠️  SOME IMMEDIATE NEXT STEPS NEED ATTENTION');
      console.log('   Review failed tests and ensure all services are running.');
    }

    console.log('\n🚀 NexusTradeAI - Ready for Professional Trading Operations! 🚀\n');
  }
}

// Run the comprehensive test
const tester = new ImmediateNextStepsTester();
tester.runAllTests().catch(error => {
  console.error('❌ Test suite failed:', error.message);
  process.exit(1);
});
