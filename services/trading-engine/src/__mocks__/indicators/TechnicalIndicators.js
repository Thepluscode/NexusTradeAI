// Mock implementation of TechnicalIndicators for testing
class TechnicalIndicators {
  constructor() {
    this.logger = {
      info: () => {},
      error: () => {},
      debug: () => {},
    };
  }

  // Mock implementations of technical indicator methods
  calculateSMA(prices, period) {
    // Simple mock implementation
    if (!prices || prices.length < period) return [];
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    return sma;
  }

  calculateEMA(prices, period) {
    // Simple mock implementation
    if (!prices || prices.length < period) return [];
    const multiplier = 2 / (period + 1);
    const ema = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      ema.push((prices[i] - ema[i - 1]) * multiplier + ema[i - 1]);
    }
    return ema;
  }

  calculateRSI(prices, period = 14) {
    // Simple mock implementation
    if (!prices || prices.length < period + 1) return [];
    const rsi = [];
    for (let i = 0; i < period; i++) {
      rsi.push(50); // Neutral RSI
    }
    return rsi;
  }

  calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    // Simple mock implementation
    if (!prices || prices.length < slowPeriod + signalPeriod) return { macd: [], signal: [], histogram: [] };
    const macd = [];
    const signal = [];
    const histogram = [];
    for (let i = 0; i < prices.length; i++) {
      macd.push(0);
      signal.push(0);
      histogram.push(0);
    }
    return { macd, signal, histogram };
  }

  calculateBollingerBands(prices, period = 20, stdDev = 2) {
    // Simple mock implementation
    if (!prices || prices.length < period) return { upper: [], middle: [], lower: [] };
    const upper = [];
    const middle = [];
    const lower = [];
    for (let i = 0; i < prices.length; i++) {
      middle.push(prices[i]);
      upper.push(prices[i] * 1.02);
      lower.push(prices[i] * 0.98);
    }
    return { upper, middle, lower };
  }
}

module.exports = TechnicalIndicators;
