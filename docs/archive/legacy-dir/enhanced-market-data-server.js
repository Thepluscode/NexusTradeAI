#!/usr/bin/env node

/**
 * Enhanced Market Data Server
 * Provides real market data using Alpha Vantage and Finnhub APIs
 * Falls back to mock data if APIs are unavailable
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3002;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// API Configuration
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

console.log('🚀 Enhanced Market Data Server starting...');
console.log(`📊 Alpha Vantage API: ${ALPHA_VANTAGE_API_KEY ? '✅ Configured' : '❌ Missing'}`);
console.log(`📈 Finnhub API: ${FINNHUB_API_KEY ? '✅ Configured' : '❌ Missing'}`);

// Cache for market data
let marketDataCache = {};
let lastUpdateTime = 0;
const CACHE_DURATION = 60000; // 1 minute

// Default symbols to track
const DEFAULT_SYMBOLS = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META', 'NFLX', 'AMD', 'INTC'];

// Mock data fallback
const mockPrices = {
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

function generateMockPrice(basePrice, volatility = 0.01) {
  const change = (Math.random() - 0.5) * 2 * volatility;
  return basePrice * (1 + change);
}

async function fetchRealMarketData(symbol) {
  try {
    if (!FINNHUB_API_KEY) {
      throw new Error('Finnhub API key not configured');
    }

    // Use Finnhub for real-time quotes
    const response = await axios.get(`https://finnhub.io/api/v1/quote`, {
      params: {
        symbol: symbol,
        token: FINNHUB_API_KEY
      },
      timeout: 5000
    });

    const data = response.data;
    
    if (data.c && data.c > 0) {
      return {
        symbol: symbol,
        price: parseFloat(data.c.toFixed(2)),
        open: parseFloat(data.o.toFixed(2)),
        high: parseFloat(data.h.toFixed(2)),
        low: parseFloat(data.l.toFixed(2)),
        close: parseFloat(data.c.toFixed(2)),
        previousClose: parseFloat(data.pc.toFixed(2)),
        change: parseFloat((data.c - data.pc).toFixed(2)),
        changePercent: parseFloat(((data.c - data.pc) / data.pc * 100).toFixed(2)),
        volume: Math.floor(Math.random() * 5000000 + 1000000), // Finnhub doesn't provide volume in quote
        timestamp: new Date().toISOString(),
        source: 'finnhub'
      };
    } else {
      throw new Error('Invalid data from Finnhub');
    }
  } catch (error) {
    console.log(`⚠️  Failed to fetch real data for ${symbol}: ${error.message}`);
    
    // Fallback to mock data
    const basePrice = mockPrices[symbol] || 100;
    const currentPrice = generateMockPrice(basePrice);
    const previousClose = basePrice;
    
    return {
      symbol: symbol,
      price: parseFloat(currentPrice.toFixed(2)),
      open: parseFloat((currentPrice * (1 + (Math.random() - 0.5) * 0.01)).toFixed(2)),
      high: parseFloat((currentPrice * (1 + Math.random() * 0.005)).toFixed(2)),
      low: parseFloat((currentPrice * (1 - Math.random() * 0.005)).toFixed(2)),
      close: parseFloat(currentPrice.toFixed(2)),
      previousClose: parseFloat(previousClose.toFixed(2)),
      change: parseFloat((currentPrice - previousClose).toFixed(2)),
      changePercent: parseFloat(((currentPrice - previousClose) / previousClose * 100).toFixed(2)),
      volume: Math.floor(Math.random() * 5000000 + 1000000),
      timestamp: new Date().toISOString(),
      source: 'mock'
    };
  }
}

async function updateMarketDataCache() {
  const now = Date.now();
  
  if (now - lastUpdateTime < CACHE_DURATION && Object.keys(marketDataCache).length > 0) {
    return; // Use cached data
  }
  
  console.log('📊 Updating market data cache...');
  
  const promises = DEFAULT_SYMBOLS.map(symbol => fetchRealMarketData(symbol));
  const results = await Promise.allSettled(promises);
  
  const newCache = {};
  let realDataCount = 0;
  let mockDataCount = 0;
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const symbol = DEFAULT_SYMBOLS[index];
      newCache[symbol] = result.value;
      
      if (result.value.source === 'finnhub') {
        realDataCount++;
      } else {
        mockDataCount++;
      }
    }
  });
  
  marketDataCache = newCache;
  lastUpdateTime = now;
  
  console.log(`✅ Cache updated: ${realDataCount} real, ${mockDataCount} mock data points`);
}

// Update cache every minute
setInterval(updateMarketDataCache, 60000);

// Initial cache update
updateMarketDataCache();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'enhanced-market-data',
    timestamp: new Date().toISOString(),
    symbols: Object.keys(marketDataCache).length,
    apis: {
      alphaVantage: !!ALPHA_VANTAGE_API_KEY,
      finnhub: !!FINNHUB_API_KEY
    },
    lastUpdate: new Date(lastUpdateTime).toISOString()
  });
});

// Get all market prices
app.get('/market-prices', async (req, res) => {
  try {
    await updateMarketDataCache();
    
    res.json({
      success: true,
      data: marketDataCache,
      timestamp: new Date().toISOString(),
      count: Object.keys(marketDataCache).length,
      lastUpdate: new Date(lastUpdateTime).toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get specific symbol price
app.get('/market-prices/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    await updateMarketDataCache();
    
    if (!marketDataCache[symbol]) {
      // Try to fetch this specific symbol
      const data = await fetchRealMarketData(symbol);
      marketDataCache[symbol] = data;
    }
    
    if (marketDataCache[symbol]) {
      res.json({
        success: true,
        data: marketDataCache[symbol],
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(404).json({
        success: false,
        error: `Symbol ${symbol} not found`,
        availableSymbols: Object.keys(marketDataCache)
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get available symbols
app.get('/symbols', (req, res) => {
  res.json({
    success: true,
    symbols: Object.keys(marketDataCache),
    count: Object.keys(marketDataCache).length,
    timestamp: new Date().toISOString()
  });
});

// Get historical data (simplified - using Alpha Vantage if available)
app.get('/historical/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const days = parseInt(req.query.days) || 30;
  
  try {
    if (ALPHA_VANTAGE_API_KEY) {
      // Try to get real historical data from Alpha Vantage
      const response = await axios.get(`https://www.alphavantage.co/query`, {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          apikey: ALPHA_VANTAGE_API_KEY,
          outputsize: 'compact'
        },
        timeout: 10000
      });
      
      if (response.data['Time Series (Daily)']) {
        const timeSeries = response.data['Time Series (Daily)'];
        const historical = [];
        
        Object.entries(timeSeries)
          .slice(0, days)
          .forEach(([date, data]) => {
            historical.push({
              date: date,
              timestamp: new Date(date).toISOString(),
              open: parseFloat(data['1. open']),
              high: parseFloat(data['2. high']),
              low: parseFloat(data['3. low']),
              close: parseFloat(data['4. close']),
              volume: parseInt(data['5. volume'])
            });
          });
        
        return res.json({
          success: true,
          symbol: symbol,
          data: historical,
          count: historical.length,
          source: 'alphavantage',
          timestamp: new Date().toISOString()
        });
      }
    }
    
    // Fallback to mock historical data
    const historical = [];
    const basePrice = mockPrices[symbol] || 100;
    let currentPrice = basePrice;
    
    for (let i = days; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      
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
      source: 'mock',
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
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
  console.log(`📊 Enhanced Market Data Server running on port ${PORT}`);
  console.log(`🚀 Market Data API: http://localhost:${PORT}`);
  console.log(`📈 Health Check: http://localhost:${PORT}/health`);
  console.log(`💹 Available endpoints:`);
  console.log(`   • GET /market-prices - All market data`);
  console.log(`   • GET /market-prices/:symbol - Specific symbol`);
  console.log(`   • GET /historical/:symbol - Historical data`);
  console.log(`   • GET /symbols - Available symbols`);
  console.log(`\n✅ Enhanced market data ready with real API integration!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📊 Enhanced Market Data Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n📊 Enhanced Market Data Server shutting down...');
  process.exit(0);
});
