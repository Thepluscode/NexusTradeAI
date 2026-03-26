const { computeATR } = require('./regime-detector');

const STOP_CONFIG = {
  trending:  { stopMult: 1.5, targetMult: 3.0, trailActivation: 1.0, trailDistance: 1.5 },
  ranging:   { stopMult: 1.0, targetMult: 2.0, trailActivation: 0.7, trailDistance: 1.0 },
  volatile:  { stopMult: 2.0, targetMult: 4.0, trailActivation: 1.5, trailDistance: 2.0 }
};

function computeStops(klines, regime, direction, entry, config = {}) {
  const atr = computeATR(klines, 14);
  const multipliers = config.stopConfig?.[regime] || STOP_CONFIG[regime] || STOP_CONFIG.trending;
  const sign = direction === 'long' ? 1 : -1;

  return {
    stopLoss: entry - sign * atr * multipliers.stopMult,
    profitTarget: entry + sign * atr * multipliers.targetMult,
    trailingActivation: atr * multipliers.trailActivation,
    trailingDistance: atr * multipliers.trailDistance,
    atr,
    stopMultiplier: multipliers.stopMult,
    targetMultiplier: multipliers.targetMult
  };
}

module.exports = { computeStops, STOP_CONFIG };
