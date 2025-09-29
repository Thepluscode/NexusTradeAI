/**
 * NexusTradeAI - Trading Strategies
 * 
 * Collection of automated trading strategies for FCT-style trading
 */

/**
 * Base Strategy Class
 */
class BaseStrategy {
  constructor(config = {}) {
    this.config = config;
    this.name = this.constructor.name;
  }

  /**
   * Generate trading signal - must be implemented by subclasses
   */
  async generateSignal(symbol, marketData) {
    throw new Error('generateSignal must be implemented by subclass');
  }

  /**
   * Calculate Simple Moving Average
   */
  calculateSMA(prices, period) {
    if (prices.length < period) return null;
    
    const recentPrices = prices.slice(-period);
    const sum = recentPrices.reduce((acc, item) => acc + item.price, 0);
    return sum / period;
  }

  /**
   * Calculate Exponential Moving Average
   */
  calculateEMA(prices, period) {
    if (prices.length < period) return null;
    
    const multiplier = 2 / (period + 1);
    let ema = prices[0].price;
    
    for (let i = 1; i < prices.length; i++) {
      ema = (prices[i].price * multiplier) + (ema * (1 - multiplier));
    }
    
    return ema;
  }

  /**
   * Calculate RSI (Relative Strength Index)
   */
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    
    let gains = 0;
    let losses = 0;
    
    // Calculate initial average gain and loss
    for (let i = 1; i <= period; i++) {
      const change = prices[i].price - prices[i - 1].price;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    // Calculate RSI for remaining periods
    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i].price - prices[i - 1].price;
      const gain = change > 0 ? change : 0;
      const loss = change < 0 ? Math.abs(change) : 0;
      
      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;
    }
    
    if (avgLoss === 0) return 100;
    
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Calculate Bollinger Bands
   */
  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    if (prices.length < period) return null;
    
    const sma = this.calculateSMA(prices, period);
    const recentPrices = prices.slice(-period);
    
    // Calculate standard deviation
    const variance = recentPrices.reduce((acc, item) => {
      return acc + Math.pow(item.price - sma, 2);
    }, 0) / period;
    
    const standardDeviation = Math.sqrt(variance);
    
    return {
      upper: sma + (standardDeviation * stdDev),
      middle: sma,
      lower: sma - (standardDeviation * stdDev)
    };
  }
}

/**
 * Mean Reversion Strategy
 * Buys when price is oversold, sells when overbought
 */
class MeanReversionStrategy extends BaseStrategy {
  constructor(config = {}) {
    super(config);
    this.lookbackPeriod = config.lookbackPeriod || 20;
    this.zScoreThreshold = config.zScoreThreshold || 2.0;
  }

  async generateSignal(symbol, marketData) {
    const prices = marketData.prices;
    if (prices.length < this.lookbackPeriod) return null;
    
    const currentPrice = marketData.currentPrice;
    const sma = this.calculateSMA(prices, this.lookbackPeriod);
    
    // Calculate standard deviation
    const recentPrices = prices.slice(-this.lookbackPeriod);
    const variance = recentPrices.reduce((acc, item) => {
      return acc + Math.pow(item.price - sma, 2);
    }, 0) / this.lookbackPeriod;
    
    const stdDev = Math.sqrt(variance);
    const zScore = (currentPrice - sma) / stdDev;
    
    // Generate signals based on z-score
    if (zScore < -this.zScoreThreshold) {
      // Price is oversold - BUY signal
      return {
        action: 'BUY',
        confidence: Math.min(Math.abs(zScore) / this.zScoreThreshold, 1),
        reason: `Mean reversion BUY: Z-score ${zScore.toFixed(2)} below -${this.zScoreThreshold}`,
        quantity: 100,
        stopLoss: currentPrice * 0.98, // 2% stop loss
        takeProfit: currentPrice * 1.04 // 4% take profit
      };
    } else if (zScore > this.zScoreThreshold) {
      // Price is overbought - SELL signal
      return {
        action: 'SELL',
        confidence: Math.min(Math.abs(zScore) / this.zScoreThreshold, 1),
        reason: `Mean reversion SELL: Z-score ${zScore.toFixed(2)} above ${this.zScoreThreshold}`,
        quantity: 100,
        stopLoss: currentPrice * 1.02, // 2% stop loss
        takeProfit: currentPrice * 0.96 // 4% take profit
      };
    }
    
    return { action: 'HOLD', reason: `Z-score ${zScore.toFixed(2)} within threshold` };
  }
}

/**
 * Momentum Strategy
 * Follows price trends and momentum
 */
class MomentumStrategy extends BaseStrategy {
  constructor(config = {}) {
    super(config);
    this.momentumPeriod = config.momentumPeriod || 10;
    this.threshold = config.threshold || 0.02; // 2% threshold
  }

  async generateSignal(symbol, marketData) {
    const prices = marketData.prices;
    if (prices.length < this.momentumPeriod + 1) return null;
    
    const currentPrice = marketData.currentPrice;
    const pastPrice = prices[prices.length - this.momentumPeriod - 1].price;
    
    // Calculate momentum as percentage change
    const momentum = (currentPrice - pastPrice) / pastPrice;
    
    // Calculate short and long EMAs for trend confirmation
    const shortEMA = this.calculateEMA(prices.slice(-5), 5);
    const longEMA = this.calculateEMA(prices.slice(-20), 20);
    
    if (!shortEMA || !longEMA) return { action: 'HOLD', reason: 'Insufficient data for EMAs' };
    
    const trendUp = shortEMA > longEMA;
    const trendDown = shortEMA < longEMA;
    
    // Generate signals based on momentum and trend
    if (momentum > this.threshold && trendUp) {
      return {
        action: 'BUY',
        confidence: Math.min(momentum / this.threshold, 1),
        reason: `Momentum BUY: ${(momentum * 100).toFixed(2)}% momentum with uptrend`,
        quantity: 100,
        stopLoss: currentPrice * 0.98,
        takeProfit: currentPrice * 1.06
      };
    } else if (momentum < -this.threshold && trendDown) {
      return {
        action: 'SELL',
        confidence: Math.min(Math.abs(momentum) / this.threshold, 1),
        reason: `Momentum SELL: ${(momentum * 100).toFixed(2)}% momentum with downtrend`,
        quantity: 100,
        stopLoss: currentPrice * 1.02,
        takeProfit: currentPrice * 0.94
      };
    }
    
    return { 
      action: 'HOLD', 
      reason: `Momentum ${(momentum * 100).toFixed(2)}% below threshold or trend unclear` 
    };
  }
}

/**
 * RSI Strategy
 * Uses RSI indicator for overbought/oversold conditions
 */
class RSIStrategy extends BaseStrategy {
  constructor(config = {}) {
    super(config);
    this.period = config.period || 14;
    this.oversoldLevel = config.oversoldLevel || 30;
    this.overboughtLevel = config.overboughtLevel || 70;
  }

  async generateSignal(symbol, marketData) {
    const prices = marketData.prices;
    if (prices.length < this.period + 1) return null;
    
    const rsi = this.calculateRSI(prices, this.period);
    if (!rsi) return null;
    
    const currentPrice = marketData.currentPrice;
    
    // Generate signals based on RSI levels
    if (rsi < this.oversoldLevel) {
      return {
        action: 'BUY',
        confidence: (this.oversoldLevel - rsi) / this.oversoldLevel,
        reason: `RSI BUY: RSI ${rsi.toFixed(2)} below oversold level ${this.oversoldLevel}`,
        quantity: 100,
        stopLoss: currentPrice * 0.98,
        takeProfit: currentPrice * 1.05
      };
    } else if (rsi > this.overboughtLevel) {
      return {
        action: 'SELL',
        confidence: (rsi - this.overboughtLevel) / (100 - this.overboughtLevel),
        reason: `RSI SELL: RSI ${rsi.toFixed(2)} above overbought level ${this.overboughtLevel}`,
        quantity: 100,
        stopLoss: currentPrice * 1.02,
        takeProfit: currentPrice * 0.95
      };
    }
    
    return { action: 'HOLD', reason: `RSI ${rsi.toFixed(2)} in neutral zone` };
  }
}

/**
 * Bollinger Bands Strategy
 * Uses Bollinger Bands for mean reversion signals
 */
class BollingerBandsStrategy extends BaseStrategy {
  constructor(config = {}) {
    super(config);
    this.period = config.period || 20;
    this.stdDev = config.stdDev || 2;
  }

  async generateSignal(symbol, marketData) {
    const prices = marketData.prices;
    if (prices.length < this.period) return null;
    
    const bands = this.calculateBollingerBands(prices, this.period, this.stdDev);
    if (!bands) return null;
    
    const currentPrice = marketData.currentPrice;
    
    // Generate signals based on Bollinger Bands
    if (currentPrice < bands.lower) {
      return {
        action: 'BUY',
        confidence: (bands.lower - currentPrice) / (bands.middle - bands.lower),
        reason: `Bollinger BUY: Price ${currentPrice.toFixed(2)} below lower band ${bands.lower.toFixed(2)}`,
        quantity: 100,
        stopLoss: currentPrice * 0.98,
        takeProfit: bands.middle
      };
    } else if (currentPrice > bands.upper) {
      return {
        action: 'SELL',
        confidence: (currentPrice - bands.upper) / (bands.upper - bands.middle),
        reason: `Bollinger SELL: Price ${currentPrice.toFixed(2)} above upper band ${bands.upper.toFixed(2)}`,
        quantity: 100,
        stopLoss: currentPrice * 1.02,
        takeProfit: bands.middle
      };
    }
    
    return { action: 'HOLD', reason: `Price within Bollinger Bands` };
  }
}

/**
 * Breakout Strategy
 * Trades breakouts from consolidation patterns
 */
class BreakoutStrategy extends BaseStrategy {
  constructor(config = {}) {
    super(config);
    this.lookbackPeriod = config.lookbackPeriod || 20;
    this.breakoutThreshold = config.breakoutThreshold || 0.02; // 2%
  }

  async generateSignal(symbol, marketData) {
    const prices = marketData.prices;
    if (prices.length < this.lookbackPeriod) return null;
    
    const recentPrices = prices.slice(-this.lookbackPeriod);
    const currentPrice = marketData.currentPrice;
    
    // Find support and resistance levels
    const highs = recentPrices.map(p => p.price);
    const resistance = Math.max(...highs);
    const support = Math.min(...highs);
    
    const range = resistance - support;
    const rangePercent = range / support;
    
    // Only trade if we've been in a consolidation (tight range)
    if (rangePercent > 0.05) { // 5% range is too wide
      return { action: 'HOLD', reason: 'Range too wide for breakout strategy' };
    }
    
    // Check for breakouts
    const breakoutUp = currentPrice > resistance * (1 + this.breakoutThreshold);
    const breakoutDown = currentPrice < support * (1 - this.breakoutThreshold);
    
    if (breakoutUp) {
      return {
        action: 'BUY',
        confidence: (currentPrice - resistance) / resistance,
        reason: `Breakout BUY: Price ${currentPrice.toFixed(2)} broke above resistance ${resistance.toFixed(2)}`,
        quantity: 100,
        stopLoss: resistance * 0.99, // Stop below resistance
        takeProfit: currentPrice * 1.06
      };
    } else if (breakoutDown) {
      return {
        action: 'SELL',
        confidence: (support - currentPrice) / support,
        reason: `Breakout SELL: Price ${currentPrice.toFixed(2)} broke below support ${support.toFixed(2)}`,
        quantity: 100,
        stopLoss: support * 1.01, // Stop above support
        takeProfit: currentPrice * 0.94
      };
    }
    
    return { action: 'HOLD', reason: 'No breakout detected' };
  }
}

module.exports = {
  BaseStrategy,
  MeanReversionStrategy,
  MomentumStrategy,
  RSIStrategy,
  BollingerBandsStrategy,
  BreakoutStrategy
};
