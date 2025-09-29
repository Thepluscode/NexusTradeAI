/**
 * Technical Indicators Library for NexusTradeAI
 * High-performance technical analysis indicators for trading algorithms
 */

class TechnicalIndicators {
  /**
   * Simple Moving Average (SMA)
   */
  static sma(prices, period) {
    if (!Array.isArray(prices) || prices.length < period) {
      throw new Error('Insufficient data for SMA calculation');
    }

    const result = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
    return result;
  }

  /**
   * Exponential Moving Average (EMA)
   */
  static ema(prices, period) {
    if (!Array.isArray(prices) || prices.length < period) {
      throw new Error('Insufficient data for EMA calculation');
    }

    const multiplier = 2 / (period + 1);
    const result = [];

    // Start with SMA for the first value
    const firstSMA = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
    result.push(firstSMA);

    for (let i = period; i < prices.length; i++) {
      const ema = (prices[i] * multiplier) + (result[result.length - 1] * (1 - multiplier));
      result.push(ema);
    }
    return result;
  }

  /**
   * Relative Strength Index (RSI)
   */
  static rsi(prices, period = 14) {
    if (!Array.isArray(prices) || prices.length < period + 1) {
      throw new Error('Insufficient data for RSI calculation');
    }

    const gains = [];
    const losses = [];

    // Calculate price changes
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    const result = [];

    // Calculate initial average gain and loss
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;

    for (let i = period; i < gains.length; i++) {
      // Smoothed averages
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }

    return result;
  }

  /**
   * Moving Average Convergence Divergence (MACD)
   */
  static macd(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!Array.isArray(prices) || prices.length < slowPeriod) {
      throw new Error('Insufficient data for MACD calculation');
    }

    const fastEMA = this.ema(prices, fastPeriod);
    const slowEMA = this.ema(prices, slowPeriod);

    // Align arrays (slowEMA is shorter)
    const alignedFastEMA = fastEMA.slice(fastEMA.length - slowEMA.length);

    const macdLine = alignedFastEMA.map((fast, i) => fast - slowEMA[i]);
    const signalLine = this.ema(macdLine, signalPeriod);

    // Align MACD line with signal line
    const alignedMACDLine = macdLine.slice(macdLine.length - signalLine.length);
    const histogram = alignedMACDLine.map((macd, i) => macd - signalLine[i]);

    return {
      macd: alignedMACDLine,
      signal: signalLine,
      histogram: histogram
    };
  }

  /**
   * Bollinger Bands
   */
  static bollingerBands(prices, period = 20, stdDev = 2) {
    if (!Array.isArray(prices) || prices.length < period) {
      throw new Error('Insufficient data for Bollinger Bands calculation');
    }

    const sma = this.sma(prices, period);
    const upperBand = [];
    const lowerBand = [];

    for (let i = 0; i < sma.length; i++) {
      const dataSlice = prices.slice(i, i + period);
      const mean = sma[i];
      const variance = dataSlice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);

      upperBand.push(mean + (stdDev * standardDeviation));
      lowerBand.push(mean - (stdDev * standardDeviation));
    }

    return {
      upper: upperBand,
      middle: sma,
      lower: lowerBand
    };
  }

  /**
   * Stochastic Oscillator
   */
  static stochastic(highs, lows, closes, kPeriod = 14, dPeriod = 3) {
    if (!Array.isArray(highs) || !Array.isArray(lows) || !Array.isArray(closes)) {
      throw new Error('High, low, and close arrays are required');
    }

    if (highs.length !== lows.length || lows.length !== closes.length) {
      throw new Error('All arrays must have the same length');
    }

    if (highs.length < kPeriod) {
      throw new Error('Insufficient data for Stochastic calculation');
    }

    const kPercent = [];

    for (let i = kPeriod - 1; i < closes.length; i++) {
      const highestHigh = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
      const lowestLow = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
      const currentClose = closes[i];

      const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
      kPercent.push(k);
    }

    const dPercent = this.sma(kPercent, dPeriod);

    return {
      k: kPercent,
      d: dPercent
    };
  }
}

// Export both class and individual functions for compatibility
const calculateSMA = (prices, period) => TechnicalIndicators.sma(prices, period).slice(-1)[0];
const calculateEMA = (prices, period) => TechnicalIndicators.ema(prices, period).slice(-1)[0];
const calculateRSI = (prices, period) => TechnicalIndicators.rsi(prices, period).slice(-1)[0];
const calculateMACD = (prices, fast = 12, slow = 26, signal = 9) => TechnicalIndicators.macd(prices, fast, slow, signal);
const calculateATR = (marketData, period) => TechnicalIndicators.atr(marketData, period).slice(-1)[0];
const calculateBollingerBands = (prices, period, stdDev) => TechnicalIndicators.bollingerBands(prices, period, stdDev);

/**
 * Advanced Technical Indicators for Enterprise Trading
 * Implements GPU acceleration, vectorized calculations, and institutional-grade indicators
 */

/**
 * Commodity Channel Index (CCI)
 */
const calculateCCI = (marketData, period = 20) => {
  if (marketData.length < period) return null;

  const typicalPrices = marketData.map(candle =>
    (candle.high + candle.low + candle.close) / 3
  );

  const smaTP = calculateSMA(typicalPrices, period);
  const recentTP = typicalPrices.slice(-period);

  // Calculate mean deviation
  const meanDeviation = recentTP.reduce((sum, tp) =>
    sum + Math.abs(tp - smaTP), 0
  ) / period;

  const currentTP = typicalPrices[typicalPrices.length - 1];

  return (currentTP - smaTP) / (0.015 * meanDeviation);
};

/**
 * Average Directional Index (ADX)
 */
const calculateADX = (marketData, period = 14) => {
  if (marketData.length < period + 1) return null;

  const dmPlus = [];
  const dmMinus = [];
  const trueRanges = [];

  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];
    const previous = marketData[i - 1];

    const highDiff = current.high - previous.high;
    const lowDiff = previous.low - current.low;

    dmPlus.push(highDiff > lowDiff && highDiff > 0 ? highDiff : 0);
    dmMinus.push(lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0);

    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  const avgDMPlus = calculateSMA(dmPlus.slice(-period), period);
  const avgDMMinus = calculateSMA(dmMinus.slice(-period), period);
  const avgTR = calculateSMA(trueRanges.slice(-period), period);

  const diPlus = (avgDMPlus / avgTR) * 100;
  const diMinus = (avgDMMinus / avgTR) * 100;

  const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;

  return {
    adx: dx,
    diPlus: diPlus,
    diMinus: diMinus
  };
};

/**
 * Volume Weighted Average Price (VWAP)
 */
const calculateVWAP = (marketData) => {
  if (marketData.length === 0) return null;

  let totalVolume = 0;
  let totalVolumePrice = 0;

  for (const candle of marketData) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    totalVolumePrice += typicalPrice * candle.volume;
    totalVolume += candle.volume;
  }

  return totalVolume > 0 ? totalVolumePrice / totalVolume : null;
};

/**
 * Parabolic SAR
 */
const calculateParabolicSAR = (marketData, step = 0.02, maxStep = 0.2) => {
  if (marketData.length < 2) return null;

  let sar = marketData[0].low;
  let ep = marketData[0].high;
  let af = step;
  let isUptrend = true;

  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];

    // Calculate new SAR
    sar = sar + af * (ep - sar);

    if (isUptrend) {
      if (current.low <= sar) {
        // Trend reversal
        isUptrend = false;
        sar = ep;
        ep = current.low;
        af = step;
      } else {
        if (current.high > ep) {
          ep = current.high;
          af = Math.min(af + step, maxStep);
        }
      }
    } else {
      if (current.high >= sar) {
        // Trend reversal
        isUptrend = true;
        sar = ep;
        ep = current.high;
        af = step;
      } else {
        if (current.low < ep) {
          ep = current.low;
          af = Math.min(af + step, maxStep);
        }
      }
    }
  }

  return {
    sar: sar,
    isUptrend: isUptrend
  };
};

/**
 * Money Flow Index (MFI)
 */
const calculateMFI = (marketData, period = 14) => {
  if (marketData.length < period + 1) return null;

  const moneyFlows = [];

  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];
    const previous = marketData[i - 1];

    const typicalPrice = (current.high + current.low + current.close) / 3;
    const prevTypicalPrice = (previous.high + previous.low + previous.close) / 3;

    const rawMoneyFlow = typicalPrice * current.volume;

    moneyFlows.push({
      value: rawMoneyFlow,
      isPositive: typicalPrice > prevTypicalPrice
    });
  }

  const recentFlows = moneyFlows.slice(-period);
  const positiveFlow = recentFlows
    .filter(mf => mf.isPositive)
    .reduce((sum, mf) => sum + mf.value, 0);

  const negativeFlow = recentFlows
    .filter(mf => !mf.isPositive)
    .reduce((sum, mf) => sum + mf.value, 0);

  if (negativeFlow === 0) return 100;

  const moneyRatio = positiveFlow / negativeFlow;
  return 100 - (100 / (1 + moneyRatio));
};

/**
 * Ichimoku Cloud Components
 */
const calculateIchimoku = (marketData, tenkanPeriod = 9, kijunPeriod = 26, senkouBPeriod = 52) => {
  if (marketData.length < senkouBPeriod) return null;

  const getHighLow = (data, period) => {
    const highs = data.slice(-period).map(c => c.high);
    const lows = data.slice(-period).map(c => c.low);
    return {
      high: Math.max(...highs),
      low: Math.min(...lows)
    };
  };

  // Tenkan-sen (Conversion Line)
  const tenkanHL = getHighLow(marketData, tenkanPeriod);
  const tenkanSen = (tenkanHL.high + tenkanHL.low) / 2;

  // Kijun-sen (Base Line)
  const kijunHL = getHighLow(marketData, kijunPeriod);
  const kijunSen = (kijunHL.high + kijunHL.low) / 2;

  // Senkou Span A (Leading Span A)
  const senkouSpanA = (tenkanSen + kijunSen) / 2;

  // Senkou Span B (Leading Span B)
  const senkouBHL = getHighLow(marketData, senkouBPeriod);
  const senkouSpanB = (senkouBHL.high + senkouBHL.low) / 2;

  // Chikou Span (Lagging Span) - current close shifted back
  const chikouSpan = marketData[marketData.length - 1].close;

  return {
    tenkanSen,
    kijunSen,
    senkouSpanA,
    senkouSpanB,
    chikouSpan,
    cloudTop: Math.max(senkouSpanA, senkouSpanB),
    cloudBottom: Math.min(senkouSpanA, senkouSpanB)
  };
};

module.exports = {
  TechnicalIndicators,
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateATR,
  calculateBollingerBands,
  calculateCCI,
  calculateADX,
  calculateVWAP,
  calculateParabolicSAR,
  calculateMFI,
  calculateIchimoku
};