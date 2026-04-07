/**
 * Auto-Optimizer — walk-forward parameter adjustment based on recent performance.
 *
 * Adjusts thresholds within safe bounds every N hours:
 *   - Committee confidence threshold (0.45 - 0.60)
 *   - Minimum R:R ratio (1.5 - 2.5)
 *   - Position size multiplier (0.5 - 1.5)
 *   - ATR stop multiplier (1.0 - 2.0)
 *
 * Uses simple walk-forward: evaluate last 50 trades, find parameter set that
 * maximizes profit factor while maintaining >40% win rate.
 *
 * Pure functions — no side effects, no API calls, no file I/O.
 */

// Parameter bounds — NEVER optimize outside these safety limits
// [v20.1] committeeThreshold lowered: absent signals now score 0.5 (neutral) not 0.1 (penalty),
// so the effective score range shifted up. Old 0.50 threshold blocked nearly everything.
const PARAM_BOUNDS = {
  committeeThreshold: { min: 0.35, max: 0.55, step: 0.025, default: 0.40 },
  minRewardRisk:      { min: 1.5,  max: 2.5,  step: 0.25,  default: 2.0 },
  sizeMultiplier:     { min: 0.5,  max: 1.5,  step: 0.25,  default: 1.0 },
  atrStopMultiplier:  { min: 1.0,  max: 2.0,  step: 0.25,  default: 1.5 },
};

/**
 * Evaluate a parameter set against historical trades.
 * Returns { profitFactor, winRate, tradeCount, avgRR }
 */
function evaluateParams(trades, params) {
  if (!trades || trades.length < 20) {
    return { profitFactor: 0, winRate: 0, tradeCount: 0, avgRR: 0 };
  }

  // Filter trades that would have passed the given thresholds
  const qualifying = trades.filter(t => {
    const conf = t.committeeConfidence || t.confidence || 0;
    const rr = t.rewardRisk || t.rr || 0;
    return conf >= params.committeeThreshold && rr >= params.minRewardRisk;
  });

  if (qualifying.length < 10) {
    return { profitFactor: 0, winRate: 0, tradeCount: qualifying.length, avgRR: 0 };
  }

  const winners = qualifying.filter(t => (t.pnl || t.profit || 0) > 0);
  const losers = qualifying.filter(t => (t.pnl || t.profit || 0) <= 0);

  const totalWin = winners.reduce((s, t) => s + Math.abs(t.pnl || t.profit || 0), 0);
  const totalLoss = losers.reduce((s, t) => s + Math.abs(t.pnl || t.profit || 0), 0);

  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 10 : 0;
  const winRate = qualifying.length > 0 ? winners.length / qualifying.length : 0;
  const avgRR = qualifying.length > 0
    ? qualifying.reduce((s, t) => s + (t.rewardRisk || t.rr || 0), 0) / qualifying.length
    : 0;

  return { profitFactor, winRate, tradeCount: qualifying.length, avgRR };
}

/**
 * Walk-forward optimization: find best parameter set from recent trades.
 * Uses grid search within PARAM_BOUNDS.
 *
 * @param {Array} trades - Recent closed trades with pnl, confidence, rr fields
 * @param {number} minTrades - Minimum trades required (default: 30)
 * @returns {{ params, metrics, improved, reason }}
 */
function optimize(trades, minTrades = 30) {
  const defaults = Object.fromEntries(
    Object.entries(PARAM_BOUNDS).map(([k, v]) => [k, v.default])
  );

  if (!trades || trades.length < minTrades) {
    return {
      params: defaults,
      metrics: evaluateParams(trades, defaults),
      improved: false,
      reason: `Insufficient trades (${trades?.length || 0}/${minTrades})`,
    };
  }

  // Split: first 60% for training, last 40% for validation
  const splitIdx = Math.floor(trades.length * 0.6);
  const trainTrades = trades.slice(0, splitIdx);
  const validTrades = trades.slice(splitIdx);

  if (trainTrades.length < 15 || validTrades.length < 10) {
    return { params: defaults, metrics: evaluateParams(trades, defaults), improved: false, reason: 'Not enough data for train/valid split' };
  }

  let bestParams = { ...defaults };
  let bestScore = -Infinity;

  // Grid search on training set
  const { committeeThreshold: ct, minRewardRisk: rr } = PARAM_BOUNDS;

  for (let thresh = ct.min; thresh <= ct.max; thresh += ct.step) {
    for (let rrVal = rr.min; rrVal <= rr.max; rrVal += rr.step) {
      const candidate = { ...defaults, committeeThreshold: thresh, minRewardRisk: rrVal };
      const result = evaluateParams(trainTrades, candidate);

      // Score: profit factor * sqrt(tradeCount) * winRate bonus
      // Rewards both edge and sample size
      if (result.tradeCount < 10 || result.winRate < 0.40) continue;
      const score = result.profitFactor * Math.sqrt(result.tradeCount) * (result.winRate > 0.5 ? 1.2 : 1.0);

      if (score > bestScore) {
        bestScore = score;
        bestParams = candidate;
      }
    }
  }

  // Validate on held-out set
  const trainMetrics = evaluateParams(trainTrades, bestParams);
  const validMetrics = evaluateParams(validTrades, bestParams);
  const defaultMetrics = evaluateParams(trades, defaults);

  // Walk-forward efficiency: valid PF / train PF
  const wfe = trainMetrics.profitFactor > 0
    ? validMetrics.profitFactor / trainMetrics.profitFactor
    : 0;

  // Only adopt if: WFE > 50% AND validation profit factor > 1.0 AND better than defaults
  const improved = wfe > 0.5 && validMetrics.profitFactor > 1.0 &&
    validMetrics.profitFactor > defaultMetrics.profitFactor * 0.9;

  return {
    params: improved ? bestParams : defaults,
    metrics: improved ? validMetrics : defaultMetrics,
    trainMetrics,
    validMetrics,
    wfe: Math.round(wfe * 100) / 100,
    improved,
    reason: improved
      ? `WFE ${(wfe * 100).toFixed(0)}%, valid PF ${validMetrics.profitFactor.toFixed(2)}`
      : `WFE ${(wfe * 100).toFixed(0)}% — keeping defaults (valid PF ${validMetrics.profitFactor.toFixed(2)})`,
  };
}

/**
 * Compute strategy-level performance for regime-based rotation.
 * Returns performance metrics per strategy.
 */
function evaluateStrategies(trades) {
  if (!trades || trades.length === 0) return {};

  const byStrategy = {};
  for (const t of trades) {
    const strat = t.strategy || 'unknown';
    if (!byStrategy[strat]) byStrategy[strat] = [];
    byStrategy[strat].push(t);
  }

  const results = {};
  for (const [strat, stratTrades] of Object.entries(byStrategy)) {
    const winners = stratTrades.filter(t => (t.pnl || t.profit || 0) > 0);
    const losers = stratTrades.filter(t => (t.pnl || t.profit || 0) <= 0);
    const totalWin = winners.reduce((s, t) => s + Math.abs(t.pnl || t.profit || 0), 0);
    const totalLoss = losers.reduce((s, t) => s + Math.abs(t.pnl || t.profit || 0), 0);

    results[strat] = {
      trades: stratTrades.length,
      winRate: stratTrades.length > 0 ? winners.length / stratTrades.length : 0,
      profitFactor: totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? 10 : 0,
      totalPnl: totalWin - totalLoss,
      // Strategy is "active" if it has positive edge with minimum sample
      active: stratTrades.length >= 10 && (totalLoss > 0 ? totalWin / totalLoss > 1.0 : totalWin > 0),
      // Confidence: higher with more trades and better profit factor
      confidence: Math.min(stratTrades.length / 50, 1.0),
    };
  }

  return results;
}

module.exports = {
  PARAM_BOUNDS,
  evaluateParams,
  optimize,
  evaluateStrategies,
};
