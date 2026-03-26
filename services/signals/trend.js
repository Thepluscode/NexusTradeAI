/**
 * H1 trend alignment: SMA20 slope + price position.
 * Extracted from unified-forex-bot.js lines 1845-1866.
 * Direction-aware: returns 1.0 if trend aligns with trade direction.
 */
function computeTrend(klines, direction = 'long') {
  if (!klines || klines.length < 21) {
    return { score: 0.5, raw: { direction: 'neutral', sma20: 0, slope: 0 }, meta: {} };
  }

  // SMA20 from last 20 closes
  const closes = klines.map(k => k.close);
  const recent20 = closes.slice(-20);
  const sma20 = recent20.reduce((s, v) => s + v, 0) / 20;

  // SMA20 from 5 bars ago
  const prev20 = closes.slice(-25, -5);
  const sma20Prev = prev20.length >= 20
    ? prev20.slice(-20).reduce((s, v) => s + v, 0) / 20
    : sma20;

  const slope = sma20 - sma20Prev;
  const currentPrice = closes[closes.length - 1];

  let trendDir = 'neutral';
  if (slope > 0 && currentPrice > sma20) trendDir = 'bullish';
  else if (slope < 0 && currentPrice < sma20) trendDir = 'bearish';

  let score = 0.5;
  if (trendDir === 'bullish' && direction === 'long') score = 1.0;
  else if (trendDir === 'bearish' && direction === 'short') score = 1.0;
  else if (trendDir === 'bullish' && direction === 'short') score = 0.0;
  else if (trendDir === 'bearish' && direction === 'long') score = 0.0;

  return {
    score,
    raw: { direction: trendDir, sma20, slope },
    meta: {}
  };
}

module.exports = { computeTrend };
