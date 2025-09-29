// Technical Indicators for High Win Rate Trading Strategies
// Optimized for accuracy and performance

class TechnicalIndicators {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Exponential Moving Average
   */
  ema(prices, period) {
    const cacheKey = `ema_${period}_${prices.length}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    if (prices.length < period) return [];
    
    const multiplier = 2 / (period + 1);
    const ema = [prices[0]];
    
    for (let i = 1; i < prices.length; i++) {
      ema[i] = (prices[i] * multiplier) + (ema[i - 1] * (1 - multiplier));
    }
    
    this.cache.set(cacheKey, ema);
    return ema;
  }

  /**
   * Simple Moving Average
   */
  sma(prices, period) {
    if (prices.length < period) return [];
    
    const sma = [];
    for (let i = period - 1; i < prices.length; i++) {
      const sum = prices.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      sma.push(sum / period);
    }
    
    return sma;
  }

  /**
   * Relative Strength Index
   */
  rsi(prices, period = 14) {
    if (prices.length < period + 1) return [];
    
    const gains = [];
    const losses = [];
    
    for (let i = 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }
    
    const rsi = [];
    let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period; i < gains.length; i++) {
      if (avgLoss === 0) {
        rsi.push(100);
      } else {
        const rs = avgGain / avgLoss;
        rsi.push(100 - (100 / (1 + rs)));
      }
      
      avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
      avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
    }
    
    return rsi;
  }

  /**
   * Bollinger Bands
   */
  bollingerBands(prices, period = 20, stdDev = 2) {
    const sma = this.sma(prices, period);
    const upper = [];
    const lower = [];
    
    for (let i = 0; i < sma.length; i++) {
      const slice = prices.slice(i, i + period);
      const mean = sma[i];
      const variance = slice.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / period;
      const standardDeviation = Math.sqrt(variance);
      
      upper.push(mean + (standardDeviation * stdDev));
      lower.push(mean - (standardDeviation * stdDev));
    }
    
    return { upper, middle: sma, lower };
  }

  /**
   * MACD (Moving Average Convergence Divergence)
   */
  macd(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    const fastEMA = this.ema(prices, fastPeriod);
    const slowEMA = this.ema(prices, slowPeriod);
    
    const macdLine = [];
    const minLength = Math.min(fastEMA.length, slowEMA.length);
    
    for (let i = 0; i < minLength; i++) {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
    
    const signalLine = this.ema(macdLine, signalPeriod);
    const histogram = [];
    
    for (let i = 0; i < signalLine.length; i++) {
      histogram.push(macdLine[i] - signalLine[i]);
    }
    
    return { macd: macdLine, signal: signalLine, histogram };
  }

  /**
   * Stochastic Oscillator
   */
  stochastic(prices, period = 14, kSmooth = 3, dSmooth = 3) {
    const k = [];
    
    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const highest = Math.max(...slice);
      const lowest = Math.min(...slice);
      const current = prices[i];
      
      k.push(((current - lowest) / (highest - lowest)) * 100);
    }
    
    const kSmoothed = this.sma(k, kSmooth);
    const d = this.sma(kSmoothed, dSmooth);
    
    return { k: kSmoothed, d };
  }

  /**
   * Volume Weighted Average Price
   */
  vwap(prices, volumes) {
    const vwap = [];
    let cumulativeVolume = 0;
    let cumulativePriceVolume = 0;
    
    for (let i = 0; i < prices.length; i++) {
      cumulativeVolume += volumes[i];
      cumulativePriceVolume += prices[i] * volumes[i];
      vwap.push(cumulativePriceVolume / cumulativeVolume);
    }
    
    return vwap;
  }

  /**
   * Average True Range
   */
  atr(highs, lows, closes, period = 14) {
    const trueRanges = [];
    
    for (let i = 1; i < closes.length; i++) {
      const tr1 = highs[i] - lows[i];
      const tr2 = Math.abs(highs[i] - closes[i - 1]);
      const tr3 = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(tr1, tr2, tr3));
    }
    
    return this.sma(trueRanges, period);
  }

  /**
   * Williams %R
   */
  williamsR(highs, lows, closes, period = 14) {
    const wr = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const highestHigh = Math.max(...highs.slice(i - period + 1, i + 1));
      const lowestLow = Math.min(...lows.slice(i - period + 1, i + 1));
      const close = closes[i];
      
      wr.push(((highestHigh - close) / (highestHigh - lowestLow)) * -100);
    }
    
    return wr;
  }

  /**
   * Commodity Channel Index
   */
  cci(highs, lows, closes, period = 20) {
    const typicalPrices = [];
    for (let i = 0; i < closes.length; i++) {
      typicalPrices.push((highs[i] + lows[i] + closes[i]) / 3);
    }
    
    const smaTP = this.sma(typicalPrices, period);
    const cci = [];
    
    for (let i = 0; i < smaTP.length; i++) {
      const slice = typicalPrices.slice(i, i + period);
      const meanDeviation = slice.reduce((sum, tp) => sum + Math.abs(tp - smaTP[i]), 0) / period;
      cci.push((typicalPrices[i + period - 1] - smaTP[i]) / (0.015 * meanDeviation));
    }
    
    return cci;
  }

  /**
   * Money Flow Index
   */
  mfi(highs, lows, closes, volumes, period = 14) {
    const typicalPrices = [];
    const rawMoneyFlows = [];
    
    for (let i = 0; i < closes.length; i++) {
      const tp = (highs[i] + lows[i] + closes[i]) / 3;
      typicalPrices.push(tp);
      rawMoneyFlows.push(tp * volumes[i]);
    }
    
    const mfi = [];
    
    for (let i = period; i < typicalPrices.length; i++) {
      let positiveFlow = 0;
      let negativeFlow = 0;
      
      for (let j = i - period + 1; j <= i; j++) {
        if (typicalPrices[j] > typicalPrices[j - 1]) {
          positiveFlow += rawMoneyFlows[j];
        } else if (typicalPrices[j] < typicalPrices[j - 1]) {
          negativeFlow += rawMoneyFlows[j];
        }
      }
      
      const moneyRatio = positiveFlow / negativeFlow;
      mfi.push(100 - (100 / (1 + moneyRatio)));
    }
    
    return mfi;
  }

  /**
   * Smart Money Index
   */
  smartMoneyIndex(prices, volumes) {
    const smi = [0];
    
    for (let i = 1; i < prices.length; i++) {
      const priceChange = prices[i] - prices[i - 1];
      const volumeWeightedChange = priceChange * volumes[i];
      smi.push(smi[i - 1] + volumeWeightedChange);
    }
    
    return smi;
  }

  /**
   * Accumulation/Distribution Line
   */
  accumulationDistribution(prices, volumes) {
    const ad = [0];
    
    for (let i = 1; i < prices.length; i++) {
      // Simplified AD calculation using close prices
      const multiplier = ((prices[i] - prices[i - 1]) / prices[i - 1]) || 0;
      const moneyFlowVolume = multiplier * volumes[i];
      ad.push(ad[i - 1] + moneyFlowVolume);
    }
    
    return ad;
  }

  /**
   * Volume Profile
   */
  volumeProfile(prices, volumes) {
    const priceVolumeMap = new Map();
    
    for (let i = 0; i < prices.length; i++) {
      const priceLevel = Math.round(prices[i] * 100) / 100; // Round to 2 decimals
      const currentVolume = priceVolumeMap.get(priceLevel) || 0;
      priceVolumeMap.set(priceLevel, currentVolume + volumes[i]);
    }
    
    // Find Point of Control (highest volume price level)
    let maxVolume = 0;
    let pocPrice = 0;
    
    for (const [price, volume] of priceVolumeMap) {
      if (volume > maxVolume) {
        maxVolume = volume;
        pocPrice = price;
      }
    }
    
    return {
      profile: Array.from(priceVolumeMap.entries()),
      pointOfControl: pocPrice,
      maxVolume
    };
  }

  /**
   * Calculate returns
   */
  returns(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
    }
    return returns;
  }

  /**
   * Calculate volatility
   */
  volatility(returns) {
    if (returns.length === 0) return 0;
    
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    return Math.sqrt(variance);
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.cache.clear();
  }
}

module.exports = TechnicalIndicators;
