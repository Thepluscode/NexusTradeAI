/**
 * Shared technical indicator calculations.
 *
 * All functions accept normalized price arrays (floats), not raw
 * exchange-specific formats. Callers must extract closes/prices
 * from their format before calling.
 *
 * Extracted from inline code duplicated across all 3 trading bots.
 */

/**
 * Simple Moving Average.
 * @param {number[]} data - Price array
 * @param {number} period
 * @returns {number|null}
 */
function calculateSMA(data, period) {
    if (!data || data.length < period) return null;
    return data.slice(-period).reduce((a, b) => a + b, 0) / period;
}

/**
 * Exponential Moving Average (standard multiplier = 2/(n+1)).
 * @param {number[]} data - Price array
 * @param {number} period
 * @returns {number|null}
 */
function calculateEMA(data, period) {
    if (!data || data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < data.length; i++) {
        ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
}

/**
 * Relative Strength Index using Wilder's smoothing.
 * @param {number[]} prices - Close price array
 * @param {number} period - RSI period (default 14)
 * @returns {number} RSI value (0-100), defaults to 50 on insufficient data
 */
function calculateRSI(prices, period = 14) {
    if (!prices || prices.length < period * 2) return 50;
    const changes = [];
    for (let i = 1; i < prices.length; i++) changes.push(prices[i] - prices[i - 1]);

    let avgGain = 0, avgLoss = 0;
    for (let i = 0; i < period; i++) {
        if (changes[i] > 0) avgGain += changes[i];
        else avgLoss += Math.abs(changes[i]);
    }
    avgGain /= period;
    avgLoss /= period;

    for (let i = period; i < changes.length; i++) {
        const gain = changes[i] > 0 ? changes[i] : 0;
        const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
        avgGain = (avgGain * (period - 1) + gain) / period;
        avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    if (avgLoss === 0) return 100;
    return 100 - (100 / (1 + avgGain / avgLoss));
}

/**
 * MACD (Moving Average Convergence Divergence).
 * @param {number[]} prices - Close price array
 * @param {number} fastPeriod - Fast EMA period (default 12)
 * @param {number} slowPeriod - Slow EMA period (default 26)
 * @param {number} signalPeriod - Signal EMA period (default 9)
 * @returns {{macd: number, signal: number, histogram: number, bullish: boolean, bearish: boolean}|null}
 */
function calculateMACD(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!prices || prices.length < slowPeriod + signalPeriod) return null;
    const macdLine = [];
    for (let i = slowPeriod - 1; i < prices.length; i++) {
        const slice = prices.slice(0, i + 1);
        const fast = calculateEMA(slice, fastPeriod);
        const slow = calculateEMA(slice, slowPeriod);
        if (fast !== null && slow !== null) macdLine.push(fast - slow);
    }
    if (macdLine.length < signalPeriod + 1) return null;
    const signalLine = calculateEMA(macdLine, signalPeriod);
    if (signalLine === null) return null;
    const histogram = macdLine[macdLine.length - 1] - signalLine;

    const prevSignalLine = calculateEMA(macdLine.slice(0, -1), signalPeriod);
    const prevHistogram = prevSignalLine !== null
        ? macdLine[macdLine.length - 2] - prevSignalLine
        : histogram;

    return {
        macd: macdLine[macdLine.length - 1],
        signal: signalLine,
        histogram,
        prevHistogram,
        bullish: histogram > 0,
        bearish: histogram < 0,
    };
}

/**
 * Bollinger Bands with optional %B indicator.
 * @param {number[]} prices - Close price array
 * @param {number} period - SMA period (default 20)
 * @param {number} stdDevMultiplier - Standard deviation multiplier (default 2)
 * @returns {{upper: number, middle: number, lower: number, bandwidth: number, percentB: number}|null}
 */
function calculateBollingerBands(prices, period = 20, stdDevMultiplier = 2) {
    if (!prices || prices.length < period) return null;
    const slice = prices.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, p) => sum + Math.pow(p - sma, 2), 0) / period;
    const stdDev = Math.sqrt(variance);
    const upper = sma + stdDevMultiplier * stdDev;
    const lower = sma - stdDevMultiplier * stdDev;
    const bandWidth = sma > 0 ? (upper - lower) / sma : 0;
    const currentPrice = prices[prices.length - 1];
    const percentB = (upper - lower) > 0 ? (currentPrice - lower) / (upper - lower) : 0.5;
    return { upper, middle: sma, lower, bandwidth: bandWidth, percentB };
}

module.exports = {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
};
