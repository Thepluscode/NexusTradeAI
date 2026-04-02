/**
 * Volume Profile: distributes volume across price buckets to find
 * VAH (Value Area High), VAL (Value Area Low), POC (Point of Control).
 * Score: 1.0 at VAL (discount) to 0.0 at VAH (premium) for longs.
 * Reversed for shorts (1.0 at VAH, 0.0 at VAL).
 * Extracted from unified-crypto-bot.js lines 1028-1078.
 */
function computeVolumeProfile(klines, config = {}) {
  const { currentPrice, direction = 'long', numBuckets = 50 } = config;

  if (!klines || klines.length < 5) {
    return { score: 0.5, raw: { vah: 0, val: 0, poc: 0 }, meta: {} };
  }

  const allHighs = klines.map(k => k.high);
  const allLows = klines.map(k => k.low);
  const rangeHigh = Math.max(...allHighs);
  const rangeLow = Math.min(...allLows);
  const bucketSize = (rangeHigh - rangeLow) / numBuckets;

  if (bucketSize === 0) {
    return { score: 0.5, raw: { vah: rangeHigh, val: rangeLow, poc: rangeLow }, meta: {} };
  }

  // Distribute volume across buckets
  const buckets = new Array(numBuckets).fill(0);
  for (const bar of klines) {
    const lo = Math.max(0, Math.floor((bar.low - rangeLow) / bucketSize));
    const hi = Math.min(numBuckets - 1, Math.floor((bar.high - rangeLow) / bucketSize));
    const span = hi - lo + 1;
    for (let b = lo; b <= hi; b++) {
      buckets[b] += bar.volume / span;
    }
  }

  // POC = bucket with highest volume
  let pocBucket = 0;
  let maxVol = 0;
  for (let i = 0; i < numBuckets; i++) {
    if (buckets[i] > maxVol) { maxVol = buckets[i]; pocBucket = i; }
  }

  // Value area = 70% of total volume, expanding from POC
  const totalVol = buckets.reduce((s, v) => s + v, 0);
  const targetVol = totalVol * 0.70;
  let vaLow = pocBucket, vaHigh = pocBucket;
  let vaVol = buckets[pocBucket];

  while (vaVol < targetVol && (vaLow > 0 || vaHigh < numBuckets - 1)) {
    const downVol = vaLow > 0 ? buckets[vaLow - 1] : 0;
    const upVol = vaHigh < numBuckets - 1 ? buckets[vaHigh + 1] : 0;
    if (downVol >= upVol && vaLow > 0) { vaLow--; vaVol += buckets[vaLow]; }
    else if (vaHigh < numBuckets - 1) { vaHigh++; vaVol += buckets[vaHigh]; }
    else { vaLow--; vaVol += buckets[vaLow]; }
  }

  const poc = rangeLow + (pocBucket + 0.5) * bucketSize;
  const val = rangeLow + vaLow * bucketSize;
  const vah = rangeLow + (vaHigh + 1) * bucketSize;

  // Score based on current price position within value area
  let score = 0.5;
  if (currentPrice !== undefined && vah !== val) {
    const position = (currentPrice - val) / (vah - val);
    score = Math.max(0, Math.min(1, 1.0 - position)); // 1.0 at VAL, 0.0 at VAH
    if (direction === 'short') {
      score = 1.0 - score; // Reversed for shorts
    }
  }

  return {
    score,
    raw: { vah, val, poc },
    meta: { numBuckets, totalVolume: totalVol }
  };
}

module.exports = { computeVolumeProfile };
