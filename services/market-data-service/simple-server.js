const express = require('express');
const cors = require('cors');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'market-data.log' })
  ]
});

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(cors());
app.use(express.json());

// Store for tracked symbols (in production, this would be in a database)
let trackedSymbols = new Set(['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META', 'NFLX', 'AMD']);

// Helper function to generate mock market data
function generateMockData(symbols) {
  const mockData = {};
  
  symbols.forEach(symbol => {
    // Generate realistic mock data
    const basePrice = Math.random() * 1000 + 50; // $50-$1050
    const change = (Math.random() - 0.5) * 20; // -$10 to +$10
    const changePercent = (change / basePrice) * 100;
    const volume = Math.floor(Math.random() * 10000000) + 100000; // 100K-10M
    
    const signals = ['BUY', 'SELL', 'HOLD'];
    const aiSignal = signals[Math.floor(Math.random() * signals.length)];
    const confidence = Math.floor(Math.random() * 40) + 40; // 40-80%
    
    mockData[symbol] = {
      symbol: symbol,
      price: parseFloat(basePrice.toFixed(2)),
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: volume,
      high: parseFloat((basePrice + Math.random() * 10).toFixed(2)),
      low: parseFloat((basePrice - Math.random() * 10).toFixed(2)),
      open: parseFloat((basePrice + (Math.random() - 0.5) * 5).toFixed(2)),
      previousClose: parseFloat((basePrice - change).toFixed(2)),
      marketCap: Math.floor(Math.random() * 5000000000000), // Up to $5T
      pe: parseFloat((Math.random() * 100 + 10).toFixed(1)), // 10-110
      aiSignal: aiSignal,
      confidence: confidence
    };
  });
  
  return mockData;
}

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'market-data-service'
  });
});

// Get market prices for dashboard
app.get('/api/data/market-prices', async (req, res) => {
  try {
    // Generate mock data for all tracked symbols
    const mockData = generateMockData(Array.from(trackedSymbols));

    res.json({
      success: true,
      data: mockData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Error fetching market prices:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add symbol to tracking list
app.post('/api/data/symbols/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();
    
    if (!upperSymbol || upperSymbol.length < 1 || upperSymbol.length > 10) {
      return res.status(400).json({
        success: false,
        message: 'Invalid symbol format'
      });
    }
    
    trackedSymbols.add(upperSymbol);
    
    res.json({
      success: true,
      message: `Symbol ${upperSymbol} added to tracking list`,
      data: { symbol: upperSymbol }
    });
    
  } catch (error) {
    logger.error('Error adding symbol:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Remove symbol from tracking list
app.delete('/api/data/symbols/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();
    
    if (trackedSymbols.has(upperSymbol)) {
      trackedSymbols.delete(upperSymbol);
      res.json({
        success: true,
        message: `Symbol ${upperSymbol} removed from tracking list`
      });
    } else {
      res.status(404).json({
        success: false,
        message: `Symbol ${upperSymbol} not found in tracking list`
      });
    }
    
  } catch (error) {
    logger.error('Error removing symbol:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get list of tracked symbols
app.get('/api/data/symbols', async (req, res) => {
  try {
    res.json({
      success: true,
      data: Array.from(trackedSymbols),
      count: trackedSymbols.size
    });
    
  } catch (error) {
    logger.error('Error getting symbols:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get supported exchanges
app.get('/api/data/exchanges', (req, res) => {
  const exchanges = {
    crypto: ['binance', 'coinbase', 'kraken', 'huobi'],
    stock: ['iex', 'alpaca', 'polygon', 'finnhub'],
    forex: ['oanda', 'fxcm', 'dukascopy'],
    commodities: ['ice', 'cme', 'lme']
  };
  
  res.json({
    success: true,
    data: exchanges
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Market Data Service running on port ${PORT}`);
  logger.info(`Health check: http://localhost:${PORT}/health`);
  logger.info(`Market prices: http://localhost:${PORT}/api/data/market-prices`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});
