// Technical Indicators Library for Nexus Alpha
// High-performance implementations of key trading indicators

/**
 * Calculate Average True Range (ATR)
 */
function calculateATR(marketData, period = 14) {
  if (marketData.length < period + 1) {
    throw new Error(`Insufficient data for ATR calculation. Need ${period + 1} periods, got ${marketData.length}`);
  }
  
  const trueRanges = [];
  
  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];
    const previous = marketData[i - 1];
    
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - previous.close);
    const tr3 = Math.abs(current.low - previous.close);
    
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }
  
  // Calculate initial ATR (simple moving average)
  let atr = trueRanges.slice(0, period).reduce((sum, tr) => sum + tr, 0) / period;
  
  // Calculate smoothed ATR using Wilder's smoothing
  for (let i = period; i < trueRanges.length; i++) {
    atr = ((atr * (period - 1)) + trueRanges[i]) / period;
  }
  
  return atr;
}

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  if (prices.length < slowPeriod) {
    throw new Error(`Insufficient data for MACD calculation. Need ${slowPeriod} periods, got ${prices.length}`);
  }
  
  // Calculate EMAs
  const fastEMA = calculateEMA(prices, fastPeriod);
  const slowEMA = calculateEMA(prices, slowPeriod);
  
  // Calculate MACD line
  const macdLine = fastEMA - slowEMA;
  
  // Calculate signal line (EMA of MACD line)
  const macdHistory = [];
  for (let i = slowPeriod - 1; i < prices.length; i++) {
    const fastEMAValue = calculateEMAAtIndex(prices, fastPeriod, i);
    const slowEMAValue = calculateEMAAtIndex(prices, slowPeriod, i);
    macdHistory.push(fastEMAValue - slowEMAValue);
  }
  
  const signalLine = calculateEMA(macdHistory, signalPeriod);
  
  // Calculate histogram
  const histogram = macdLine - signalLine;
  
  return {
    macd: macdLine,
    signal: signalLine,
    histogram: histogram
  };
}

/**
 * Calculate RSI (Relative Strength Index)
 */
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) {
    throw new Error(`Insufficient data for RSI calculation. Need ${period + 1} periods, got ${prices.length}`);
  }
  
  const gains = [];
  const losses = [];
  
  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  // Calculate initial average gain and loss
  let avgGain = gains.slice(0, period).reduce((sum, gain) => sum + gain, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((sum, loss) => sum + loss, 0) / period;
  
  // Calculate smoothed averages using Wilder's smoothing
  for (let i = period; i < gains.length; i++) {
    avgGain = ((avgGain * (period - 1)) + gains[i]) / period;
    avgLoss = ((avgLoss * (period - 1)) + losses[i]) / period;
  }
  
  // Calculate RSI
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return rsi;
}

/**
 * Calculate Bollinger Bands
 */
function calculateBollingerBands(prices, period = 20, standardDeviations = 2) {
  if (prices.length < period) {
    throw new Error(`Insufficient data for Bollinger Bands calculation. Need ${period} periods, got ${prices.length}`);
  }
  
  // Calculate middle band (SMA)
  const middle = calculateSMA(prices, period);
  
  // Calculate standard deviation
  const recentPrices = prices.slice(-period);
  const variance = recentPrices.reduce((sum, price) => {
    return sum + Math.pow(price - middle, 2);
  }, 0) / period;
  
  const stdDev = Math.sqrt(variance);
  
  // Calculate upper and lower bands
  const upper = middle + (standardDeviations * stdDev);
  const lower = middle - (standardDeviations * stdDev);
  
  return {
    upper: upper,
    middle: middle,
    lower: lower,
    bandwidth: (upper - lower) / middle,
    percentB: (prices[prices.length - 1] - lower) / (upper - lower)
  };
}

/**
 * Calculate Simple Moving Average (SMA)
 */
function calculateSMA(prices, period) {
  if (prices.length < period) {
    throw new Error(`Insufficient data for SMA calculation. Need ${period} periods, got ${prices.length}`);
  }
  
  const recentPrices = prices.slice(-period);
  return recentPrices.reduce((sum, price) => sum + price, 0) / period;
}

/**
 * Calculate Exponential Moving Average (EMA)
 */
function calculateEMA(prices, period) {
  if (prices.length < period) {
    throw new Error(`Insufficient data for EMA calculation. Need ${period} periods, got ${prices.length}`);
  }
  
  const multiplier = 2 / (period + 1);
  let ema = prices[0];
  
  for (let i = 1; i < prices.length; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

/**
 * Calculate EMA at specific index
 */
function calculateEMAAtIndex(prices, period, index) {
  if (index < period - 1) {
    throw new Error(`Index ${index} is too small for EMA calculation with period ${period}`);
  }
  
  const multiplier = 2 / (period + 1);
  let ema = prices[index - period + 1];
  
  for (let i = index - period + 2; i <= index; i++) {
    ema = (prices[i] * multiplier) + (ema * (1 - multiplier));
  }
  
  return ema;
}

/**
 * Calculate Stochastic Oscillator
 */
function calculateStochastic(marketData, kPeriod = 14, dPeriod = 3) {
  if (marketData.length < kPeriod) {
    throw new Error(`Insufficient data for Stochastic calculation. Need ${kPeriod} periods, got ${marketData.length}`);
  }
  
  const recentData = marketData.slice(-kPeriod);
  const currentClose = marketData[marketData.length - 1].close;
  
  const highestHigh = Math.max(...recentData.map(candle => candle.high));
  const lowestLow = Math.min(...recentData.map(candle => candle.low));
  
  // Calculate %K
  const percentK = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
  
  // For %D, we would need multiple %K values, so this is simplified
  const percentD = percentK; // In practice, this would be SMA of %K values
  
  return {
    percentK: percentK,
    percentD: percentD
  };
}

/**
 * Calculate Williams %R
 */
function calculateWilliamsR(marketData, period = 14) {
  if (marketData.length < period) {
    throw new Error(`Insufficient data for Williams %R calculation. Need ${period} periods, got ${marketData.length}`);
  }
  
  const recentData = marketData.slice(-period);
  const currentClose = marketData[marketData.length - 1].close;
  
  const highestHigh = Math.max(...recentData.map(candle => candle.high));
  const lowestLow = Math.min(...recentData.map(candle => candle.low));
  
  const williamsR = ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  
  return williamsR;
}

/**
 * Calculate Commodity Channel Index (CCI)
 */
function calculateCCI(marketData, period = 20) {
  if (marketData.length < period) {
    throw new Error(`Insufficient data for CCI calculation. Need ${period} periods, got ${marketData.length}`);
  }
  
  // Calculate typical prices
  const typicalPrices = marketData.map(candle => 
    (candle.high + candle.low + candle.close) / 3
  );
  
  // Calculate SMA of typical prices
  const smaTP = calculateSMA(typicalPrices, period);
  
  // Calculate mean deviation
  const recentTypicalPrices = typicalPrices.slice(-period);
  const meanDeviation = recentTypicalPrices.reduce((sum, tp) => 
    sum + Math.abs(tp - smaTP), 0
  ) / period;
  
  // Calculate CCI
  const currentTypicalPrice = typicalPrices[typicalPrices.length - 1];
  const cci = (currentTypicalPrice - smaTP) / (0.015 * meanDeviation);
  
  return cci;
}

/**
 * Calculate Money Flow Index (MFI)
 */
function calculateMFI(marketData, period = 14) {
  if (marketData.length < period + 1) {
    throw new Error(`Insufficient data for MFI calculation. Need ${period + 1} periods, got ${marketData.length}`);
  }
  
  const moneyFlows = [];
  
  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];
    const previous = marketData[i - 1];
    
    const typicalPrice = (current.high + current.low + current.close) / 3;
    const previousTypicalPrice = (previous.high + previous.low + previous.close) / 3;
    
    const rawMoneyFlow = typicalPrice * current.volume;
    
    if (typicalPrice > previousTypicalPrice) {
      moneyFlows.push({ positive: rawMoneyFlow, negative: 0 });
    } else if (typicalPrice < previousTypicalPrice) {
      moneyFlows.push({ positive: 0, negative: rawMoneyFlow });
    } else {
      moneyFlows.push({ positive: 0, negative: 0 });
    }
  }
  
  // Calculate positive and negative money flow sums
  const recentFlows = moneyFlows.slice(-period);
  const positiveFlow = recentFlows.reduce((sum, flow) => sum + flow.positive, 0);
  const negativeFlow = recentFlows.reduce((sum, flow) => sum + flow.negative, 0);
  
  // Calculate Money Flow Ratio and MFI
  if (negativeFlow === 0) return 100;
  
  const moneyFlowRatio = positiveFlow / negativeFlow;
  const mfi = 100 - (100 / (1 + moneyFlowRatio));
  
  return mfi;
}

/**
 * Calculate On-Balance Volume (OBV)
 */
function calculateOBV(marketData) {
  if (marketData.length < 2) {
    throw new Error(`Insufficient data for OBV calculation. Need at least 2 periods, got ${marketData.length}`);
  }
  
  let obv = 0;
  
  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];
    const previous = marketData[i - 1];
    
    if (current.close > previous.close) {
      obv += current.volume;
    } else if (current.close < previous.close) {
      obv -= current.volume;
    }
    // If close prices are equal, OBV remains unchanged
  }
  
  return obv;
}

/**
 * Calculate Parabolic SAR
 */
function calculateParabolicSAR(marketData, accelerationFactor = 0.02, maxAcceleration = 0.2) {
  if (marketData.length < 2) {
    throw new Error(`Insufficient data for Parabolic SAR calculation. Need at least 2 periods, got ${marketData.length}`);
  }
  
  let sar = marketData[0].low;
  let trend = 1; // 1 for uptrend, -1 for downtrend
  let af = accelerationFactor;
  let extremePoint = marketData[0].high;
  
  for (let i = 1; i < marketData.length; i++) {
    const current = marketData[i];
    
    // Calculate new SAR
    sar = sar + af * (extremePoint - sar);
    
    // Check for trend reversal
    if (trend === 1) { // Uptrend
      if (current.low <= sar) {
        // Trend reversal to downtrend
        trend = -1;
        sar = extremePoint;
        extremePoint = current.low;
        af = accelerationFactor;
      } else {
        // Continue uptrend
        if (current.high > extremePoint) {
          extremePoint = current.high;
          af = Math.min(af + accelerationFactor, maxAcceleration);
        }
      }
    } else { // Downtrend
      if (current.high >= sar) {
        // Trend reversal to uptrend
        trend = 1;
        sar = extremePoint;
        extremePoint = current.high;
        af = accelerationFactor;
      } else {
        // Continue downtrend
        if (current.low < extremePoint) {
          extremePoint = current.low;
          af = Math.min(af + accelerationFactor, maxAcceleration);
        }
      }
    }
  }
  
  return {
    sar: sar,
    trend: trend,
    accelerationFactor: af
  };
}

module.exports = {
  calculateATR,
  calculateMACD,
  calculateRSI,
  calculateBollingerBands,
  calculateSMA,
  calculateEMA,
  calculateEMAAtIndex,
  calculateStochastic,
  calculateWilliamsR,
  calculateCCI,
  calculateMFI,
  calculateOBV,
  calculateParabolicSAR
};
