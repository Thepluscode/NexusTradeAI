import Decimal from 'decimal.js';

// Configure Decimal.js for financial calculations
Decimal.config({
  precision: 28,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

/**
 * Financial calculation utilities using Decimal.js for precision
 */

/**
 * Calculate percentage change between two values
 */
export const calculatePercentageChange = (
  currentValue: number | string | Decimal,
  previousValue: number | string | Decimal
): number => {
  const current = new Decimal(currentValue);
  const previous = new Decimal(previousValue);

  if (previous.isZero()) return 0;

  return current.minus(previous).dividedBy(previous).times(100).toNumber();
};

/**
 * Calculate absolute change between two values
 */
export const calculateAbsoluteChange = (
  currentValue: number | string | Decimal,
  previousValue: number | string | Decimal
): number => {
  const current = new Decimal(currentValue);
  const previous = new Decimal(previousValue);

  return current.minus(previous).toNumber();
};

/**
 * Calculate compound annual growth rate (CAGR)
 */
export const calculateCAGR = (
  beginningValue: number | string | Decimal,
  endingValue: number | string | Decimal,
  numberOfYears: number
): number => {
  const beginning = new Decimal(beginningValue);
  const ending = new Decimal(endingValue);
  const years = new Decimal(numberOfYears);

  if (beginning.isZero() || years.isZero()) return 0;

  const ratio = ending.dividedBy(beginning);
  const exponent = new Decimal(1).dividedBy(years);

  // Using Math.pow for fractional exponents as Decimal.js doesn't support it directly
  const result = Math.pow(ratio.toNumber(), exponent.toNumber()) - 1;

  return result * 100;
};

/**
 * Calculate simple moving average
 */
export const calculateSMA = (
  values: (number | string | Decimal)[],
  period: number
): number[] => {
  if (values.length < period) return [];

  const result: number[] = [];

  for (let i = period - 1; i < values.length; i++) {
    let sum = new Decimal(0);

    for (let j = i - period + 1; j <= i; j++) {
      sum = sum.plus(new Decimal(values[j]));
    }

    result.push(sum.dividedBy(period).toNumber());
  }

  return result;
};

/**
 * Calculate exponential moving average
 */
export const calculateEMA = (
  values: (number | string | Decimal)[],
  period: number
): number[] => {
  if (values.length === 0) return [];

  const result: number[] = [];
  const multiplier = new Decimal(2).dividedBy(new Decimal(period).plus(1));

  // First EMA is the first value
  result.push(new Decimal(values[0]).toNumber());

  for (let i = 1; i < values.length; i++) {
    const currentValue = new Decimal(values[i]);
    const previousEMA = new Decimal(result[i - 1]);

    const ema = currentValue.times(multiplier).plus(
      previousEMA.times(new Decimal(1).minus(multiplier))
    );

    result.push(ema.toNumber());
  }

  return result;
};

/**
 * Calculate Relative Strength Index (RSI)
 */
export const calculateRSI = (
  prices: (number | string | Decimal)[],
  period: number = 14
): number[] => {
  if (prices.length < period + 1) return [];

  const changes: Decimal[] = [];

  // Calculate price changes
  for (let i = 1; i < prices.length; i++) {
    const current = new Decimal(prices[i]);
    const previous = new Decimal(prices[i - 1]);
    changes.push(current.minus(previous));
  }

  const result: number[] = [];

  for (let i = period - 1; i < changes.length; i++) {
    let gains = new Decimal(0);
    let losses = new Decimal(0);

    for (let j = i - period + 1; j <= i; j++) {
      if (changes[j].isPositive()) {
        gains = gains.plus(changes[j]);
      } else {
        losses = losses.plus(changes[j].abs());
      }
    }

    const avgGain = gains.dividedBy(period);
    const avgLoss = losses.dividedBy(period);

    if (avgLoss.isZero()) {
      result.push(100);
    } else {
      const rs = avgGain.dividedBy(avgLoss);
      const rsi = new Decimal(100).minus(new Decimal(100).dividedBy(rs.plus(1)));
      result.push(rsi.toNumber());
    }
  }

  return result;
};

/**
 * Calculate Bollinger Bands
 */
export const calculateBollingerBands = (
  prices: (number | string | Decimal)[],
  period: number = 20,
  standardDeviations: number = 2
): { upper: number[]; middle: number[]; lower: number[] } => {
  const sma = calculateSMA(prices, period);
  const upper: number[] = [];
  const middle: number[] = [];
  const lower: number[] = [];

  for (let i = 0; i < sma.length; i++) {
    const dataIndex = i + period - 1;
    const periodPrices = prices.slice(dataIndex - period + 1, dataIndex + 1);

    // Calculate standard deviation
    const mean = new Decimal(sma[i]);
    let variance = new Decimal(0);

    for (const price of periodPrices) {
      const diff = new Decimal(price).minus(mean);
      variance = variance.plus(diff.pow(2));
    }

    const stdDev = variance.dividedBy(period).sqrt();
    const multiplier = new Decimal(standardDeviations);

    middle.push(mean.toNumber());
    upper.push(mean.plus(stdDev.times(multiplier)).toNumber());
    lower.push(mean.minus(stdDev.times(multiplier)).toNumber());
  }

  return { upper, middle, lower };
};

/**
 * Calculate portfolio allocation percentages
 */
export const calculateAllocation = (
  holdings: { symbol: string; value: number }[]
): { symbol: string; allocation: number }[] => {
  const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);

  if (totalValue === 0) return holdings.map(h => ({ symbol: h.symbol, allocation: 0 }));

  return holdings.map(holding => ({
    symbol: holding.symbol,
    allocation: (holding.value / totalValue) * 100,
  }));
};

/**
 * Calculate portfolio Sharpe ratio
 */
export const calculateSharpeRatio = (
  returns: number[],
  riskFreeRate: number = 0.02 // 2% annual risk-free rate
): number => {
  if (returns.length === 0) return 0;

  const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
  const excessReturn = avgReturn - riskFreeRate / 252; // Daily risk-free rate

  // Calculate standard deviation
  const variance = returns.reduce((sum, ret) => {
    const diff = ret - avgReturn;
    return sum + (diff * diff);
  }, 0) / returns.length;

  const stdDev = Math.sqrt(variance);

  return stdDev === 0 ? 0 : excessReturn / stdDev;
};

/**
 * Calculate maximum drawdown
 */
export const calculateMaxDrawdown = (values: number[]): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  peak: number;
  trough: number;
} => {
  if (values.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0, peak: 0, trough: 0 };
  }

  let peak = values[0];
  let maxDrawdown = 0;
  let maxDrawdownPercent = 0;
  let peakValue = values[0];
  let troughValue = values[0];

  for (const value of values) {
    if (value > peak) {
      peak = value;
    }

    const drawdown = peak - value;
    const drawdownPercent = peak === 0 ? 0 : (drawdown / peak) * 100;

    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownPercent = drawdownPercent;
      peakValue = peak;
      troughValue = value;
    }
  }

  return {
    maxDrawdown,
    maxDrawdownPercent,
    peak: peakValue,
    trough: troughValue,
  };
};

/**
 * Calculate Value at Risk (VaR) using historical method
 */
export const calculateVaR = (
  returns: number[],
  confidenceLevel: number = 0.95
): number => {
  if (returns.length === 0) return 0;

  const sortedReturns = [...returns].sort((a, b) => a - b);
  const index = Math.floor((1 - confidenceLevel) * sortedReturns.length);

  return sortedReturns[index] || 0;
};

/**
 * Calculate position size based on risk management
 */
export const calculatePositionSize = (
  accountBalance: number,
  riskPercentage: number,
  entryPrice: number,
  stopLossPrice: number
): number => {
  if (entryPrice === stopLossPrice) return 0;

  const riskAmount = accountBalance * (riskPercentage / 100);
  const riskPerShare = Math.abs(entryPrice - stopLossPrice);

  return riskAmount / riskPerShare;
};

/**
 * Calculate profit/loss for a position
 */
export const calculatePnL = (
  quantity: number,
  entryPrice: number,
  currentPrice: number,
  side: 'long' | 'short'
): { unrealizedPnL: number; unrealizedPnLPercent: number } => {
  let unrealizedPnL: number;

  if (side === 'long') {
    unrealizedPnL = quantity * (currentPrice - entryPrice);
  } else {
    unrealizedPnL = quantity * (entryPrice - currentPrice);
  }

  const unrealizedPnLPercent = entryPrice === 0 ? 0 : (unrealizedPnL / (quantity * entryPrice)) * 100;

  return { unrealizedPnL, unrealizedPnLPercent };
};

/**
 * Calculate compound interest
 */
export const calculateCompoundInterest = (
  principal: number,
  rate: number,
  time: number,
  compoundingFrequency: number = 1
): number => {
  const amount = principal * Math.pow(1 + rate / compoundingFrequency, compoundingFrequency * time);
  return amount - principal;
};

/**
 * Calculate correlation coefficient between two price series
 */
export const calculateCorrelation = (
  series1: number[],
  series2: number[]
): number => {
  if (series1.length !== series2.length || series1.length === 0) return 0;

  const n = series1.length;
  const mean1 = series1.reduce((sum, val) => sum + val, 0) / n;
  const mean2 = series2.reduce((sum, val) => sum + val, 0) / n;

  let numerator = 0;
  let sum1Sq = 0;
  let sum2Sq = 0;

  for (let i = 0; i < n; i++) {
    const diff1 = series1[i] - mean1;
    const diff2 = series2[i] - mean2;

    numerator += diff1 * diff2;
    sum1Sq += diff1 * diff1;
    sum2Sq += diff2 * diff2;
  }

  const denominator = Math.sqrt(sum1Sq * sum2Sq);

  return denominator === 0 ? 0 : numerator / denominator;
};

/**
 * Calculate beta coefficient (systematic risk)
 */
export const calculateBeta = (
  assetReturns: number[],
  marketReturns: number[]
): number => {
  if (assetReturns.length !== marketReturns.length || assetReturns.length === 0) return 1;

  const correlation = calculateCorrelation(assetReturns, marketReturns);

  // Calculate standard deviations
  const assetMean = assetReturns.reduce((sum, val) => sum + val, 0) / assetReturns.length;
  const marketMean = marketReturns.reduce((sum, val) => sum + val, 0) / marketReturns.length;

  const assetVariance = assetReturns.reduce((sum, val) => sum + Math.pow(val - assetMean, 2), 0) / assetReturns.length;
  const marketVariance = marketReturns.reduce((sum, val) => sum + Math.pow(val - marketMean, 2), 0) / marketReturns.length;

  const assetStdDev = Math.sqrt(assetVariance);
  const marketStdDev = Math.sqrt(marketVariance);

  return marketStdDev === 0 ? 1 : correlation * (assetStdDev / marketStdDev);
};