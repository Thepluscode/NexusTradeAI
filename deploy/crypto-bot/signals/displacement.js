/**
 * Displacement candle detection: institutional commitment indicator.
 * A displacement candle has body > 70% of range AND range > 1.5x ATR.
 * Extracted from unified-crypto-bot.js lines 1001-1018.
 *
 * @param {Array} klines - OHLCV bars
 * @param {number} atr - Current ATR value
 * @param {number} lookback - How many recent candles to check (default 3)
 * @param {object} config - { neutralDefault: 0.3 } score when not detected
 */
function computeDisplacement(klines, atr, lookback = 3, config = {}) {
  const neutralDefault = config.neutralDefault ?? 0.3;

  if (!klines || klines.length === 0 || !atr) {
    return { score: neutralDefault, raw: { detected: false, magnitude: 0 }, meta: {} };
  }

  const recent = klines.slice(-lookback);
  let detected = false;
  let maxMagnitude = 0;

  for (const bar of recent) {
    const range = bar.high - bar.low;
    if (range === 0) continue;
    const body = Math.abs(bar.close - bar.open);
    const bodyRatio = body / range;
    const magnitude = range / atr;

    if (bodyRatio > 0.7 && range > 1.5 * atr) {
      detected = true;
      maxMagnitude = Math.max(maxMagnitude, magnitude);
    }
  }

  return {
    score: detected ? 1.0 : neutralDefault,
    raw: { detected, magnitude: maxMagnitude },
    meta: {}
  };
}

module.exports = { computeDisplacement };
