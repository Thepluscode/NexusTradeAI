#!/usr/bin/env node

/**
 * Mock Market Data Server
 * Provides simulated market data for testing the NexusTradeAI system
 */

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3002;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Mock market data generator
function generateMockPrice(basePrice, volatility = 0.02) {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return basePrice * (1 + change);
}

// Base prices for different symbols
const basePrices = {
  'AAPL': 175.50,
  'GOOGL': 2750.25,
  'MSFT': 305.75,
  'TSLA': 210.50,
  'AMZN': 3250.00,
  'NVDA': 450.25,
  'META': 285.75,
  'NFLX': 425.50,
  'AMD': 95.25,
  'INTC': 45.75
};

// Store current prices
let currentPrices = { ...basePrices };

// Update prices every 5 seconds
setInterval(() => {
  for (const symbol in currentPrices) {
    currentPrices[symbol] = generateMockPrice(basePrices[symbol], 0.01);
  }
}, 5000);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'mock-market-data',
    timestamp: new Date().toISOString(),
    symbols: Object.keys(currentPrices).length
  });
});

// Get all market prices
app.get('/market-prices', (req, res) => {
  const marketData = {};
  
  for (const [symbol, price] of Object.entries(currentPrices)) {
    const high = price * (1 + Math.random() * 0.005);
    const low = price * (1 - Math.random() * 0.005);
    const volume = Math.floor(1000000 + Math.random() * 5000000);
    
    marketData[symbol] = {
      symbol: symbol,
      price: parseFloat(price.toFixed(2)),
      open: parseFloat((price * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(price.toFixed(2)),
      volume: volume,
      timestamp: new Date().toISOString(),
      change: parseFloat(((price - basePrices[symbol]) / basePrices[symbol] * 100).toFixed(2)),
      changePercent: parseFloat(((price - basePrices[symbol]) / basePrices[symbol] * 100).toFixed(2))
    };
  }
  
  res.json({
    success: true,
    data: marketData,
    timestamp: new Date().toISOString(),
    count: Object.keys(marketData).length
  });
});

// Get specific symbol price
app.get('/market-prices/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  
  if (!currentPrices[symbol]) {
    return res.status(404).json({
      success: false,
      error: `Symbol ${symbol} not found`,
      availableSymbols: Object.keys(currentPrices)
    });
  }
  
  const price = currentPrices[symbol];
  const high = price * (1 + Math.random() * 0.005);
  const low = price * (1 - Math.random() * 0.005);
  const volume = Math.floor(1000000 + Math.random() * 5000000);
  
  const data = {
    symbol: symbol,
    price: parseFloat(price.toFixed(2)),
    open: parseFloat((price * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    close: parseFloat(price.toFixed(2)),
    volume: volume,
    timestamp: new Date().toISOString(),
    change: parseFloat(((price - basePrices[symbol]) / basePrices[symbol] * 100).toFixed(2)),
    changePercent: parseFloat(((price - basePrices[symbol]) / basePrices[symbol] * 100).toFixed(2))
  };
  
  res.json({
    success: true,
    data: data,
    timestamp: new Date().toISOString()
  });
});

// Get historical data (mock)
app.get('/historical/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = parseInt(req.query.days) || 30;
  
  if (!currentPrices[symbol]) {
    return res.status(404).json({
      success: false,
      error: `Symbol ${symbol} not found`
    });
  }
  
  const historical = [];
  const basePrice = basePrices[symbol];
  let currentPrice = basePrice;
  
  // Generate historical data
  for (let i = days; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    
    // Random walk
    currentPrice = generateMockPrice(currentPrice, 0.02);
    const high = currentPrice * (1 + Math.random() * 0.02);
    const low = currentPrice * (1 - Math.random() * 0.02);
    const volume = Math.floor(1000000 + Math.random() * 5000000);
    
    historical.push({
      date: date.toISOString().split('T')[0],
      timestamp: date.toISOString(),
      open: parseFloat((currentPrice * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(currentPrice.toFixed(2)),
      volume: volume
    });
  }
  
  res.json({
    success: true,
    symbol: symbol,
    data: historical,
    count: historical.length,
    timestamp: new Date().toISOString()
  });
});

// Get available symbols
app.get('/symbols', (req, res) => {
  res.json({
    success: true,
    symbols: Object.keys(currentPrices),
    count: Object.keys(currentPrices).length,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    availableEndpoints: [
      'GET /health',
      'GET /market-prices',
      'GET /market-prices/:symbol',
      'GET /historical/:symbol?days=30',
      'GET /symbols'
    ],
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`📊 Mock Market Data Server running on port ${PORT}`);
  console.log(`🚀 Market Data API: http://localhost:${PORT}`);
  console.log(`📈 Health Check: http://localhost:${PORT}/health`);
  console.log(`💹 Available endpoints:`);
  console.log(`   • GET /market-prices - All market data`);
  console.log(`   • GET /market-prices/:symbol - Specific symbol`);
  console.log(`   • GET /historical/:symbol - Historical data`);
  console.log(`   • GET /symbols - Available symbols`);
  console.log(`\n✅ Mock data ready for ${Object.keys(currentPrices).length} symbols`);
  console.log(`📊 Symbols: ${Object.keys(currentPrices).join(', ')}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📊 Mock Market Data Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n📊 Mock Market Data Server shutting down...');
  process.exit(0);
});
