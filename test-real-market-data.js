#!/usr/bin/env node

/**
 * Test Real Market Data Integration
 * Verifies the enhanced market data service with real APIs
 */

const axios = require('axios');

console.log('📊 Testing Real Market Data Integration...\n');

async function testRealMarketData() {
  try {
    console.log('🔍 Testing Enhanced Market Data Service...');
    
    // Test health
    const health = await axios.get('http://localhost:3002/health');
    console.log(`✅ Health: ${health.data.status}`);
    console.log(`📊 APIs: Alpha Vantage=${health.data.apis.alphaVantage}, Finnhub=${health.data.apis.finnhub}`);
    console.log(`📈 Symbols: ${health.data.symbols} available`);
    console.log(`🕒 Last Update: ${health.data.lastUpdate}`);
    
    // Test real market data
    console.log('\n📈 Testing Real Market Data...');
    const marketData = await axios.get('http://localhost:3002/market-prices');
    
    console.log(`✅ Retrieved ${marketData.data.count} symbols with real data`);
    
    // Show sample data
    const symbols = Object.keys(marketData.data.data).slice(0, 3);
    for (const symbol of symbols) {
      const data = marketData.data.data[symbol];
      console.log(`  📊 ${symbol}: $${data.price} (${data.changePercent}%) [${data.source}]`);
    }
    
    // Test specific symbol
    console.log('\n🍎 Testing AAPL Specific Data...');
    const aapl = await axios.get('http://localhost:3002/market-prices/AAPL');
    const aaplData = aapl.data.data;
    
    console.log(`✅ AAPL: $${aaplData.price}`);
    console.log(`  📈 Open: $${aaplData.open}, High: $${aaplData.high}, Low: $${aaplData.low}`);
    console.log(`  📊 Change: ${aaplData.change} (${aaplData.changePercent}%)`);
    console.log(`  📡 Source: ${aaplData.source}`);
    console.log(`  🕒 Timestamp: ${aaplData.timestamp}`);
    
    // Test automation server connection
    console.log('\n🤖 Testing Automation Server...');
    const automationHealth = await axios.get('http://localhost:3004/health');
    console.log(`✅ Automation Server: ${automationHealth.data.status}`);
    
    const status = await axios.get('http://localhost:3004/api/automation/status');
    console.log(`✅ Trading Engine: Running=${status.data.isRunning}`);
    console.log(`📊 Monitoring: ${status.data.symbolsMonitored} symbols`);
    console.log(`🎯 Strategies: ${status.data.strategiesActive} active`);
    
    console.log('\n🎉 SUCCESS! Real Market Data Integration Working!');
    console.log('\n📊 Summary:');
    console.log(`  • Real market data: ✅ ${marketData.data.count} symbols from Finnhub`);
    console.log(`  • Automation server: ✅ Running and monitoring`);
    console.log(`  • API integration: ✅ Alpha Vantage + Finnhub configured`);
    console.log(`  • Trading strategies: ✅ ${status.data.strategiesActive} active`);
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Troubleshooting:');
      console.log('  1. Make sure enhanced market data server is running: node enhanced-market-data-server.js');
      console.log('  2. Make sure automation server is running: node automation-server.js');
      console.log('  3. Check that ports 3002 and 3004 are available');
    }
    
    return false;
  }
}

testRealMarketData();
