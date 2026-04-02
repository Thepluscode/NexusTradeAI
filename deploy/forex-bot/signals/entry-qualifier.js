/**
 * Final entry qualification gate.
 * Checks threshold, positive EV, and minimum component count.
 */
function qualifyEntry(committee, config = {}, costs = {}) {
  const {
    threshold = 0.45,
    avgWinPct = 2.0,
    avgLossPct = 1.5,
    minPositiveComponents = 2
  } = config;

  const { costPct = 0 } = costs;
  const confidence = committee.calibrated ?? committee.confidence;

  // Gate 1: Threshold
  if (confidence < threshold) {
    return { qualified: false, reason: `Below threshold (${confidence.toFixed(3)} < ${threshold})`, ev: 0, allocationFactor: 0 };
  }

  // Gate 2: Positive EV after costs
  const ev = (confidence * avgWinPct) - ((1 - confidence) * avgLossPct) - costPct;
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

  // Allocation factor: scale position size by confidence
  const allocationFactor = Math.max(0.1, Math.min(1.5, confidence * 2));

  return { qualified: true, reason: 'passed', ev, allocationFactor };
}

module.exports = { qualifyEntry };
