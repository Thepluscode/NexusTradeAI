/**
 * Order flow imbalance: ratio of buy vs sell volume.
 * Up candles (close >= open) contribute to buy volume.
 * Down candles (close < open) contribute to sell volume.
 * Returns normalized score 0-1 (0.5 = balanced).
 * Extracted from unified-crypto-bot.js lines 979-996.
 */
function computeOrderFlow(klines, lookback = 20) {
  if (!klines || klines.length === 0) {
    return { score: 0.5, raw: { buyVolume: 0, sellVolume: 0, imbalance: 0 }, meta: {} };
  }

  const recent = klines.slice(-lookback);
  let buyVolume = 0;
  let sellVolume = 0;

  for (const bar of recent) {
    if (bar.close >= bar.open) {
      buyVolume += bar.volume;
    } else {
      sellVolume += bar.volume;
    }
  }

  const total = buyVolume + sellVolume;
  if (total === 0) {
    return { score: 0.5, raw: { buyVolume: 0, sellVolume: 0, imbalance: 0 }, meta: {} };
  }

  const imbalance = (buyVolume - sellVolume) / total; // -1 to +1
  const score = (imbalance + 1) / 2; // normalize to 0-1

  return {
    score,
    raw: { buyVolume, sellVolume, imbalance },
    meta: {}
  };
}

module.exports = { computeOrderFlow };
