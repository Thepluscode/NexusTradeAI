/**
 * Registry-based committee scorer.
 * Accepts per-bot component configurations.
 * Extracted from unified-crypto-bot.js lines 1171-1232.
 */

const BOT_COMPONENTS = {
  stock: {
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'],
    neutralDefaults: { displacement: 0.3, fvg: 0.3, orderFlow: 0.5, mtfConfluence: 0.5 },
    weights: { momentum: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, volumeRatio: 0.15, mtfConfluence: 0.0 }
  },
  forex: {
    components: ['trend', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'macd', 'mtfConfluence'],
    neutralDefaults: { displacement: 0.0, fvg: 0.0, orderFlow: 0.5, mtfConfluence: 0.5 },
    weights: { trend: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, macd: 0.15, mtfConfluence: 0.0 }
  },
  crypto: {
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'],
    neutralDefaults: { displacement: 0.3, fvg: 0.3, orderFlow: 0.5, mtfConfluence: 0.5 },
    weights: { momentum: 0.25, orderFlow: 0.20, displacement: 0.15, volumeProfile: 0.15, fvg: 0.10, volumeRatio: 0.15, mtfConfluence: 0.0 }
  }
};

function computeCommitteeScore(signals, botConfig, regime = null) {
  const { components, neutralDefaults = {}, weights: defaultWeights = {} } = botConfig;

  // Weight priority: explicit custom > regime-conditional > defaults
  let weights = defaultWeights;
  if (regime && botConfig.regimeWeights?.[regime]) {
    weights = botConfig.regimeWeights[regime];
  }
  // Explicit custom weights (passed at call site) override everything
  if (botConfig._customWeights) {
    weights = botConfig._customWeights;
  }

  let totalWeight = 0;
  let weightedSum = 0;
  const componentScores = {};

  for (const name of components) {
    const weight = weights[name] ?? 0;
    const signal = signals[name];
    const score = signal?.score ?? neutralDefaults[name] ?? 0.5;

    componentScores[name] = score;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    confidence,
    calibrated: confidence, // overridden by calibrator if available
    components: componentScores,
    regime: regime || 'unknown',
    ev: 0 // computed by entry-qualifier
  };
}

module.exports = { computeCommitteeScore, BOT_COMPONENTS };
