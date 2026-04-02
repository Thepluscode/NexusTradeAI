/**
 * Multi-timeframe trend confluence.
 * Checks 15m, 1h, 4h trend alignment with trade direction.
 * Score = fraction of higher timeframes aligned.
 */
function trendDirection(klines) {
  if (!klines || klines.length < 21) return 'neutral';
  const closes = klines.map(k => k.close);
  const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
  const sma20prev = closes.slice(-25, -5);
  const sma20Earlier = sma20prev.length >= 20
    ? sma20prev.slice(-20).reduce((s, v) => s + v, 0) / 20
    : sma20;
  const slope = sma20 - sma20Earlier;
  const price = closes[closes.length - 1];
  if (slope > 0 && price > sma20) return 'bullish';
  if (slope < 0 && price < sma20) return 'bearish';
  return 'neutral';
}

function computeMTFScore(bars1m, bars15m, bars1h, bars4h, direction) {
  const trends = {
    m15: trendDirection(bars15m),
    h1: trendDirection(bars1h),
    h4: trendDirection(bars4h)
  };

  const target = direction === 'long' ? 'bullish' : 'bearish';
  const aligned = [trends.m15, trends.h1, trends.h4].filter(t => t === target).length;
  const total = 3;
  const alignment = aligned / total;

  // Penalize conflicting (not just neutral)
  const conflicting = [trends.m15, trends.h1, trends.h4]
    .filter(t => t !== 'neutral' && t !== target).length;
  const score = conflicting > 0
    ? Math.max(0, alignment - conflicting * 0.15)
    : alignment;

  if (!bars15m?.length && !bars1h?.length && !bars4h?.length) {
    return { score: 0.5, trends: { m15: 'neutral', h1: 'neutral', h4: 'neutral' }, alignment: 0 };
  }

  return { score: Math.max(0, Math.min(1, score)), trends, alignment };
}

module.exports = { computeMTFScore, trendDirection };
