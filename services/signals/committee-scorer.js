// NOTE: This shared module is currently used only by api-handlers.js for diagnostics.
// Live trading uses inline committee scorers in each bot file:
//   - Stock: computeCommitteeScore() in unified-trading-bot.js
//   - Forex: computeForexCommitteeScore() in unified-forex-bot.js
//   - Crypto: computeCryptoCommitteeScore() in unified-crypto-bot.js
// TODO: Consolidate all 3 into this shared module for single source of truth.
// All bots now use 0.50 committee threshold (raised from 0.45).

/**
 * Registry-based committee scorer.
 * Accepts per-bot component configurations.
 * Extracted from unified-crypto-bot.js lines 1171-1232.
 */

const BOT_COMPONENTS = {
  stock: {
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence'],
    threshold: 0.50, // raised from 0.45 — matches live inline scorer in unified-trading-bot.js
    // Neutral defaults aligned with stock bot inline scorer (unified-trading-bot.js ~line 2059-2065):
    //   displacement/fvg absent → 0.1 (penalising: binary signals rarely fire)
    //   orderFlow/volumeProfile absent → 0.3 (penalising but less severe)
    neutralDefaults: { displacement: 0.1, fvg: 0.1, orderFlow: 0.3, volumeProfile: 0.3, mtfConfluence: 0.5 },
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
