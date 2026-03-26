/**
 * ATR-based market regime detection.
 * Classifies markets as: trending (medium vol), ranging (low vol), volatile (high vol).
 * Extracted from unified-crypto-bot.js lines 1258-1299.
 */

const REGIME_MAP = { low: 'ranging', medium: 'trending', high: 'volatile' };
const REGIME_REVERSE = { ranging: 'low', trending: 'medium', volatile: 'high' };

function computeATR(klines, period = 14) {
  if (!klines || klines.length < 2) return 0;

  const trs = [];
  for (let i = 1; i < klines.length; i++) {
    const high = klines[i].high;
    const low = klines[i].low;
    const prevClose = klines[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trs.push(tr);
  }

  const recent = trs.slice(-period);
  return recent.reduce((s, v) => s + v, 0) / recent.length;
}

function detectRegime(klines, config = {}) {
  const { lowThreshold = 0.5, highThreshold = 1.5, atrPeriod = 14 } = config;

  if (!klines || klines.length < atrPeriod + 1) {
    return { regime: 'trending', atr: 0, atrPercent: 0, raw: 'medium' };
  }

  const atr = computeATR(klines, atrPeriod);
  const price = klines[klines.length - 1].close;
  const atrPercent = price > 0 ? (atr / price) * 100 : 0;

  let raw, regime;
  if (atrPercent < lowThreshold) {
    raw = 'low';
    regime = 'ranging';
  } else if (atrPercent > highThreshold) {
    raw = 'high';
    regime = 'volatile';
  } else {
    raw = 'medium';
    regime = 'trending';
  }

  return { regime, atr, atrPercent, raw };
}

module.exports = { detectRegime, computeATR, REGIME_MAP, REGIME_REVERSE };
