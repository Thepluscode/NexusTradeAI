/**
 * Volume ratio: current volume / average volume, normalized to 0-1.
 * Divides by 3 so 3x average = 1.0 (max score).
 * Extracted from unified-crypto-bot.js lines 1214-1217.
 */
function computeVolumeRatio(klines, lookback = 20) {
  if (!klines || klines.length < 2) {
    return { score: 0.5, raw: { ratio: 1, avgVolume: 0, currentVolume: 0 }, meta: {} };
  }

  const history = klines.slice(-lookback - 1, -1);
  const current = klines[klines.length - 1];

  if (history.length === 0) {
    return { score: 0.5, raw: { ratio: 1, avgVolume: 0, currentVolume: current.volume }, meta: {} };
  }

  const avgVolume = history.reduce((s, k) => s + k.volume, 0) / history.length;
  if (avgVolume === 0) {
    return { score: 0.5, raw: { ratio: 0, avgVolume: 0, currentVolume: current.volume }, meta: {} };
  }

  const ratio = current.volume / avgVolume;
  const score = Math.min(ratio / 3, 1.0);

  return {
    score,
    raw: { ratio, avgVolume, currentVolume: current.volume },
    meta: {}
  };
}

module.exports = { computeVolumeRatio };
