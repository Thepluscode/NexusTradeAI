const EventEmitter = require('events');

class PriceProcessor extends EventEmitter {
  constructor(options = {}) {
    super();
    this.logger = options.logger;
    this.priceHistory = new Map();
    this.anomalyThreshold = 0.1; // 10% price change threshold
    this.volumeWeightedPrices = new Map();
    this.maxHistorySize = 1000;
    this.isRunning = false;
  }

  async start() {
    this.isRunning = true;
    this.logger?.info('PriceProcessor started');
  }

  async stop() {
    this.isRunning = false;
    this.logger?.info('PriceProcessor stopped');
  }

  async process(data) {
    if (!this.isRunning) {
      return data;
    }

    try {
      const processedData = { ...data };
      
      // Add price analytics
      if (data.price || data.close) {
        const price = data.price || data.close;
        const key = `${data.exchange}-${data.symbol}`;
        
        // Calculate price changes
        const priceAnalytics = this.calculatePriceAnalytics(key, price, data.volume);
        processedData.priceAnalytics = priceAnalytics;
        
        // Detect anomalies
        const anomaly = this.detectPriceAnomaly(key, price);
        if (anomaly) {
          processedData.anomaly = anomaly;
          this.emit('price-anomaly', { data: processedData, anomaly });
        }
        
        // Update price history
        this.updatePriceHistory(key, price, data.timestamp || Date.now());
      }
      
      // Process OHLC data
      if (data.dataType === 'bar' || (data.open && data.high && data.low && data.close)) {
        processedData.technicalIndicators = this.calculateTechnicalIndicators(data);
      }
      
      // Process order book data
      if (data.dataType === 'orderbook' && data.bids && data.asks) {
        processedData.orderBookAnalytics = this.calculateOrderBookAnalytics(data);
      }
      
      return processedData;
      
    } catch (error) {
      this.logger?.error('Error processing price data:', error);
      return data;
    }
  }

  calculatePriceAnalytics(key, currentPrice, volume = 0) {
    const history = this.priceHistory.get(key) || [];
    
    if (history.length === 0) {
      return {
        change: 0,
        changePercent: 0,
        volatility: 0,
        vwap: currentPrice
      };
    }
    
    const previousPrice = history[history.length - 1].price;
    const change = currentPrice - previousPrice;
    const changePercent = (change / previousPrice) * 100;
    
    // Calculate volatility (standard deviation of recent prices)
    const recentPrices = history.slice(-20).map(h => h.price);
    const volatility = this.calculateVolatility(recentPrices);
    
    // Calculate VWAP
    const vwap = this.calculateVWAP(key, currentPrice, volume);
    
    return {
      change: parseFloat(change.toFixed(6)),
      changePercent: parseFloat(changePercent.toFixed(4)),
      volatility: parseFloat(volatility.toFixed(6)),
      vwap: parseFloat(vwap.toFixed(6))
    };
  }

  calculateVolatility(prices) {
    if (prices.length < 2) return 0;
    
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const squaredDifferences = prices.map(price => Math.pow(price - mean, 2));
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / prices.length;
    
    return Math.sqrt(variance);
  }

  calculateVWAP(key, price, volume) {
    if (!this.volumeWeightedPrices.has(key)) {
      this.volumeWeightedPrices.set(key, {
        totalValue: 0,
        totalVolume: 0,
        trades: []
      });
    }
    
    const vwapData = this.volumeWeightedPrices.get(key);
    vwapData.totalValue += price * volume;
    vwapData.totalVolume += volume;
    vwapData.trades.push({ price, volume, timestamp: Date.now() });
    
    // Keep only recent trades (last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    vwapData.trades = vwapData.trades.filter(trade => trade.timestamp > oneDayAgo);
    
    // Recalculate totals from recent trades
    vwapData.totalValue = vwapData.trades.reduce((sum, trade) => sum + (trade.price * trade.volume), 0);
    vwapData.totalVolume = vwapData.trades.reduce((sum, trade) => sum + trade.volume, 0);
    
    return vwapData.totalVolume > 0 ? vwapData.totalValue / vwapData.totalVolume : price;
  }

  detectPriceAnomaly(key, currentPrice) {
    const history = this.priceHistory.get(key) || [];
    
    if (history.length < 10) {
      return null;
    }
    
    const recentPrices = history.slice(-10).map(h => h.price);
    const avgPrice = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
    const priceChange = Math.abs((currentPrice - avgPrice) / avgPrice);
    
    if (priceChange > this.anomalyThreshold) {
      return {
        type: 'price_spike',
        severity: priceChange > 0.2 ? 'high' : 'medium',
        change: priceChange,
        currentPrice,
        averagePrice: avgPrice,
        timestamp: Date.now()
      };
    }
    
    return null;
  }

  updatePriceHistory(key, price, timestamp) {
    if (!this.priceHistory.has(key)) {
      this.priceHistory.set(key, []);
    }
    
    const history = this.priceHistory.get(key);
    history.push({ price, timestamp });
    
    // Keep only recent history
    if (history.length > this.maxHistorySize) {
      history.splice(0, history.length - this.maxHistorySize);
    }
  }

  calculateTechnicalIndicators(data) {
    const indicators = {};
    
    // Simple Moving Average (SMA)
    const key = `${data.exchange}-${data.symbol}`;
    const history = this.priceHistory.get(key) || [];
    
    if (history.length >= 20) {
      const recentPrices = history.slice(-20).map(h => h.price);
      indicators.sma20 = recentPrices.reduce((sum, price) => sum + price, 0) / 20;
    }
    
    if (history.length >= 50) {
      const recentPrices = history.slice(-50).map(h => h.price);
      indicators.sma50 = recentPrices.reduce((sum, price) => sum + price, 0) / 50;
    }
    
    // RSI (Relative Strength Index)
    if (history.length >= 14) {
      indicators.rsi = this.calculateRSI(history.slice(-14));
    }
    
    // Bollinger Bands
    if (history.length >= 20) {
      const bb = this.calculateBollingerBands(history.slice(-20));
      indicators.bollingerBands = bb;
    }
    
    return indicators;
  }

  calculateRSI(priceHistory, period = 14) {
    if (priceHistory.length < period + 1) {
      return null;
    }
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i < priceHistory.length; i++) {
      const change = priceHistory[i].price - priceHistory[i - 1].price;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    const rsi = 100 - (100 / (1 + rs));
    
    return parseFloat(rsi.toFixed(2));
  }

  calculateBollingerBands(priceHistory, period = 20, multiplier = 2) {
    const prices = priceHistory.map(h => h.price);
    const sma = prices.reduce((sum, price) => sum + price, 0) / period;
    
    const squaredDifferences = prices.map(price => Math.pow(price - sma, 2));
    const variance = squaredDifferences.reduce((sum, diff) => sum + diff, 0) / period;
    const stdDev = Math.sqrt(variance);
    
    return {
      middle: parseFloat(sma.toFixed(6)),
      upper: parseFloat((sma + (multiplier * stdDev)).toFixed(6)),
      lower: parseFloat((sma - (multiplier * stdDev)).toFixed(6))
    };
  }

  calculateOrderBookAnalytics(data) {
    const { bids, asks } = data;
    
    if (!bids || !asks || bids.length === 0 || asks.length === 0) {
      return null;
    }
    
    // Calculate spread
    const bestBid = Math.max(...bids.map(bid => bid[0]));
    const bestAsk = Math.min(...asks.map(ask => ask[0]));
    const spread = bestAsk - bestBid;
    const spreadPercent = (spread / bestAsk) * 100;
    
    // Calculate depth
    const bidDepth = bids.reduce((sum, bid) => sum + bid[1], 0);
    const askDepth = asks.reduce((sum, ask) => sum + ask[1], 0);
    
    // Calculate imbalance
    const imbalance = (bidDepth - askDepth) / (bidDepth + askDepth);
    
    return {
      spread: parseFloat(spread.toFixed(6)),
      spreadPercent: parseFloat(spreadPercent.toFixed(4)),
      bidDepth: parseFloat(bidDepth.toFixed(4)),
      askDepth: parseFloat(askDepth.toFixed(4)),
      imbalance: parseFloat(imbalance.toFixed(4)),
      bestBid,
      bestAsk
    };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      priceHistorySize: this.priceHistory.size,
      vwapDataSize: this.volumeWeightedPrices.size
    };
  }

  clearHistory(symbol, exchange) {
    const key = `${exchange}-${symbol}`;
    this.priceHistory.delete(key);
    this.volumeWeightedPrices.delete(key);
  }

  getPriceHistory(symbol, exchange, limit = 100) {
    const key = `${exchange}-${symbol}`;
    const history = this.priceHistory.get(key) || [];
    return history.slice(-limit);
  }
}

module.exports = PriceProcessor;