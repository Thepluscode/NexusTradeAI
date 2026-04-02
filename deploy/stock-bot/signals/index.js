const { computeMomentum } = require('./momentum');
const { computeOrderFlow } = require('./order-flow');
const { computeDisplacement } = require('./displacement');
const { computeVolumeProfile } = require('./volume-profile');
const { computeFVG } = require('./fvg-detector');
const { computeVolumeRatio } = require('./volume-ratio');
const { computeTrend } = require('./trend');
const { computeMACD } = require('./macd');
const { computeMTFScore } = require('./multi-timeframe');
const { detectRegime, computeATR, REGIME_MAP, REGIME_REVERSE } = require('./regime-detector');
const { computeCommitteeScore, BOT_COMPONENTS } = require('./committee-scorer');
const { calibrateConfidence, fitPlattScaling } = require('./confidence-calibrator');
const { qualifyEntry } = require('./entry-qualifier');
const { computeStops, STOP_CONFIG } = require('./stop-manager');
const { getRoundTripCost, COST_MODELS } = require('./cost-model');
const { evaluateExit, computeRatchetStop, detectMomentumFade, detectReversalCandle, computePortfolioHeat, computeEquityCurveMultiplier, computeCorrelationGuard } = require('./exit-manager');
const { checkScanHealth, checkErrorRate, checkTradingHealth, checkMemoryHealth, aggregateHealth } = require('./health-monitor');
const { normalizeCryptoBars, normalizeForexBars, normalizeStockBars } = require('./normalizers');

module.exports = {
  computeMomentum, computeOrderFlow, computeDisplacement,
  computeVolumeProfile, computeFVG, computeVolumeRatio,
  computeTrend, computeMACD, computeMTFScore,
  detectRegime, computeATR, REGIME_MAP, REGIME_REVERSE,
  computeCommitteeScore, BOT_COMPONENTS,
  calibrateConfidence, fitPlattScaling,
  qualifyEntry,
  computeStops, STOP_CONFIG,
  getRoundTripCost, COST_MODELS,
  evaluateExit, computeRatchetStop, detectMomentumFade, detectReversalCandle,
  computePortfolioHeat, computeEquityCurveMultiplier, computeCorrelationGuard,
  checkScanHealth, checkErrorRate, checkTradingHealth, checkMemoryHealth, aggregateHealth,
  normalizeCryptoBars, normalizeForexBars, normalizeStockBars,
};
