// Mock implementation of MarketDataAnalyzer for testing
class MarketDataAnalyzer {
  constructor() {
    this.logger = {
      info: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  async getHistoricalData(symbol, timeframe, limit) {
    // Return mock historical data
    return [
      { timestamp: Date.now() - 3600000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { timestamp: Date.now() - 1800000, open: 100.5, high: 102, low: 100, close: 101.5, volume: 1500 },
      { timestamp: Date.now(), open: 101.5, high: 103, low: 101, close: 102.5, volume: 2000 }
    ];
  }

  async getCurrentPrice(symbol) {
    return 102.5;
  }

  async calculateVolatility(symbol, period = 14) {
    return 0.02; // 2% volatility
  }

  async getMarketSentiment(symbol) {
    return {
      symbol,
      sentiment: 0.7, // Range from -1 (bearish) to 1 (bullish)
      confidence: 0.85,
      timestamp: Date.now()
    };
  }
}

module.exports = MarketDataAnalyzer;
