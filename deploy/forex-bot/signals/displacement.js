/**
 * Displacement candle detection: institutional commitment indicator.
 * A displacement candle has body > 70% of range AND range > 1.5x ATR.
 * Extracted from unified-crypto-bot.js lines 1001-1018.
 *
 * [v24.0] Graded scoring: returns a 0-1 strength score based on displacement
 * magnitude rather than a binary 0/1. This preserves signal information —
 * a 3x ATR displacement is stronger than a 1.6x ATR displacement.
 *
 * Scoring formula:
 *   strength = clamp((maxMagnitude - 1.5) / 2.5, 0, 1)
 *   At 1.5x ATR (threshold): strength = 0.0
 *   At 2.75x ATR (midpoint): strength = 0.5
 *   At 4.0x ATR (strong):    strength = 1.0
 *
 * @param {Array} klines - OHLCV bars
 * @param {number} atr - Current ATR value
 * @param {number} lookback - How many recent candles to check (default 3)
 * @param {object} config - { neutralDefault: 0.3 } score when not detected
 */
function computeDisplacement(klines, atr, lookback = 3, config = {}) {
  const neutralDefault = config.neutralDefault ?? 0.3;

  if (!klines || klines.length === 0 || !atr) {
    return { score: neutralDefault, raw: { detected: false, magnitude: 0, strength: 0 }, meta: {} };
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

  // Graded strength: 0 at threshold (1.5x ATR), 1.0 at 4.0x ATR
  // Fully proportional — no artificial floor. A barely-qualifying displacement
  // should score near 0, not 0.4. The committee scorer's "present" flag already
  // handles the binary "displacement exists" signal separately.
  const strength = detected ? Math.min(Math.max((maxMagnitude - 1.5) / 2.5, 0), 1.0) : 0;
  const score = detected ? strength : neutralDefault;

  return {
    score,
    raw: { detected, magnitude: maxMagnitude, strength },
    meta: {}
  };
}

module.exports = { computeDisplacement };
