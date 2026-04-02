/**
 * Momentum score: absolute price change percentage normalized to 0-1.
 * Divides by 5 so a 5% move = 1.0 (max score).
 * Extracted from unified-crypto-bot.js lines 1175-1178.
 */
function computeMomentum(signal) {
  const momentumPct = signal.momentum || 0;
  const score = Math.min(Math.abs(momentumPct) / 5, 1.0);
  return {
    score,
    raw: { momentum: momentumPct },
    meta: {}
  };
}

module.exports = { computeMomentum };
