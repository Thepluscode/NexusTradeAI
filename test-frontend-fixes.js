#!/usr/bin/env node

/**
 * Test Frontend Fixes - NexusTradeAI
 * 
 * Quick test to verify the frontend JavaScript errors are fixed
 */

const axios = require('axios');

console.log('🔧 Testing Frontend Fixes - NexusTradeAI\n');

async function testFrontendFixes() {
  console.log('🚀 Starting Frontend Fix Tests...\n');

  const tests = [
    { name: 'Strategy Performance API', fn: () => testStrategyPerformanceAPI() },
    { name: 'Automation Status API', fn: () => testAutomationStatusAPI() },
    { name: 'Market Data API', fn: () => testMarketDataAPI() },
    { name: 'Dashboard HTML Structure', fn: () => testDashboardHTML() }
  ];

  let passed = 0;
  let total = tests.length;

  for (const test of tests) {
    try {
      console.log(`🔍 Testing ${test.name}...`);
      const result = await test.fn();
      if (result) {
        console.log(`✅ ${test.name}: PASSED\n`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: FAILED\n`);
      }
    } catch (error) {
      console.log(`❌ ${test.name}: FAILED - ${error.message}\n`);
    }
  }

  console.log('='.repeat(60));
  console.log('🔧 FRONTEND FIXES - TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`📊 Test Results: ${passed}/${total} tests passed (${Math.round(passed/total*100)}%)`);

  if (passed === total) {
    console.log('\n🎉 ALL FRONTEND FIXES WORKING! 🚀');
    console.log('\n✅ JavaScript errors should be resolved');
    console.log('✅ API endpoints returning correct data');
    console.log('✅ DOM elements properly handled');
    console.log('✅ Strategy performance API fixed');
  } else {
    console.log('\n⚠️  Some issues remain. Check failed tests above.');
  }

  console.log('\n🚀 NexusTradeAI - Frontend Ready! 🚀\n');
}

async function testStrategyPerformanceAPI() {
  try {
    const response = await axios.get('http://localhost:3004/api/automation/strategies/performance');
    const data = response.data;
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  🎯 Has Strategies Object: ${!!data.strategies}`);
    console.log(`  📈 Strategy Count: ${Object.keys(data.strategies || {}).length}`);
    
    // Check if response structure is correct (no nested strategies)
    const strategies = data.strategies || {};
    const hasValidStructure = Object.keys(strategies).length > 0 && 
                              strategies.meanReversion && 
                              typeof strategies.meanReversion.totalTrades !== 'undefined';
    
    console.log(`  ✅ Valid Structure: ${hasValidStructure}`);
    
    return response.status === 200 && hasValidStructure;
  } catch (error) {
    console.log(`  ❌ Strategy Performance API Error: ${error.message}`);
    return false;
  }
}

async function testAutomationStatusAPI() {
  try {
    const response = await axios.get('http://localhost:3004/api/automation/status');
    const data = response.data;
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  🎯 System Running: ${data.isRunning}`);
    console.log(`  📈 Strategies Active: ${data.strategiesActive || 0}`);
    console.log(`  💰 Daily P&L: $${(data.dailyPnL || 0).toFixed(2)}`);
    
    return response.status === 200 && typeof data.isRunning !== 'undefined';
  } catch (error) {
    console.log(`  ❌ Automation Status API Error: ${error.message}`);
    return false;
  }
}

async function testMarketDataAPI() {
  try {
    const response = await axios.get('http://localhost:3002/market-prices');
    const data = response.data;
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  📈 Has Data: ${!!data.data}`);
    console.log(`  🎯 Symbol Count: ${data.count || 0}`);
    
    return response.status === 200 && (data.success || data.data);
  } catch (error) {
    console.log(`  ❌ Market Data API Error: ${error.message}`);
    return false;
  }
}

async function testDashboardHTML() {
  try {
    const response = await axios.get('http://localhost:3000');
    const html = response.data;
    
    console.log(`  📊 Response Status: ${response.status}`);
    console.log(`  📄 HTML Size: ${Math.round(html.length / 1024)}KB`);
    
    // Check for key elements that were causing errors
    const hasMarketDataTable = html.includes('id="marketDataBody"');
    const hasStrategiesGrid = html.includes('id="strategiesGrid"');
    const hasSystemStatus = html.includes('id="systemStatus"');
    const hasEnhancedJS = html.includes('EnhancedTradingDashboard');
    const hasSafeUpdates = html.includes('updateElement');
    
    console.log(`  📈 Market Data Table: ${hasMarketDataTable ? 'Present' : 'Missing'}`);
    console.log(`  🧠 Strategies Grid: ${hasStrategiesGrid ? 'Present' : 'Missing'}`);
    console.log(`  📊 System Status: ${hasSystemStatus ? 'Present' : 'Missing'}`);
    console.log(`  🚀 Enhanced JS: ${hasEnhancedJS ? 'Present' : 'Missing'}`);
    console.log(`  🛡️  Safe Updates: ${hasSafeUpdates ? 'Present' : 'Missing'}`);
    
    return response.status === 200 && 
           hasMarketDataTable && 
           hasStrategiesGrid && 
           hasSystemStatus && 
           hasEnhancedJS &&
           hasSafeUpdates;
  } catch (error) {
    console.log(`  ❌ Dashboard HTML Error: ${error.message}`);
    return false;
  }
}

// Run the tests
testFrontendFixes().catch(error => {
  console.error('❌ Frontend fix test suite failed:', error.message);
  process.exit(1);
});
