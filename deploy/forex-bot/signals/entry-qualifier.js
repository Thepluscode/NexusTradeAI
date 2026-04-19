/**
 * Final entry qualification gate.
 *
 * Checks threshold, positive EV, minimum component count, and scales
 * position size by confidence × regime confidence × ML confidence.
 *
 * [v24.5] Phase 4: ML-informed allocation
 *   - regimeConfidence: 0-1 from regime detector (low = transitioning, reduce size)
 *   - mlWinProbability: 0-1 from /ml/score (if model trained, affects EV calc)
 */
function qualifyEntry(committee, config = {}, costs = {}) {
  const {
    threshold = 0.45,
    avgWinPct = 2.0,
    avgLossPct = 1.5,
    minPositiveComponents = 2,
    regimeConfidence = null,
    regimeSizeMultiplier = null,
    mlWinProbability = null,
  } = config;

  const { costPct = 0 } = costs;
  const confidence = committee.calibrated ?? committee.confidence;

  // Gate 1: Threshold
  if (confidence < threshold) {
    return { qualified: false, reason: `Below threshold (${confidence.toFixed(3)} < ${threshold})`, ev: 0, allocationFactor: 0 };
  }

  // Gate 2: Positive EV after costs
  // If ML win probability is available, blend it with committee confidence for EV calc
  const effectiveWinRate = mlWinProbability != null
    ? confidence * 0.6 + mlWinProbability * 0.4  // 60% committee, 40% ML
    : confidence;
  const ev = (effectiveWinRate * avgWinPct) - ((1 - effectiveWinRate) * avgLossPct) - costPct;
  if (ev <= 0) {
    return { qualified: false, reason: `Negative EV after costs (${ev.toFixed(3)})`, ev, allocationFactor: 0 };
  }

  // Gate 3: Minimum positive components (optional)
  if (committee.components) {
    const positive = Object.values(committee.components).filter(s => s > 0.5).length;
    if (positive < minPositiveComponents) {
      return { qualified: false, reason: `Too few positive components (${positive} < ${minPositiveComponents})`, ev, allocationFactor: 0 };
    }
  }

  // Allocation factor: scale position size by confidence × regime × ML
  let allocationFactor = Math.max(0.1, Math.min(1.5, confidence * 2));

  // Regime confidence scaling: low confidence = regime is transitioning = reduce size
  if (regimeConfidence != null && regimeConfidence < 0.6) {
    allocationFactor *= Math.max(0.5, regimeConfidence + 0.2);
  }

  // Regime size multiplier: direct from regime adjustments (e.g., 0.3 in HIGH_VOLATILITY)
  if (regimeSizeMultiplier != null) {
    allocationFactor *= regimeSizeMultiplier;
  }

  // ML confidence penalty: if ML says low win probability, reduce size (but never block)
  if (mlWinProbability != null && mlWinProbability < 0.35) {
    allocationFactor *= Math.max(0.5, mlWinProbability + 0.3);
  }

  // Floor: never allocate less than 10% of base size
  allocationFactor = Math.max(0.1, allocationFactor);

  return { qualified: true, reason: 'passed', ev, allocationFactor, effectiveWinRate: parseFloat(effectiveWinRate.toFixed(3)) };
}

module.exports = { qualifyEntry };
