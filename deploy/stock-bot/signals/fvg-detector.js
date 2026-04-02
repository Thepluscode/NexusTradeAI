/**
 * Fair Value Gap (FVG) detection.
 * Bullish FVG: bar[i+2].low > bar[i].high (gap up not filled)
 * Bearish FVG: bar[i+2].high < bar[i].low (gap down not filled)
 * Extracted from unified-crypto-bot.js lines 1122-1163.
 */
function computeFVG(klines, config = {}) {
  const { neutralDefault = 0.3, lookback = 20 } = config;

  if (!klines || klines.length < 3) {
    return { score: neutralDefault, raw: { bullishCount: 0, bearishCount: 0, gaps: [] }, meta: {} };
  }

  const recent = klines.slice(-lookback);
  const gaps = [];
  let bullishCount = 0;
  let bearishCount = 0;

  for (let i = 0; i < recent.length - 2; i++) {
    const prev = recent[i];
    const curr = recent[i + 1];
    const next = recent[i + 2];

    // Bullish FVG: next candle's low > prev candle's high AND middle candle closed up
    if (next.low > prev.high && curr.close > curr.open) {
      bullishCount++;
      gaps.push({
        type: 'bullish',
        gapLow: prev.high,
        gapHigh: next.low,
        gapMid: (prev.high + next.low) / 2,
        gapSize: next.low - prev.high
      });
    }

    // Bearish FVG: next candle's high < prev candle's low AND middle candle closed down
    if (next.high < prev.low && curr.close < curr.open) {
      bearishCount++;
      gaps.push({
        type: 'bearish',
        gapLow: next.high,
        gapHigh: prev.low,
        gapMid: (next.high + prev.low) / 2,
        gapSize: prev.low - next.high
      });
    }
  }

  const totalCount = bullishCount + bearishCount;
  const score = totalCount > 0 ? 1.0 : neutralDefault;

  return {
    score,
    raw: { bullishCount, bearishCount, gaps },
    meta: { lookback }
  };
}

module.exports = { computeFVG };
