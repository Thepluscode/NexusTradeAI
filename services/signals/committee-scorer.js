/**
 * Unified committee scorer — single source of truth for all 3 bots.
 *
 * [v23.0] Consolidation: replaces inline computeCommitteeScore() in stock,
 * computeForexCommitteeScore() in forex, and computeCryptoCommitteeScore() in crypto.
 *
 * Scoring approach (v22.0 "dynamic weight"):
 *   - Only count components that have actual data present.
 *   - Absent signals are SKIPPED (totalWeight shrinks), not penalized or inflated.
 *   - This prevents the root cause of bad scoring: high confidence from neutral defaults
 *     while missing all the signals that actually predict winners.
 *
 * API:
 *   computeCommitteeScore(rawSignal, 'stock', { weights, regime })  — new bot API
 *   computeCommitteeScore(normalizedSignals, BOT_COMPONENTS.stock)  — backward-compat diagnostic API
 */

// ── Per-bot component definitions ────────────────────────────────────────────

const BOT_COMPONENTS = {
  stock: {
    // [v24.5] 9 components: 6 core + sentiment + crossAsset + mlScore
    // mlScore is optional — absent when bridge is down or model not trained (skip, no penalty)
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'sentiment', 'crossAsset', 'mlScore'],
    threshold: 0.25,
    weights: { momentum: 0.20, orderFlow: 0.16, displacement: 0.12, volumeProfile: 0.12, fvg: 0.08, volumeRatio: 0.09, sentiment: 0.07, crossAsset: 0.06, mlScore: 0.10 }
  },
  forex: {
    components: ['trend', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'macd', 'sentiment', 'crossAsset', 'mlScore'],
    threshold: 0.50,
    weights: { trend: 0.20, orderFlow: 0.16, displacement: 0.12, volumeProfile: 0.12, fvg: 0.08, macd: 0.09, sentiment: 0.07, crossAsset: 0.06, mlScore: 0.10 }
  },
  crypto: {
    components: ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'sentiment', 'crossAsset', 'mlScore'],
    threshold: 0.50,
    weights: { momentum: 0.20, orderFlow: 0.16, displacement: 0.12, volumeProfile: 0.13, fvg: 0.10, volumeRatio: 0.05, sentiment: 0.07, crossAsset: 0.07, mlScore: 0.10 }
  }
};

// ── Per-bot signal extractors ────────────────────────────────────────────────
// Each extractor normalizes raw bot signal shapes into { component: { score, present } }

function extractVP(vpData, price) {
  if (!vpData) return { score: 0, present: false };
  const { vah, val } = vpData;
  const range = vah - val;
  if (range <= 0) return { score: 0, present: false };
  const positionInRange = (parseFloat(price) - val) / range;
  return { score: Math.max(0, 1.0 - positionInRange), present: true };
}

function extractDirectionalVP(signal) {
  if (!signal.volumeProfile) return { score: 0, present: false };
  const price = signal.entry || signal.price;
  const { vah, val } = signal.volumeProfile;
  const range = vah - val;
  if (range <= 0) return { score: 0, present: false };
  const positionInRange = (parseFloat(price) - val) / range;
  const isLong = signal.direction === 'long';
  const score = isLong
    ? Math.max(0, 1.0 - positionInRange)   // longs want to buy near VAL
    : Math.max(0, positionInRange);          // shorts want to sell near VAH
  return { score, present: true };
}

const EXTRACTORS = {
  stock: (signal) => ({
    momentum: {
      score: Math.min(Math.abs(parseFloat(signal.percentChange || 0)) / 10, 1.0),
      present: true
    },
    orderFlow: {
      score: signal.orderFlowImbalance !== undefined ? Math.max(0, signal.orderFlowImbalance) : 0,
      present: signal.orderFlowImbalance !== undefined
    },
    displacement: {
      // v24.1: graded — use displacementStrength (0-1) from computeDisplacement().raw.strength
      // Fallback for legacy callers that only pass hasDisplacement (boolean):
      // use 0.5 (midpoint) since we can't know the actual magnitude
      score: signal.displacementStrength != null
        ? signal.displacementStrength
        : (signal.hasDisplacement ? 0.5 : 0),
      present: !!(signal.hasDisplacement || signal.displacementStrength > 0)
    },
    volumeProfile: extractVP(signal.volumeProfile, signal.price),
    fvg: {
      // v24.0: graded — use fvgScore (0-1) from computeFVG().score if available
      score: signal.fvgScore != null
        ? signal.fvgScore
        : Math.min((signal.fvgCount || 0) / 3, 1.0),  // fallback: count-based grading
      present: (signal.fvgCount || 0) > 0 || (signal.fvgScore || 0) > 0
    },
    volumeRatio: {
      score: Math.min(parseFloat(signal.volumeRatio || 1) / 3, 1.0),
      present: true
    },
    // [v24.4] Sentiment — from RSS/news analysis via strategy bridge
    sentiment: {
      // sentimentScore ranges from -1 (very bearish) to +1 (very bullish)
      // Normalize to 0-1 for committee: -1 → 0.0, 0 → 0.5, +1 → 1.0
      score: signal.sentimentScore != null
        ? Math.max(0, Math.min(1, (signal.sentimentScore + 1) / 2))
        : 0,
      present: signal.sentimentScore != null
    },
    // [v24.4] Cross-asset — VIX + correlation + inter-market divergence
    crossAsset: {
      score: signal.crossAssetScore != null ? signal.crossAssetScore : 0,
      present: signal.crossAssetScore != null
    },
    // [v24.5] ML score — win probability from strategy bridge /ml/score
    // Optional: absent when bridge offline or model not yet trained (< 30 trades)
    mlScore: {
      score: signal.mlWinProbability != null ? signal.mlWinProbability : 0,
      present: signal.mlWinProbability != null && signal.mlConfidenceTier !== 'none'
    }
  }),

  forex: (signal) => {
    const isLong = signal.direction === 'long';
    return {
      trend: {
        score: (isLong && signal.h1Trend === 'up') || (!isLong && signal.h1Trend === 'down') ? 1.0 : 0.0,
        present: true
      },
      orderFlow: {
        score: signal.orderFlowImbalance !== undefined
          ? (isLong
            ? Math.max(0, Math.min(1, signal.orderFlowImbalance + 0.5))
            : Math.max(0, Math.min(1, -signal.orderFlowImbalance + 0.5)))
          : 0,
        present: signal.orderFlowImbalance !== undefined
      },
      displacement: {
        // v24.0: graded
        score: signal.displacementStrength != null
          ? signal.displacementStrength
          : (signal.hasDisplacement ? 0.7 : 0),
        present: !!(signal.hasDisplacement || signal.displacementStrength > 0)
      },
      volumeProfile: extractDirectionalVP(signal),
      fvg: {
        // v24.0: graded
        score: signal.fvgScore != null
          ? signal.fvgScore
          : Math.min((signal.fvgCount || 0) / 3, 1.0),
        present: (signal.fvgCount || 0) > 0 || (signal.fvgScore || 0) > 0
      },
      macd: {
        score: signal.macdHistogram != null
          ? (isLong
            ? Math.min(1, Math.max(0, signal.macdHistogram * 10000 + 0.5))
            : Math.min(1, Math.max(0, -signal.macdHistogram * 10000 + 0.5)))
          : 0,
        present: signal.macdHistogram != null
      },
      sentiment: {
        score: signal.sentimentScore != null
          ? Math.max(0, Math.min(1, (signal.sentimentScore + 1) / 2))
          : 0,
        present: signal.sentimentScore != null
      },
      crossAsset: {
        score: signal.crossAssetScore != null ? signal.crossAssetScore : 0,
        present: signal.crossAssetScore != null
      }
    };
  },

  crypto: (signal) => {
    const momAbs = Math.abs(parseFloat(signal.momentum || 0));
    const momCap = (signal.tier === 'tier3') ? 15 : 2;
    return {
      momentum: {
        score: Math.min(momAbs / momCap, 1.0),
        present: true
      },
      orderFlow: {
        score: signal.orderFlowImbalance !== undefined ? Math.max(0, signal.orderFlowImbalance) : 0,
        present: signal.orderFlowImbalance !== undefined
      },
      displacement: {
        // v24.0: graded
        score: signal.displacementStrength != null
          ? signal.displacementStrength
          : (signal.hasDisplacement ? 0.7 : 0),
        present: !!(signal.hasDisplacement || signal.displacementStrength > 0)
      },
      volumeProfile: extractVP(signal.volumeProfileData, signal.price),
      fvg: {
        // v24.0: graded
        score: signal.fvgScore != null
          ? signal.fvgScore
          : Math.min((signal.fvgCount || 0) / 3, 1.0),
        present: (signal.fvgCount || 0) > 0 || (signal.fvgScore || 0) > 0
      },
      volumeRatio: {
        score: Math.min(parseFloat(signal.volumeRatio || 1) / 3, 1.0),
        present: true
      },
      sentiment: {
        score: signal.sentimentScore != null
          ? Math.max(0, Math.min(1, (signal.sentimentScore + 1) / 2))
          : 0,
        present: signal.sentimentScore != null
      },
      crossAsset: {
        score: signal.crossAssetScore != null ? signal.crossAssetScore : 0,
        present: signal.crossAssetScore != null
      }
    };
  }
};

// ── Universal scorer ─────────────────────────────────────────────────────────

function computeCommitteeScore(rawSignal, botTypeOrConfig, options = {}) {
  let config, extracted;

  if (typeof botTypeOrConfig === 'string') {
    // New API: raw signal from bot + bot type string
    config = BOT_COMPONENTS[botTypeOrConfig];
    if (!config) throw new Error(`Unknown bot type: ${botTypeOrConfig}`);
    const extractor = EXTRACTORS[botTypeOrConfig];
    extracted = extractor(rawSignal);
  } else {
    // Backward-compat API: pre-normalized { component: { score } } + config object
    config = botTypeOrConfig;
    extracted = {};
    for (const name of (config.components || [])) {
      const sig = rawSignal[name];
      if (sig && typeof sig.score === 'number') {
        extracted[name] = { score: sig.score, present: true };
      } else {
        extracted[name] = { score: 0, present: false };
      }
    }
    // Backward compat: regime passed as 3rd positional arg
    if (typeof options === 'string') {
      options = { regime: options };
    }
  }

  // Weight priority: custom (from auto-learning) > regime-conditional > defaults
  let weights = options.weights || config.weights || {};
  if (options.regime && config.regimeWeights?.[options.regime]) {
    weights = config.regimeWeights[options.regime];
  }
  if (config._customWeights) {
    weights = config._customWeights;
  }

  let totalWeight = 0;
  let weightedSum = 0;
  let presentCount = 0;
  const componentScores = {};

  for (const name of config.components) {
    const weight = weights[name] ?? 0;
    const entry = extracted[name] || { score: 0, present: false };

    componentScores[name] = parseFloat(entry.score.toFixed(3));

    // v22.0 dynamic weight: only count components with actual data
    if (entry.present) {
      weightedSum += entry.score * weight;
      totalWeight += weight;
      presentCount++;
    }
  }

  const confidence = totalWeight > 0 ? weightedSum / totalWeight : 0;

  return {
    confidence: parseFloat(confidence.toFixed(3)),
    calibrated: parseFloat(confidence.toFixed(3)), // overridden by calibrator
    components: componentScores,
    presentCount,
    totalCount: config.components.length,
    regime: options.regime || 'unknown',
    ev: 0 // computed by entry-qualifier
  };
}

module.exports = { computeCommitteeScore, BOT_COMPONENTS, EXTRACTORS };
