/**
 * MACD momentum scoring. Direction-aware.
 * Uses standard 12/26/9 MACD parameters.
 * Extracted from unified-forex-bot.js committee lines 1830-1842.
 */
function ema(values, period) {
  const k = 2 / (period + 1);
  let result = values[0];
  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }
  return result;
}

function computeMACD(klines, direction = 'long') {
  if (!klines || klines.length < 35) {
    return { score: 0.5, raw: { macdLine: 0, signalLine: 0, histogram: 0 }, meta: {} };
  }

  const closes = klines.map(k => k.close);

  // Build MACD line series for signal line calculation
  const macdSeries = [];
  for (let i = 25; i < closes.length; i++) {
    const ema12 = ema(closes.slice(0, i + 1).slice(-26), 12);
    const ema26 = ema(closes.slice(0, i + 1).slice(-26), 26);
    macdSeries.push(ema12 - ema26);
  }

  const macdLine = macdSeries[macdSeries.length - 1];
  const signalLine = macdSeries.length >= 9 ? ema(macdSeries.slice(-9), 9) : macdLine;
  const histogram = macdLine - signalLine;

  // Normalize histogram relative to price
  const price = closes[closes.length - 1];
  const normalizedHist = price > 0 ? (histogram / price) * 100 : 0;

  // Score: positive histogram = bullish momentum
  let score = 0.5 + Math.min(Math.max(normalizedHist * 5, -0.5), 0.5);

  // Direction-aware: flip for shorts
  if (direction === 'short') {
    score = 1.0 - score;
  }

  return {
    score: Math.max(0, Math.min(1, score)),
    raw: { macdLine, signalLine, histogram },
    meta: {}
  };
}

module.exports = { computeMACD };
