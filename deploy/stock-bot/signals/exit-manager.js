/**
 * Exit Manager — decides when to tighten stops or exit profitable trades early.
 *
 * Solves the "winning trade becomes a loser" problem with three mechanisms:
 *   1. Profit ratchet: ATR-based stop tightening that starts at 1R profit
 *   2. Momentum fade: re-evaluates entry signals, exits when thesis breaks down
 *   3. Reversal candle: tightens stop on strong candle against position
 *
 * Pure functions — no side effects, no API calls.
 */
const { computeATR } = require('./regime-detector');

// ─── Profit Ratchet ──────────────────────────────────────────────────────────
// Move stop up in proportion to profit, measured in risk multiples (R).
// At 1R profit → breakeven. At 1.5R → lock 0.4R. At 2R → lock 0.8R. Etc.
// This is continuous, not discrete levels — smoother than the old 4-tier system.

function computeRatchetStop(entryPrice, currentStop, currentPrice, atr, direction) {
  if (!atr || atr <= 0) return currentStop;

  const isLong = direction === 'long';
  const unrealized = isLong
    ? (currentPrice - entryPrice)
    : (entryPrice - currentPrice);
  const rMultiple = unrealized / atr;

  // No ratchet below 1R profit — let the trade breathe
  if (rMultiple < 1.0) return currentStop;

  // Continuous lock function: lock = 0.3 * (R - 0.7)
  // At 1R: lock 0.09 ATR from entry (breakeven-ish)
  // At 1.5R: lock 0.24 ATR
  // At 2R: lock 0.39 ATR
  // At 3R: lock 0.69 ATR
  // This locks ~20-25% of gains, growing as R increases
  const lockATR = Math.min(rMultiple - 0.5, rMultiple * 0.65) * atr;

  const ratchetStop = isLong
    ? entryPrice + lockATR
    : entryPrice - lockATR;

  // Never lower the stop — only raise for longs, lower for shorts
  if (isLong) {
    return Math.max(currentStop, ratchetStop);
  } else {
    return currentStop > 0 ? Math.min(currentStop, ratchetStop) : ratchetStop;
  }
}

// ─── Momentum Fade Detection ─────────────────────────────────────────────────
// Checks if the momentum that drove the entry is fading.
// Returns { fading: bool, strength: 0-1, reasons: string[] }
//
// Uses simple, robust signals:
//   - Price below short-term MA (momentum lost)
//   - Volume declining vs entry period
//   - Candle bodies shrinking (indecision)

function detectMomentumFade(klines, direction, lookback = 10) {
  if (!klines || klines.length < lookback + 5) {
    return { fading: false, strength: 1.0, reasons: [] };
  }

  const recent = klines.slice(-lookback);
  const prior = klines.slice(-(lookback * 2), -lookback);
  const isLong = direction === 'long';
  const reasons = [];
  let fadeSignals = 0;

  // 1. Price vs SMA: is price trending in our direction?
  const sma = recent.reduce((s, b) => s + b.close, 0) / recent.length;
  const currentPrice = recent[recent.length - 1].close;
  const priceVsSma = isLong ? currentPrice < sma : currentPrice > sma;
  if (priceVsSma) {
    fadeSignals++;
    reasons.push(isLong ? 'price below SMA' : 'price above SMA');
  }

  // 2. Volume declining: recent volume < 60% of prior period
  if (prior.length >= lookback) {
    const recentVol = recent.reduce((s, b) => s + (b.volume || 0), 0) / recent.length;
    const priorVol = prior.reduce((s, b) => s + (b.volume || 0), 0) / prior.length;
    if (priorVol > 0 && recentVol < priorVol * 0.6) {
      fadeSignals++;
      reasons.push(`volume dropped to ${((recentVol / priorVol) * 100).toFixed(0)}% of entry`);
    }
  }

  // 3. Candle body shrinking: recent bodies < 50% of prior bodies (indecision)
  const avgRecentBody = recent.reduce((s, b) => s + Math.abs(b.close - b.open), 0) / recent.length;
  if (prior.length >= lookback) {
    const avgPriorBody = prior.reduce((s, b) => s + Math.abs(b.close - b.open), 0) / prior.length;
    if (avgPriorBody > 0 && avgRecentBody < avgPriorBody * 0.5) {
      fadeSignals++;
      reasons.push('candle bodies shrinking (indecision)');
    }
  }

  // 4. Consecutive candles against position direction (3+ = fading)
  let consecutiveAgainst = 0;
  for (let i = recent.length - 1; i >= Math.max(0, recent.length - 5); i--) {
    const bearish = recent[i].close < recent[i].open;
    if ((isLong && bearish) || (!isLong && !bearish)) {
      consecutiveAgainst++;
    } else {
      break;
    }
  }
  if (consecutiveAgainst >= 3) {
    fadeSignals++;
    reasons.push(`${consecutiveAgainst} consecutive candles against position`);
  }

  // Strength: 1.0 = strong momentum, 0.0 = fully faded
  const strength = Math.max(0, 1 - (fadeSignals / 4));
  const fading = fadeSignals >= 2; // 2+ signals = momentum is fading

  return { fading, strength, fadeSignals, reasons };
}

// ─── Reversal Candle Detection ───────────────────────────────────────────────
// Detects strong reversal candles (engulfing, pin bar) against position direction.
// Returns { reversal: bool, type: string, severity: 'minor'|'major' }

function detectReversalCandle(klines, atr, direction) {
  if (!klines || klines.length < 3 || !atr || atr <= 0) {
    return { reversal: false, type: null, severity: null };
  }

  const last = klines[klines.length - 1];
  const prev = klines[klines.length - 2];
  const isLong = direction === 'long';

  const lastRange = last.high - last.low;
  const lastBody = Math.abs(last.close - last.open);
  const lastBearish = last.close < last.open;
  const lastBullish = last.close > last.open;
  const againstPosition = (isLong && lastBearish) || (!isLong && lastBullish);

  // Pin bar / rejection: long wick against position, small body
  // Checked BEFORE againstPosition gate — pin bar body direction is irrelevant,
  // the wick structure is what signals rejection.
  if (lastBody < lastRange * 0.3 && lastRange > atr) {
    const upperWick = last.high - Math.max(last.open, last.close);
    const lowerWick = Math.min(last.open, last.close) - last.low;
    if (isLong && upperWick > lastRange * 0.6) {
      return { reversal: true, type: 'upper_rejection', severity: 'minor' };
    }
    if (!isLong && lowerWick > lastRange * 0.6) {
      return { reversal: true, type: 'lower_rejection', severity: 'minor' };
    }
  }

  if (!againstPosition) return { reversal: false, type: null, severity: null };

  // Major reversal: large candle (>1.5x ATR) with strong body (>60% of range), against position
  if (lastRange > 1.5 * atr && lastBody > 0.6 * lastRange) {
    return { reversal: true, type: 'strong_reversal', severity: 'major' };
  }

  // Engulfing: current body fully contains previous body, against position
  const prevBody = Math.abs(prev.close - prev.open);
  const prevBearish = prev.close < prev.open;
  if (lastBody > prevBody * 1.2 && lastRange > atr) {
    if ((isLong && lastBearish && !prevBearish) || (!isLong && lastBullish && prevBearish)) {
      return { reversal: true, type: 'engulfing', severity: 'major' };
    }
  }

  return { reversal: false, type: null, severity: null };
}

// ─── Main Exit Evaluation ────────────────────────────────────────────────────
// Combines all three mechanisms into a single recommendation.
//
// @param {object} params
// @param {number} params.partialsCompleted - How many partial exits have been taken (0, 1, or 2).
//   Pass this from position state; defaults to 0 if omitted.
//
// Returns:
//   {
//     action: 'hold' | 'tighten' | 'exit' | 'partial_exit',
//     newStop: number | null,         // suggested stop (only if action is 'tighten')
//     reason: string | null,
//     rMultiple: number,
//     momentumFade: { ... },
//     reversalCandle: { ... },
//     partialFraction: number | null, // fraction to close (only if action is 'partial_exit')
//     partialsCompleted: number | null // updated count (only if action is 'partial_exit')
//   }

function evaluateExit(params) {
  const {
    entryPrice,
    currentPrice,
    currentStop,
    direction,
    klines,        // recent price bars (20+ recommended)
    atrPeriod = 14,
    partialsCompleted = 0,
  } = params;

  const isLong = direction === 'long';
  const atr = klines && klines.length >= atrPeriod ? computeATR(klines, atrPeriod) : 0;
  const unrealized = isLong
    ? (currentPrice - entryPrice) / entryPrice
    : (entryPrice - currentPrice) / entryPrice;
  const rMultiple = atr > 0 ? (unrealized * currentPrice) / atr : 0;
  const isProfitable = unrealized > 0;

  const result = {
    action: 'hold',
    newStop: currentStop,
    reason: null,
    rMultiple: Math.round(rMultiple * 100) / 100,
    unrealizedPct: Math.round(unrealized * 10000) / 100,
    momentumFade: null,
    reversalCandle: null,
  };

  if (!atr || atr <= 0) return result;

  // 1. Profit ratchet — always apply (mechanical, no judgment)
  const ratchetStop = computeRatchetStop(entryPrice, currentStop, currentPrice, atr, direction);
  if (isLong ? ratchetStop > currentStop : (currentStop <= 0 || ratchetStop < currentStop)) {
    result.newStop = ratchetStop;
  }

  // 1.5. Partial profit taking — scale out in thirds at 1R and 2R
  if (isProfitable && partialsCompleted < 2) {
    const partialThresholds = [1.0, 2.0]; // R-multiples for each partial
    const nextThreshold = partialThresholds[partialsCompleted];
    if (rMultiple >= nextThreshold) {
      result.action = 'partial_exit';
      result.partialFraction = 1/3;
      result.partialsCompleted = partialsCompleted + 1;
      result.reason = `Partial exit ${partialsCompleted + 1}/2 at ${result.rMultiple}R (threshold: ${nextThreshold}R)`;
      // Don't return early — still compute momentum fade and reversal for info
      // but the primary action is partial_exit
    }
  }

  // 2. Momentum fade — only act on it if trade is profitable
  const fade = detectMomentumFade(klines, direction);
  result.momentumFade = fade;

  if (fade.fading && isProfitable && rMultiple >= 0.5) {
    // Momentum gone + profitable → exit now, don't wait for stop
    result.action = 'exit';
    result.reason = `Momentum fade while profitable (+${result.unrealizedPct}%): ${fade.reasons.join(', ')}`;
    return result;
  }

  // 3. Reversal candle — tighten stop aggressively
  const reversal = detectReversalCandle(klines, atr, direction);
  result.reversalCandle = reversal;

  if (reversal.reversal) {
    if (reversal.severity === 'major' && isProfitable) {
      // Major reversal + profitable → exit immediately
      result.action = 'exit';
      result.reason = `${reversal.type} reversal candle while profitable (+${result.unrealizedPct}%)`;
      return result;
    }

    if (reversal.severity === 'major' || (reversal.severity === 'minor' && isProfitable)) {
      // Tighten stop to 0.5 ATR from current price
      const tightStop = isLong ? currentPrice - 0.5 * atr : currentPrice + 0.5 * atr;
      if (isLong ? tightStop > result.newStop : tightStop < result.newStop) {
        result.newStop = tightStop;
        result.action = 'tighten';
        result.reason = `${reversal.type} — stop tightened to 0.5 ATR`;
      }
    }
  }

  // 4. If ratchet moved the stop, report it
  if (result.action === 'hold' && result.newStop !== currentStop) {
    result.action = 'tighten';
    result.reason = `Profit ratchet at ${result.rMultiple}R`;
  }

  return result;
}

// ─── Portfolio Heat ──────────────────────────────────────────────────────────
// Total risk across all open positions. If heat exceeds limit, no new trades.
// Each position's risk = (entry - stop) / entry * positionValue / equity
//
// Returns: { heat: number (0-1), positions: number, maxHeat: number, canOpen: bool }

function computePortfolioHeat(openPositions, equity, maxHeat = 0.06) {
  if (!openPositions || openPositions.length === 0 || !equity || equity <= 0) {
    return { heat: 0, positions: 0, maxHeat, canOpen: true };
  }

  let totalRiskDollars = 0;

  for (const pos of openPositions) {
    const entry = pos.entryPrice || pos.entry || 0;
    const stop = pos.stopLoss || pos.currentStop || 0;
    const qty = pos.quantity || pos.shares || pos.units || 0;

    if (entry <= 0 || stop <= 0 || qty <= 0) continue;

    const isLong = (pos.direction || 'long') === 'long';
    const riskPerUnit = isLong ? (entry - stop) : (stop - entry);

    if (riskPerUnit > 0) {
      totalRiskDollars += riskPerUnit * qty;
    }
  }

  const heat = totalRiskDollars / equity;

  return {
    heat: Math.round(heat * 10000) / 10000,
    riskDollars: Math.round(totalRiskDollars * 100) / 100,
    positions: openPositions.length,
    maxHeat,
    canOpen: heat < maxHeat,
  };
}

// ─── Equity Curve Trading ───────────────────────────────────────────────────
// Tracks equity curve vs its moving average.
// When equity is below the MA → reduce position size (the strategy is underperforming).
// When equity is above → normal sizing.
//
// Returns: { multiplier: number (0.25-1.0), aboveMA: bool, equityMA: number }

function computeEquityCurveMultiplier(equityHistory, lookback = 20) {
  if (!equityHistory || equityHistory.length < lookback) {
    return { multiplier: 1.0, aboveMA: true, equityMA: null, reason: 'insufficient data' };
  }

  const recent = equityHistory.slice(-lookback);
  const equityMA = recent.reduce((s, v) => s + v, 0) / lookback;
  const currentEquity = equityHistory[equityHistory.length - 1];
  const aboveMA = currentEquity >= equityMA;

  if (aboveMA) {
    return { multiplier: 1.0, aboveMA: true, equityMA: Math.round(equityMA * 100) / 100, reason: 'equity above MA' };
  }

  // Below MA: scale down proportionally. 5% below = 0.75x, 10% below = 0.50x, etc.
  const deviation = (equityMA - currentEquity) / equityMA;
  const multiplier = Math.max(0.25, 1.0 - (deviation * 5)); // 5x sensitivity

  return {
    multiplier: Math.round(multiplier * 100) / 100,
    aboveMA: false,
    equityMA: Math.round(equityMA * 100) / 100,
    deviation: Math.round(deviation * 10000) / 100, // as percentage
    reason: `equity ${(deviation * 100).toFixed(1)}% below MA → ${multiplier.toFixed(2)}x sizing`,
  };
}

// ─── Cross-Bot Correlation Guard ────────────────────────────────────────────
// Prevents concentrated directional risk when multiple bots are correlated.
// Computes a directional exposure score: +1 for each long, -1 for each short.
// If |netExposure| / totalPositions > threshold, new entries in the dominant
// direction require higher confidence.
//
// Returns: { netExposure, totalPositions, exposureRatio, directionBias,
//            confidenceBoost, canOpenLong, canOpenShort }

function computeCorrelationGuard(allPositions, maxExposureRatio = 0.75) {
  if (!allPositions || allPositions.length === 0) {
    return {
      netExposure: 0, totalPositions: 0, exposureRatio: 0,
      directionBias: 'neutral', confidenceBoost: 0,
      canOpenLong: true, canOpenShort: true
    };
  }

  let longCount = 0;
  let shortCount = 0;

  for (const pos of allPositions) {
    const dir = (pos.direction || pos.side || 'long').toLowerCase();
    if (dir === 'long' || dir === 'buy') longCount++;
    else shortCount++;
  }

  const totalPositions = longCount + shortCount;
  const netExposure = longCount - shortCount;
  const exposureRatio = totalPositions > 0 ? Math.abs(netExposure) / totalPositions : 0;
  const directionBias = netExposure > 0 ? 'long' : netExposure < 0 ? 'short' : 'neutral';

  // When exposure is concentrated, require extra confidence for same-direction trades
  // and ease requirements for opposite-direction (hedging) trades
  const isConcentrated = exposureRatio > maxExposureRatio && totalPositions >= 3;

  // Confidence boost: how much extra confidence to require for same-direction
  // At 100% exposure with 5+ positions: require 0.10 extra confidence
  const confidenceBoost = isConcentrated
    ? Math.min(0.10, (exposureRatio - maxExposureRatio) * 0.4)
    : 0;

  return {
    netExposure,
    longCount,
    shortCount,
    totalPositions,
    exposureRatio: Math.round(exposureRatio * 100) / 100,
    directionBias,
    isConcentrated,
    confidenceBoost: Math.round(confidenceBoost * 1000) / 1000,
    // Can always open opposite direction (hedging), but same-direction needs boost
    canOpenLong: !isConcentrated || directionBias !== 'long',
    canOpenShort: !isConcentrated || directionBias !== 'short',
  };
}

module.exports = {
  evaluateExit,
  computeRatchetStop,
  detectMomentumFade,
  detectReversalCandle,
  computePortfolioHeat,
  computeEquityCurveMultiplier,
  computeCorrelationGuard,
};
