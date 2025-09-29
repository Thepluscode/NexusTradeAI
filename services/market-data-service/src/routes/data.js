const express = require('express');
const MarketData = require('../models/MarketData');
const router = express.Router();

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

// Get latest price for a symbol
router.get('/price/:exchange/:symbol', async (req, res) => {
  try {
    const { exchange, symbol } = req.params;
    
    const latestPrice = await MarketData.getLatestPrice(exchange, symbol);
    
    if (!latestPrice) {
      return res.status(404).json({
        success: false,
        message: 'Price data not found'
      });
    }
    
    res.json({
      success: true,
      data: latestPrice
    });
    
  } catch (error) {
    req.logger?.error('Error fetching price:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get price history
router.get('/history/:exchange/:symbol', async (req, res) => {
  try {
    const { exchange, symbol } = req.params;
    const { from, to, limit = 1000 } = req.query;
    
    const history = await MarketData.getPriceHistory(
      exchange, 
      symbol, 
      from, 
      to, 
      parseInt(limit)
    );
    
    res.json({
      success: true,
      data: history,
      count: history.length
    });
    
  } catch (error) {
    req.logger?.error('Error fetching price history:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get order book
router.get('/orderbook/:exchange/:symbol', async (req, res) => {
  try {
    const { exchange, symbol } = req.params;
    
    const orderBook = await MarketData.getOrderBook(exchange, symbol);
    
    if (!orderBook) {
      return res.status(404).json({
        success: false,
        message: 'Order book not found'
      });
    }
    
    res.json({
      success: true,
      data: orderBook
    });
    
  } catch (error) {
    req.logger?.error('Error fetching order book:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get market anomalies
router.get('/anomalies', async (req, res) => {
  try {
    const { exchange, symbol, severity, from, to, limit = 100 } = req.query;
    
    const anomalies = await MarketData.getAnomalies(
      exchange, 
      symbol, 
      severity, 
      from, 
      to
    ).limit(parseInt(limit));
    
    res.json({
      success: true,
      data: anomalies,
      count: anomalies.length
    });
    
  } catch (error) {
    req.logger?.error('Error fetching anomalies:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get market summary
router.get('/summary/:exchange', async (req, res) => {
  try {
    const { exchange } = req.params;
    const { symbols } = req.query;
    
    let symbolList = [];
    if (symbols) {
      symbolList = symbols.split(',');
    }
    
    const query = { exchange, dataType: 'ticker' };
    if (symbolList.length > 0) {
      query.symbol = { $in: symbolList };
    }
    
    const summaryData = await MarketData.find(query)
      .sort({ timestamp: -1 })
      .limit(symbolList.length || 50);
    
    res.json({
      success: true,
      data: summaryData,
      count: summaryData.length
    });
    
  } catch (error) {
    req.logger?.error('Error fetching market summary:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Search symbols
router.get('/search', async (req, res) => {
  try {
    const { q, exchange, limit = 20 } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters'
      });
    }
    
    const query = {
      symbol: { $regex: q, $options: 'i' }
    };
    
    if (exchange) {
      query.exchange = exchange;
    }
    
    const results = await MarketData.distinct('symbol', query).limit(parseInt(limit));
    
    res.json({
      success: true,
      data: results,
      count: results.length
    });
    
  } catch (error) {
    req.logger?.error('Error searching symbols:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Store for tracked symbols (in production, this would be in a database)
let trackedSymbols = new Set(['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'AMZN', 'META', 'NFLX', 'AMD']);

// Get market prices for dashboard (mock data for now)
router.get('/market-prices', async (req, res) => {
  try {
    // Generate mock data for all tracked symbols
    const mockData = generateMockData(Array.from(trackedSymbols));

    res.json({
      success: true,
      data: mockData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    req.logger?.error('Error fetching market prices:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Add symbol to tracking list
router.post('/symbols/:symbol', async (req, res) => {
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
    req.logger?.error('Error adding symbol:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Remove symbol from tracking list
router.delete('/symbols/:symbol', async (req, res) => {
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
    req.logger?.error('Error removing symbol:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get list of tracked symbols
router.get('/symbols', async (req, res) => {
  try {
    res.json({
      success: true,
      data: Array.from(trackedSymbols),
      count: trackedSymbols.size
    });

  } catch (error) {
    req.logger?.error('Error getting symbols:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
});

// Get supported exchanges
router.get('/exchanges', (req, res) => {
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

module.exports = router;