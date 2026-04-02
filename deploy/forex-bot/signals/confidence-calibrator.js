/**
 * Platt scaling: maps raw committee score to win probability.
 * P(win | score) = 1 / (1 + exp(A * score + B))
 * Extracted from unified-crypto-bot.js lines 227-281.
 */

function calibrateConfidence(rawConfidence, plattParams) {
  if (!plattParams || !plattParams.calibrated) return rawConfidence;
  const { A, B } = plattParams;
  return 1 / (1 + Math.exp(A * rawConfidence + B));
}

function fitPlattScaling(evaluations, minTrades = 20) {
  if (!evaluations || evaluations.length < minTrades) return null;

  let A = -1.0, B = 0.0;
  const lr = 0.01;
  const iterations = 200;

  for (let iter = 0; iter < iterations; iter++) {
    let gradA = 0, gradB = 0;

    for (const ev of evaluations) {
      const score = ev.signals?.committeeConfidence ?? ev.committeeScore ?? 0.5;
      const y = ev.pnl > 0 ? 1 : 0;
      const p = 1 / (1 + Math.exp(A * score + B));
      const error = p - y;
      gradA += error * score;
      gradB += error;
    }

    A -= lr * gradA / evaluations.length;
    B -= lr * gradB / evaluations.length;
  }

  return { A, B, calibrated: true, fittedAt: Date.now(), n: evaluations.length };
}

module.exports = { calibrateConfidence, fitPlattScaling };
