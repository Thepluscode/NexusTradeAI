/**
 * Backward-compatible wrappers around shared signal modules.
 * These accept raw exchange-specific bar formats and return the
 * same interface as the old inline functions, so call sites in
 * bot.js files need zero changes.
 *
 * Usage in bots:
 *   const { calculateOrderFlowImbalance } = require('./signals/compat');
 *   const imbalance = calculateOrderFlowImbalance(klines, 20, 'crypto');
 */
const { normalizeCryptoBars, normalizeForexBars, normalizeStockBars } = require('./normalizers');
const { computeOrderFlow } = require('./order-flow');
const { computeDisplacement } = require('./displacement');
const { computeVolumeProfile } = require('./volume-profile');
const { computeFVG } = require('./fvg-detector');

function normalize(klines, botType) {
  if (!klines || !klines.length) return [];
  if (botType === 'forex') return normalizeForexBars(klines);
  if (botType === 'stock') return normalizeStockBars(klines);
  return normalizeCryptoBars(klines); // default: crypto
}

/**
 * Drop-in replacement for inline calculateOrderFlowImbalance().
 * Returns: number (-1 to +1). 0 = balanced, >0 = buy pressure, <0 = sell pressure.
 *
 * Forex mode uses conviction-weighting (body/range ratio) since OANDA
 * has no volume data. This preserves the intentional behavioral difference.
 */
function calculateOrderFlowImbalance(klines, lookback = 20, botType = 'crypto') {
  if (!klines || !klines.length) return 0;

  if (botType === 'forex') {
    const recent = klines.slice(-lookback);
    let buyPressure = 0, sellPressure = 0;
    for (const candle of recent) {
      const o = parseFloat(candle.mid?.o ?? candle.open);
      const h = parseFloat(candle.mid?.h ?? candle.high);
      const l = parseFloat(candle.mid?.l ?? candle.low);
      const c = parseFloat(candle.mid?.c ?? candle.close);
      const body = Math.abs(c - o);
      const range = h - l;
      if (range === 0) continue;
      const conviction = body / range;
      if (c >= o) buyPressure += conviction;
      else sellPressure += conviction;
    }
    const total = buyPressure + sellPressure;
    return total === 0 ? 0 : (buyPressure - sellPressure) / total;
  }

  const bars = normalize(klines, botType);
  const result = computeOrderFlow(bars, lookback);
  return result.raw.imbalance; // -1 to +1
}

/**
 * Drop-in replacement for inline isDisplacementCandle().
 * Returns: boolean (true if institutional displacement detected).
 */
function isDisplacementCandle(klines, atr, lookback = 3, botType = 'crypto') {
  if (!klines || !klines.length || !atr) return false;
  const bars = normalize(klines, botType);
  const result = computeDisplacement(bars, atr, lookback);
  return result.raw.detected;
}

/**
 * Drop-in replacement for inline calculateVolumeProfile().
 * Returns: {vah, val, poc, lowVolumeNodes, bucketSize} or null (insufficient data).
 *
 * Call sites check `volumeProfile &&` before accessing properties,
 * so returning null on insufficient data preserves original branching.
 * lowVolumeNodes is computed here since the shared module doesn't include it.
 */
function calculateVolumeProfile(klines, numBuckets = 50, botType = 'crypto') {
  if (!klines || klines.length < 20) return null;
  const bars = normalize(klines, botType);
  if (bars.length < 20) return null;
  const result = computeVolumeProfile(bars, { numBuckets });
  const { vah, val, poc } = result.raw;
  if (vah === 0 && val === 0 && poc === 0) return null;

  // Compute lowVolumeNodes (buckets with volume < 30% of POC volume)
  // Replicates inline logic from unified-crypto-bot.js:1167-1179
  const allHighs = bars.map(b => b.high);
  const allLows = bars.map(b => b.low);
  const rangeHigh = Math.max(...allHighs);
  const rangeLow = Math.min(...allLows);
  const bucketSize = (rangeHigh - rangeLow) / numBuckets;
  if (bucketSize <= 0) return null;

  const volumeByBucket = new Array(numBuckets).fill(0);
  for (const bar of bars) {
    const lo = Math.max(0, Math.floor((bar.low - rangeLow) / bucketSize));
    const hi = Math.min(numBuckets - 1, Math.floor((bar.high - rangeLow) / bucketSize));
    const span = hi - lo + 1;
    for (let b = lo; b <= hi; b++) volumeByBucket[b] += bar.volume / span;
  }

  let pocBucketVol = 0;
  for (let i = 0; i < numBuckets; i++) {
    if (volumeByBucket[i] > pocBucketVol) pocBucketVol = volumeByBucket[i];
  }

  const lowVolumeNodes = [];
  for (let i = 0; i < numBuckets; i++) {
    if (volumeByBucket[i] < pocBucketVol * 0.30) {
      lowVolumeNodes.push({
        priceLow: rangeLow + i * bucketSize,
        priceHigh: rangeLow + (i + 1) * bucketSize,
        priceMid: rangeLow + (i + 0.5) * bucketSize,
        volumeRatio: pocBucketVol > 0 ? volumeByBucket[i] / pocBucketVol : 0
      });
    }
  }

  return { vah, val, poc, lowVolumeNodes, bucketSize };
}

/**
 * Drop-in replacement for inline detectFairValueGaps().
 * Returns: {bullish: [...], bearish: [...]} — arrays of gap objects.
 *
 * NOTE: This is for crypto/stock only. Forex has additional body-ratio
 * filter and "relaxed FVG" logic that must stay inline in the forex bot.
 */
function detectFairValueGaps(klines, lookback = 20, botType = 'crypto') {
  if (!klines || klines.length < 3) return { bullish: [], bearish: [] };
  const bars = normalize(klines, botType);
  const result = computeFVG(bars, { lookback });
  return {
    bullish: result.raw.gaps.filter(g => g.type === 'bullish'),
    bearish: result.raw.gaps.filter(g => g.type === 'bearish')
  };
}

module.exports = {
  calculateOrderFlowImbalance,
  isDisplacementCandle,
  calculateVolumeProfile,
  detectFairValueGaps,
  normalize
};
