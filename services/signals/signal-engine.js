'use strict';

/**
 * Signal Intelligence Engine v1.0
 * ================================
 * Unified entry evaluation with strategy-specific scoring,
 * multi-timeframe confirmation, and expected value gates.
 *
 * Architecture:
 * +-------------------------------------------+
 * |  Gate Layer (hard filters)                 |
 * |  +-- Multi-Timeframe Trend Alignment       |
 * |  +-- Regime Compatibility                  |
 * +-------------------------------------------+
 * |  Scoring Layer (0-1 per component)         |
 * |  +-- Strategy-Specific Components          |
 * |  |   +-- ORB: bell-curve scoring           |
 * |  |   +-- Momentum: linear scoring          |
 * |  |   +-- MeanReversion: oversold scoring   |
 * |  +-- Confluence Check (min N >= 0.5)       |
 * +-------------------------------------------+
 * |  Decision Layer                            |
 * |  +-- Expected Value Calculation            |
 * |  +-- Position Sizing Factor                |
 * +-------------------------------------------+
 *
 * Specification:
 *   Inputs:  klines[], direction, strategy, botType, signal{}
 *   Outputs: {trade, score, confidence, ev, gates{}, components{}, reasoning}
 *   Invariants:
 *     - trade=true ONLY when ALL gates pass AND score >= threshold AND ev > 0
 *     - Every rejection includes gate name, actual value, and threshold
 *     - Pure function: no side effects, no API calls, no state mutation
 */

const path = require('path');

// --- Dependencies (graceful fallback) ---
let getRoundTripCost;
try {
  getRoundTripCost = require(path.join(__dirname, 'cost-model')).getRoundTripCost;
} catch (_) { /* engine works without cost model — uses default costs */ }

// ================================================================
//  STRATEGY SCORING PROFILES
// ================================================================

const PROFILES = {
  orb: {
    name: 'Opening Range Breakout',
    weights: {
      breakoutQuality: 0.25,
      volumeConfirmation: 0.20,
      trendAlignment: 0.20,
      regimeQuality: 0.15,
      rsiZone: 0.10,
      priceAction: 0.10,
    },
    minConfirmations: 3,
    minScore: 0.42,
  },
  momentum: {
    name: 'Momentum',
    weights: {
      trendStrength: 0.25,
      momentum: 0.20,
      volumeSurge: 0.20,
      trendAlignment: 0.15,
      orderFlow: 0.10,
      displacement: 0.10,
    },
    minConfirmations: 3,
    minScore: 0.48,
  },
  meanReversion: {
    name: 'Mean Reversion',
    weights: {
      oversold: 0.30,
      volumeProfile: 0.25,
      regimeQuality: 0.20,
      volumeExhaustion: 0.15,
      support: 0.10,
    },
    minConfirmations: 2,
    minScore: 0.45,
  },
};

// Strategy name aliases -> profile key
const STRATEGY_ALIASES = {
  openingRangeBreakout: 'orb',
  trendPullback: 'momentum',
  boxBreakout: 'momentum',
  meanReversionOBV: 'meanReversion',
  bbRsiMeanReversion: 'meanReversion',
  londonBreakout: 'orb',
  trendContinuation: 'momentum',
  pullbackContinuation: 'momentum',
};

// Conservative R:R estimates per strategy (from historical data)
const RR_ESTIMATES = {
  orb:            { avgWin: 0.030, avgLoss: 0.017 },
  momentum:       { avgWin: 0.035, avgLoss: 0.030 },
  meanReversion:  { avgWin: 0.025, avgLoss: 0.020 },
};

// Default round-trip costs if cost-model not available
const DEFAULT_COSTS = {
  stock:  0.10,   // 0.10%
  crypto: 0.30,   // 0.30%
  forex:  0.08,   // 0.08%
};

// ================================================================
//  BAR HELPERS
// ================================================================

function getO(bar) { return parseFloat(bar.o ?? bar.open ?? 0); }
function getH(bar) { return parseFloat(bar.h ?? bar.high ?? 0); }
function getL(bar) { return parseFloat(bar.l ?? bar.low ?? 0); }
function getC(bar) { return parseFloat(bar.c ?? bar.close ?? 0); }
function getV(bar) { return parseFloat(bar.v ?? bar.volume ?? 0); }

/**
 * Aggregate bars into higher timeframe.
 * E.g., 1-min bars with periodBars=15 -> 15-min bars.
 */
function aggregateBars(bars, periodBars) {
  if (!Array.isArray(bars) || bars.length < periodBars || periodBars < 1) return [];
  const result = [];
  for (let i = 0; i <= bars.length - periodBars; i += periodBars) {
    const chunk = bars.slice(i, i + periodBars);
    const highs = chunk.map(getH);
    const lows = chunk.map(getL);
    result.push({
      open:   getO(chunk[0]),
      high:   Math.max(...highs),
      low:    Math.min(...lows),
      close:  getC(chunk[chunk.length - 1]),
      volume: chunk.reduce((sum, b) => sum + getV(b), 0),
    });
  }
  return result;
}

function closes(bars) {
  return bars.map(getC);
}

// ================================================================
//  MATH FUNCTIONS
// ================================================================

/**
 * Bell-curve scoring: peaks at optimal, drops for extremes.
 * Used for ORB where moderation predicts success.
 */
function bellScore(value, optimal, width) {
  if (!Number.isFinite(value) || !Number.isFinite(optimal) || !Number.isFinite(width) || width <= 0) return 0;
  return Math.exp(-Math.pow((value - optimal) / width, 2) / 2);
}

/**
 * Linear scoring: scales from 0 to 1 as value approaches cap.
 * Used for momentum where more = better.
 */
function linearScore(value, cap) {
  if (!Number.isFinite(value) || !Number.isFinite(cap) || cap <= 0) return 0;
  return Math.min(Math.max(value / cap, 0), 1);
}

/**
 * Inverse linear: higher value = lower score.
 */
function inverseScore(value, threshold) {
  if (!Number.isFinite(value) || !Number.isFinite(threshold) || threshold <= 0) return 0;
  return Math.max(0, 1 - value / threshold);
}

// ================================================================
//  INLINE INDICATORS (self-contained — no external dependency)
// ================================================================

function simpleEMA(values, period) {
  if (!values || values.length === 0) return 0;
  if (values.length < period) return values.reduce((a, b) => a + b, 0) / values.length;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function simpleSMA(values, period) {
  if (!values || values.length === 0) return 0;
  const len = Math.min(period, values.length);
  return values.slice(-len).reduce((a, b) => a + b, 0) / len;
}

function simpleRSI(values, period = 14) {
  if (!values || values.length < period + 1) return 50;
  let gainSum = 0, lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff > 0) gainSum += diff;
    else lossSum -= diff;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ================================================================
//  MULTI-TIMEFRAME GATE
// ================================================================

/**
 * Evaluate multi-timeframe trend alignment using bar aggregation.
 * Aggregates 1-min bars into 5m and 15m, checks trend on each.
 */
function checkMultiTimeframe(bars1m, direction) {
  if (!Array.isArray(bars1m) || bars1m.length < 30) {
    return { passed: true, score: 0.5, aligned: 0, total: 0, reason: 'Insufficient data — neutral' };
  }

  let aligned = 0;
  let total = 0;
  const target = direction === 'long' ? 'up' : 'down';

  // Check 1: 5-min trend (aggregate 1m -> 5m)
  const bars5m = aggregateBars(bars1m, 5);
  if (bars5m.length >= 12) {
    const cl = bars5m.map(b => b.close);
    const ema9 = simpleEMA(cl, 9);
    const sma20 = simpleSMA(cl, Math.min(20, cl.length));
    const current = cl[cl.length - 1];

    total++;
    const trend5 = (current > sma20 && ema9 > sma20) ? 'up'
                 : (current < sma20 && ema9 < sma20) ? 'down'
                 : 'neutral';
    if (trend5 === target) aligned++;
  }

  // Check 2: 15-min trend (aggregate 1m -> 15m)
  const bars15m = aggregateBars(bars1m, 15);
  if (bars15m.length >= 8) {
    const cl = bars15m.map(b => b.close);
    const ema9 = simpleEMA(cl, Math.min(9, cl.length));
    const sma20 = simpleSMA(cl, Math.min(20, cl.length));
    const current = cl[cl.length - 1];

    total++;
    const trend15 = (current > sma20 && ema9 > sma20) ? 'up'
                  : (current < sma20 && ema9 < sma20) ? 'down'
                  : 'neutral';
    if (trend15 === target) aligned++;
  }

  // Check 3: Short-term momentum (last 30 1m bars)
  {
    const recentCloses = closes(bars1m).slice(-30);
    if (recentCloses.length >= 20) {
      const first = recentCloses[0];
      const last = recentCloses[recentCloses.length - 1];
      const change = first > 0 ? (last - first) / first : 0;

      total++;
      if (direction === 'long' && change > 0.001) aligned++;
      else if (direction === 'short' && change < -0.001) aligned++;
    }
  }

  const score = total > 0 ? aligned / total : 0.5;
  const passed = score >= 0.5;

  return {
    passed,
    score,
    aligned,
    total,
    reason: passed
      ? `${aligned}/${total} timeframes aligned with ${direction}`
      : `Only ${aligned}/${total} timeframes aligned — counter-trend`,
  };
}

// ================================================================
//  ORB COMPONENT SCORERS
// ================================================================

function scoreORBComponents(signal, bars1m) {
  const components = {};

  // 1. Breakout Quality — bell curve at 1.5%, penalize extremes
  //    ORB insight: controlled breakouts (1-2%) win; chasing (>3%) loses
  const breakoutPct = Math.abs(parseFloat(signal.percentChange || signal.breakoutPct || 0));
  const breakoutDecimal = breakoutPct > 1 ? breakoutPct / 100 : breakoutPct;
  components.breakoutQuality = {
    score: bellScore(breakoutDecimal, 0.015, 0.012),
    raw: breakoutDecimal,
    detail: `breakout ${(breakoutDecimal * 100).toFixed(2)}% (sweet spot: 1-2%)`,
  };

  // 2. Volume Confirmation — bell curve at 2x, penalize extremes
  //    Insight: 1.5-2.5x = institutional participation; >4x = panic/crowded
  const volRatio = parseFloat(signal.volumeRatio || 1);
  components.volumeConfirmation = {
    score: bellScore(volRatio, 2.0, 1.2),
    raw: volRatio,
    detail: `volume ${volRatio.toFixed(1)}x (sweet spot: 1.5-2.5x)`,
  };

  // 3. Trend Alignment — filled by MTF gate
  components.trendAlignment = {
    score: 0.5, raw: 0, detail: 'pending MTF',
  };

  // 4. Regime Quality — calm markets favor ORB
  const regimeLabel = signal.regime || signal.regimeLabel || 'medium';
  const regimeMap = { low: 0.90, medium: 0.72, high: 0.25 };
  components.regimeQuality = {
    score: regimeMap[regimeLabel] ?? 0.5,
    raw: regimeLabel,
    detail: `regime ${regimeLabel} (ORB favors calm markets)`,
  };

  // 5. RSI Zone — bell curve at 52, penalize overbought/oversold
  //    ORB insight: neutral RSI = room to run; overbought = already extended
  const rsi = parseFloat(signal.rsi || 50);
  components.rsiZone = {
    score: bellScore(rsi, 52, 12),
    raw: rsi,
    detail: `RSI ${rsi.toFixed(1)} (neutral zone: 45-60)`,
  };

  // 6. Price Action — body/range ratio of recent candles
  //    Clean candles (large bodies, small wicks) = orderly breakout
  let priceActionScore = 0.5;
  if (Array.isArray(bars1m) && bars1m.length >= 5) {
    const recent = bars1m.slice(-5);
    let bodySum = 0;
    for (const bar of recent) {
      const body = Math.abs(getC(bar) - getO(bar));
      const range = getH(bar) - getL(bar);
      bodySum += range > 0 ? body / range : 0.5;
    }
    priceActionScore = bodySum / recent.length;
  }
  components.priceAction = {
    score: priceActionScore,
    raw: priceActionScore,
    detail: `candle quality ${(priceActionScore * 100).toFixed(0)}%`,
  };

  return components;
}

// ================================================================
//  MOMENTUM COMPONENT SCORERS
// ================================================================

function scoreMomentumComponents(signal, bars1m) {
  const components = {};

  // 1. Trend Strength — directional move / total volatility
  let trendRatio = 0;
  if (Array.isArray(bars1m) && bars1m.length >= 20) {
    const recent = bars1m.slice(-20);
    const firstClose = getC(recent[0]);
    const lastClose = getC(recent[recent.length - 1]);
    const dirMove = Math.abs(lastClose - firstClose);
    let sumTR = 0;
    for (let i = 1; i < recent.length; i++) {
      sumTR += Math.max(
        getH(recent[i]) - getL(recent[i]),
        Math.abs(getH(recent[i]) - getC(recent[i - 1])),
        Math.abs(getL(recent[i]) - getC(recent[i - 1]))
      );
    }
    const avgTR = sumTR / (recent.length - 1);
    trendRatio = avgTR > 0 ? dirMove / (avgTR * recent.length) : 0;
  }
  components.trendStrength = {
    score: linearScore(trendRatio, 0.5),
    raw: trendRatio,
    detail: `trend ratio ${trendRatio.toFixed(3)}`,
  };

  // 2. Momentum — price change magnitude
  const rawMom = Math.abs(parseFloat(signal.percentChange || signal.momentum || 0));
  const momPct = rawMom > 1 ? rawMom : rawMom * 100;
  components.momentum = {
    score: linearScore(momPct, 5),
    raw: momPct,
    detail: `momentum ${momPct.toFixed(2)}%`,
  };

  // 3. Volume Surge — higher = better for trend confirmation
  const volRatio = parseFloat(signal.volumeRatio || 1);
  components.volumeSurge = {
    score: linearScore(volRatio, 3),
    raw: volRatio,
    detail: `volume ${volRatio.toFixed(1)}x avg`,
  };

  // 4. Trend Alignment — filled by MTF gate
  components.trendAlignment = {
    score: 0.5, raw: 0, detail: 'pending MTF',
  };

  // 5. Order Flow — institutional activity
  const flowImbalance = parseFloat(signal.orderFlowImbalance ?? 0);
  components.orderFlow = {
    score: Math.max(0, Math.min(1, (flowImbalance + 1) / 2)),
    raw: flowImbalance,
    detail: `order flow ${(flowImbalance * 100).toFixed(0)}%`,
  };

  // 6. Displacement — large conviction candle
  const hasDisp = signal.hasDisplacement || false;
  components.displacement = {
    score: hasDisp ? 1.0 : 0.0,
    raw: hasDisp ? 1 : 0,
    detail: hasDisp ? 'displacement detected' : 'no displacement',
  };

  return components;
}

// ================================================================
//  MEAN REVERSION COMPONENT SCORERS
// ================================================================

function scoreMeanReversionComponents(signal, bars1m) {
  const components = {};

  // 1. Oversold — how oversold is the instrument?
  const rsi = parseFloat(signal.rsi || 50);
  components.oversold = {
    score: inverseScore(rsi, 70),
    raw: rsi,
    detail: `RSI ${rsi.toFixed(1)} (lower = more oversold)`,
  };

  // 2. Volume Profile — near value area low = discount zone
  let vpScore = 0.5;
  if (signal.volumeProfile) {
    const vp = signal.volumeProfile;
    const price = parseFloat(signal.price || signal.currentPrice || 0);
    const val = parseFloat(vp.val || vp.VAL || 0);
    const vah = parseFloat(vp.vah || vp.VAH || 0);
    const range = vah - val;
    if (range > 0 && price > 0) {
      vpScore = Math.max(0, 1 - (price - val) / range);
    }
  }
  components.volumeProfile = {
    score: vpScore, raw: vpScore,
    detail: `VP position ${(vpScore * 100).toFixed(0)}% (100% = at VAL)`,
  };

  // 3. Regime Quality — ranging markets favor mean reversion
  const regimeLabel = signal.regime || signal.regimeLabel || 'medium';
  const regimeMap = { low: 1.0, medium: 0.65, high: 0.15 };
  components.regimeQuality = {
    score: regimeMap[regimeLabel] ?? 0.5,
    raw: regimeLabel,
    detail: `regime ${regimeLabel} (mean reversion favors ranging)`,
  };

  // 4. Volume Exhaustion — selling pressure fading?
  let exhaustionScore = 0.5;
  if (Array.isArray(bars1m) && bars1m.length >= 10) {
    const recent5 = bars1m.slice(-5);
    const prev5 = bars1m.slice(-10, -5);
    const recentVol = recent5.reduce((s, b) => s + getV(b), 0);
    const prevVol = prev5.reduce((s, b) => s + getV(b), 0);
    exhaustionScore = prevVol > 0 ? linearScore(1 - recentVol / prevVol, 0.5) : 0.5;
  }
  components.volumeExhaustion = {
    score: exhaustionScore, raw: exhaustionScore,
    detail: `volume exhaustion ${(exhaustionScore * 100).toFixed(0)}%`,
  };

  // 5. Support — FVG or structure below
  const fvgCount = parseInt(signal.fvgCount || 0, 10);
  components.support = {
    score: fvgCount > 0 ? 1.0 : 0.3,
    raw: fvgCount,
    detail: fvgCount > 0 ? `${fvgCount} FVG(s) for support` : 'no FVG support',
  };

  return components;
}

// ================================================================
//  MAIN ENTRY EVALUATION
// ================================================================

/**
 * Evaluate a trading entry opportunity.
 *
 * @param {Object} params
 * @param {Array}  params.klines     - OHLCV bars (1-min or native timeframe)
 * @param {string} params.direction  - 'long' or 'short'
 * @param {string} params.strategy   - Strategy name
 * @param {string} params.botType    - 'stock', 'crypto', or 'forex'
 * @param {Object} params.signal     - Pre-computed signal data
 * @param {number} [params.currentPrice] - Current market price
 * @returns {Object} Decision: {trade, score, confidence, ev, gates, components, reasoning, sizingFactor}
 */
function evaluateEntry({
  klines = [],
  direction = 'long',
  strategy = 'momentum',
  botType = 'stock',
  signal = {},
  currentPrice = 0,
}) {
  const reasoning = [];
  const gates = {};

  // --- Resolve strategy profile ---
  const profileKey = STRATEGY_ALIASES[strategy] || strategy;
  const profile = PROFILES[profileKey];
  if (!profile) {
    return _reject(gates, {}, reasoning, `Unknown strategy: ${strategy} (resolved: ${profileKey})`);
  }

  // --- GATE 1: Multi-Timeframe Trend Alignment ---
  const mtf = checkMultiTimeframe(klines, direction);
  gates.multiTimeframe = mtf;

  if (!mtf.passed) {
    reasoning.push(`GATE:MTF ${mtf.reason}`);
    return _reject(gates, {}, reasoning);
  }
  reasoning.push(`MTF: ${mtf.reason}`);

  // --- COMPONENT SCORING ---
  let components;
  switch (profileKey) {
    case 'orb':
      components = scoreORBComponents(signal, klines);
      break;
    case 'meanReversion':
      components = scoreMeanReversionComponents(signal, klines);
      break;
    default:
      components = scoreMomentumComponents(signal, klines);
      break;
  }

  // Inject MTF score into trendAlignment component
  if (components.trendAlignment) {
    components.trendAlignment.score = mtf.score;
    components.trendAlignment.raw = mtf.aligned;
    components.trendAlignment.detail = mtf.reason;
  }

  // --- GATE 2: Confluence Check ---
  const scores = Object.values(components).map(c => c.score);
  const confirmations = scores.filter(s => s >= 0.5).length;
  gates.confluence = {
    passed: confirmations >= profile.minConfirmations,
    count: confirmations,
    required: profile.minConfirmations,
    total: scores.length,
    reason: `${confirmations}/${profile.minConfirmations} confirmations`,
  };

  if (!gates.confluence.passed) {
    reasoning.push(`GATE:CONFLUENCE ${gates.confluence.reason}`);
    return _reject(gates, components, reasoning);
  }
  reasoning.push(`Confluence: ${gates.confluence.reason}`);

  // --- Compute weighted score ---
  let totalScore = 0;
  let totalWeight = 0;
  for (const [key, weight] of Object.entries(profile.weights)) {
    const comp = components[key];
    if (comp && Number.isFinite(comp.score)) {
      totalScore += comp.score * weight;
      totalWeight += weight;
    }
  }
  const score = totalWeight > 0 ? totalScore / totalWeight : 0;

  // --- GATE 3: Score Threshold ---
  gates.scoreThreshold = {
    passed: score >= profile.minScore,
    score: parseFloat(score.toFixed(4)),
    threshold: profile.minScore,
    reason: `${score.toFixed(3)} ${score >= profile.minScore ? '>=' : '<'} ${profile.minScore}`,
  };

  if (!gates.scoreThreshold.passed) {
    reasoning.push(`GATE:SCORE ${gates.scoreThreshold.reason}`);
    return _reject(gates, components, reasoning, null, score);
  }
  reasoning.push(`Score: ${gates.scoreThreshold.reason}`);

  // --- GATE 4: Expected Value ---
  const price = currentPrice || parseFloat(signal.price || signal.currentPrice || 0);
  let costPct = DEFAULT_COSTS[botType] || 0.15;
  if (getRoundTripCost && price > 0) {
    try { costPct = getRoundTripCost(botType, price).costPct; } catch (_) {}
  }
  const costDecimal = costPct / 100;

  const rr = RR_ESTIMATES[profileKey] || RR_ESTIMATES.momentum;
  const confidence = score;
  const ev = (confidence * rr.avgWin) - ((1 - confidence) * rr.avgLoss) - costDecimal;

  gates.expectedValue = {
    passed: ev > 0,
    ev: parseFloat(ev.toFixed(6)),
    confidence: parseFloat(confidence.toFixed(4)),
    costPct,
    reason: `EV ${ev >= 0 ? '+' : ''}${(ev * 100).toFixed(2)}% (conf=${(confidence * 100).toFixed(0)}%, cost=${costPct.toFixed(2)}%)`,
  };

  if (!gates.expectedValue.passed) {
    reasoning.push(`GATE:EV ${gates.expectedValue.reason}`);
    return _reject(gates, components, reasoning, null, score, confidence, ev);
  }
  reasoning.push(`EV: ${gates.expectedValue.reason}`);

  // --- ALL GATES PASSED ---
  const sizingFactor = Math.min(0.5 + score, 1.5);

  reasoning.push(`APPROVED: ${profile.name} | ${confirmations} confluences | score ${score.toFixed(3)}`);

  return {
    trade: true,
    score: parseFloat(score.toFixed(4)),
    confidence: parseFloat(confidence.toFixed(4)),
    ev: parseFloat(ev.toFixed(6)),
    gates,
    components,
    reasoning: reasoning.join(' | '),
    sizingFactor: parseFloat(sizingFactor.toFixed(3)),
    profile: profileKey,
  };
}

/**
 * Build a rejection result. Every rejection has the same shape as approval.
 */
function _reject(gates, components, reasoning, extraReason, score = 0, confidence = 0, ev = 0) {
  if (extraReason) reasoning.push(extraReason);
  return {
    trade: false,
    score: parseFloat((score || 0).toFixed(4)),
    confidence: parseFloat((confidence || 0).toFixed(4)),
    ev: parseFloat((ev || 0).toFixed(6)),
    gates,
    components,
    reasoning: reasoning.join(' | '),
    sizingFactor: 0,
    profile: null,
  };
}

// ================================================================
//  EXPORTS
// ================================================================

module.exports = {
  evaluateEntry,
  PROFILES,
  STRATEGY_ALIASES,
  // Exposed for testing
  bellScore,
  linearScore,
  inverseScore,
  aggregateBars,
  checkMultiTimeframe,
  scoreORBComponents,
  scoreMomentumComponents,
  scoreMeanReversionComponents,
  simpleEMA,
  simpleSMA,
  simpleRSI,
};
