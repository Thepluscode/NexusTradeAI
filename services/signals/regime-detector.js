'use strict';

/**
 * 4-State Market Regime Detector (v24.3)
 *
 * Classifies markets into 4 directional states using multiple factors:
 *   - TRENDING_UP:     Strong uptrend (ADX > 25, EMA slope positive, price > SMA)
 *   - TRENDING_DOWN:   Strong downtrend (ADX > 25, EMA slope negative, price < SMA)
 *   - MEAN_REVERTING:  Low volatility range (ADX < 20, ATR% low, price oscillating around SMA)
 *   - HIGH_VOLATILITY: Crisis/news regime (ATR% spike, wide ranges, erratic direction)
 *
 * Previous: 3-bucket ATR-only (low/medium/high) — no directional awareness,
 * couldn't distinguish "calm uptrend" from "calm downtrend" or "choppy range."
 *
 * Factors used:
 *   1. ATR% (volatility magnitude) — low, normal, or high
 *   2. ADX (trend strength) — below 20 = no trend, above 25 = strong trend
 *   3. EMA slope (trend direction) — positive = up, negative = down
 *   4. Price vs SMA (structural position) — above = bullish bias, below = bearish
 *   5. Directional movement ratio — consistency of recent moves
 *
 * Outputs:
 *   - regime: one of 4 states
 *   - confidence: 0-1 how certain we are about the classification
 *   - adjustments: position sizing and threshold multipliers for this regime
 *   - transition: probability of leaving current regime (high = unstable)
 *
 * @param {Array<{open,high,low,close,volume}>} klines — OHLCV bars
 * @param {Object} config — thresholds
 * @returns {Object} regime classification
 */

const REGIMES = {
    TRENDING_UP: 'TRENDING_UP',
    TRENDING_DOWN: 'TRENDING_DOWN',
    MEAN_REVERTING: 'MEAN_REVERTING',
    HIGH_VOLATILITY: 'HIGH_VOLATILITY',
};

const REGIME_ADJUSTMENTS = {
    TRENDING_UP: {
        label: 'Trending Up',
        positionSizeMultiplier: 1.1,    // slightly larger in confirmed trend
        scoreThresholdMultiplier: 0.95, // slightly lower bar (trend supports entries)
        maxPositions: 6,
        allowedDirections: ['long'],     // only longs in uptrend
        strategies: ['momentum', 'stockOrb', 'cryptoMomentum', 'trendPullback'],
    },
    TRENDING_DOWN: {
        label: 'Trending Down',
        positionSizeMultiplier: 0.5,    // half size — counter-trend is dangerous
        scoreThresholdMultiplier: 1.3,  // high bar — only best setups
        maxPositions: 3,
        allowedDirections: ['short'],    // only shorts in downtrend
        strategies: ['momentum', 'cryptoMomentum'],  // no ORB in downtrends
    },
    MEAN_REVERTING: {
        label: 'Mean Reverting',
        positionSizeMultiplier: 1.0,
        scoreThresholdMultiplier: 1.0,
        maxPositions: 5,
        allowedDirections: ['long', 'short'],
        strategies: ['stockVwapReversal', 'forexLondonBreakout', 'meanReversion'],
    },
    HIGH_VOLATILITY: {
        label: 'High Volatility',
        positionSizeMultiplier: 0.3,    // aggressive reduction — protect capital
        scoreThresholdMultiplier: 1.5,  // only the strongest signals
        maxPositions: 2,
        allowedDirections: ['long', 'short'],
        strategies: [],                  // ideally sit out, but allow if signal is extreme
    },
};

// Legacy regime names mapped to new 4-state system (for backward compatibility)
const LEGACY_MAP = {
    'low': REGIMES.MEAN_REVERTING,
    'medium': REGIMES.TRENDING_UP,   // conservative default
    'high': REGIMES.HIGH_VOLATILITY,
    'ranging': REGIMES.MEAN_REVERTING,
    'trending': REGIMES.TRENDING_UP,
    'volatile': REGIMES.HIGH_VOLATILITY,
};

/**
 * Compute ATR from OHLCV bars.
 */
function computeATR(klines, period = 14) {
    if (!klines || klines.length < 2) return 0;
    const trs = [];
    for (let i = 1; i < klines.length; i++) {
        const high = klines[i].high;
        const low = klines[i].low;
        const prevClose = klines[i - 1].close;
        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);
    }
    const recent = trs.slice(-period);
    return recent.reduce((s, v) => s + v, 0) / recent.length;
}

/**
 * Compute ADX (Average Directional Index) — measures trend strength regardless of direction.
 * ADX < 20: no trend (range-bound)
 * ADX 20-25: weak trend
 * ADX > 25: strong trend
 * ADX > 40: very strong trend
 */
function computeADX(klines, period = 14) {
    if (!klines || klines.length < period * 2 + 1) return { adx: 15, plusDI: 0, minusDI: 0 };

    const plusDMs = [];
    const minusDMs = [];
    const trs = [];

    for (let i = 1; i < klines.length; i++) {
        const high = klines[i].high;
        const low = klines[i].low;
        const prevHigh = klines[i - 1].high;
        const prevLow = klines[i - 1].low;
        const prevClose = klines[i - 1].close;

        const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
        trs.push(tr);

        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        plusDMs.push(upMove > downMove && upMove > 0 ? upMove : 0);
        minusDMs.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Smoothed averages using Wilder's method
    function wilderSmooth(arr, p) {
        if (arr.length < p) return arr[arr.length - 1] || 0;
        let smoothed = arr.slice(0, p).reduce((s, v) => s + v, 0);
        const results = [smoothed];
        for (let i = p; i < arr.length; i++) {
            smoothed = smoothed - smoothed / p + arr[i];
            results.push(smoothed);
        }
        return results;
    }

    const smoothTR = wilderSmooth(trs, period);
    const smoothPlusDM = wilderSmooth(plusDMs, period);
    const smoothMinusDM = wilderSmooth(minusDMs, period);

    const len = Math.min(smoothTR.length, smoothPlusDM.length, smoothMinusDM.length);
    if (len === 0) return { adx: 15, plusDI: 0, minusDI: 0 };

    // Compute DI values and DX
    const dxValues = [];
    let lastPlusDI = 0, lastMinusDI = 0;

    for (let i = 0; i < len; i++) {
        const tr = smoothTR[i];
        if (tr === 0) continue;
        const plusDI = (smoothPlusDM[i] / tr) * 100;
        const minusDI = (smoothMinusDM[i] / tr) * 100;
        const diSum = plusDI + minusDI;
        const dx = diSum > 0 ? (Math.abs(plusDI - minusDI) / diSum) * 100 : 0;
        dxValues.push(dx);
        lastPlusDI = plusDI;
        lastMinusDI = minusDI;
    }

    if (dxValues.length < period) {
        const avg = dxValues.reduce((s, v) => s + v, 0) / (dxValues.length || 1);
        return { adx: parseFloat(avg.toFixed(2)), plusDI: parseFloat(lastPlusDI.toFixed(2)), minusDI: parseFloat(lastMinusDI.toFixed(2)) };
    }

    // ADX = smoothed average of DX
    const smoothDX = wilderSmooth(dxValues, period);
    const adx = smoothDX[smoothDX.length - 1] / period; // Wilder smoothing accumulates, divide by period

    return {
        adx: parseFloat(Math.min(adx, 100).toFixed(2)),
        plusDI: parseFloat(lastPlusDI.toFixed(2)),
        minusDI: parseFloat(lastMinusDI.toFixed(2)),
    };
}

/**
 * Compute EMA slope — direction and strength of trend.
 * Positive slope = uptrend, negative = downtrend.
 * Magnitude indicates trend strength.
 */
function computeEMASlope(klines, emaPeriod = 20, slopeLookback = 5) {
    if (!klines || klines.length < emaPeriod + slopeLookback) return 0;

    const closes = klines.map(b => b.close);
    const multiplier = 2 / (emaPeriod + 1);

    // Compute EMA
    let ema = closes.slice(0, emaPeriod).reduce((s, v) => s + v, 0) / emaPeriod;
    const emaValues = [ema];
    for (let i = emaPeriod; i < closes.length; i++) {
        ema = (closes[i] - ema) * multiplier + ema;
        emaValues.push(ema);
    }

    if (emaValues.length < slopeLookback + 1) return 0;

    // Slope = (current EMA - EMA N bars ago) / current EMA → percentage slope
    const currentEMA = emaValues[emaValues.length - 1];
    const pastEMA = emaValues[emaValues.length - 1 - slopeLookback];
    if (currentEMA === 0) return 0;

    return (currentEMA - pastEMA) / currentEMA;
}

/**
 * Main regime detection function.
 *
 * @param {Array} klines — OHLCV bars (normalized: {open, high, low, close, volume})
 * @param {Object} config
 * @returns {{ regime, confidence, adjustments, atr, atrPercent, adx, emaSlope, transition, raw }}
 */
function detectRegime(klines, config = {}) {
    const {
        atrPeriod = 14,
        adxPeriod = 14,
        emaPeriod = 20,
        slopeLookback = 5,
        // ATR% thresholds (asset-class dependent — caller should override for crypto/forex)
        lowVolThreshold = 0.5,     // below this = low vol (mean-reverting)
        highVolThreshold = 1.5,    // above this = high vol (crisis)
        // ADX thresholds
        trendThreshold = 25,       // ADX above this = trending
        noTrendThreshold = 20,     // ADX below this = no trend
    } = config;

    if (!klines || klines.length < Math.max(atrPeriod, adxPeriod) * 2 + emaPeriod) {
        return {
            regime: REGIMES.MEAN_REVERTING,
            confidence: 0.3,
            adjustments: REGIME_ADJUSTMENTS.MEAN_REVERTING,
            atr: 0, atrPercent: 0, adx: 15, emaSlope: 0,
            transition: 0.5,
            raw: { volatility: 'unknown', trendStrength: 'none', trendDirection: 'flat' },
        };
    }

    const atr = computeATR(klines, atrPeriod);
    const price = klines[klines.length - 1].close;
    const atrPercent = price > 0 ? (atr / price) * 100 : 0;

    const { adx, plusDI, minusDI } = computeADX(klines, adxPeriod);
    const emaSlope = computeEMASlope(klines, emaPeriod, slopeLookback);

    // SMA for structural position
    const smaLen = Math.min(50, klines.length);
    const smaSlice = klines.slice(-smaLen);
    const sma = smaSlice.reduce((s, b) => s + b.close, 0) / smaSlice.length;
    const priceAboveSMA = price > sma;

    // Classify volatility
    let volatility;
    if (atrPercent < lowVolThreshold) volatility = 'low';
    else if (atrPercent > highVolThreshold) volatility = 'high';
    else volatility = 'normal';

    // Classify trend
    let trendStrength;
    if (adx >= trendThreshold) trendStrength = 'strong';
    else if (adx >= noTrendThreshold) trendStrength = 'weak';
    else trendStrength = 'none';

    let trendDirection;
    if (emaSlope > 0.001) trendDirection = 'up';
    else if (emaSlope < -0.001) trendDirection = 'down';
    else trendDirection = 'flat';

    // ── Regime classification logic ──
    let regime, confidence;

    if (volatility === 'high') {
        // High volatility overrides everything — protect capital
        regime = REGIMES.HIGH_VOLATILITY;
        confidence = Math.min(atrPercent / (highVolThreshold * 2), 1.0);
    } else if (trendStrength === 'strong') {
        // Strong trend detected — determine direction
        if (trendDirection === 'up' && priceAboveSMA) {
            regime = REGIMES.TRENDING_UP;
            confidence = Math.min(adx / 50, 1.0); // ADX 50+ = very confident
        } else if (trendDirection === 'down' && !priceAboveSMA) {
            regime = REGIMES.TRENDING_DOWN;
            confidence = Math.min(adx / 50, 1.0);
        } else {
            // ADX says trend but EMA/SMA disagree — mixed signals, lower confidence
            regime = trendDirection === 'up' ? REGIMES.TRENDING_UP : REGIMES.TRENDING_DOWN;
            confidence = Math.min(adx / 50, 1.0) * 0.6; // penalize conflicting signals
        }
    } else if (trendStrength === 'weak') {
        // Weak trend — could be transitioning
        if (volatility === 'low') {
            regime = REGIMES.MEAN_REVERTING;
            confidence = 0.5;
        } else {
            // Normal vol + weak trend = uncertain — lean toward direction
            regime = trendDirection === 'down' ? REGIMES.TRENDING_DOWN : REGIMES.TRENDING_UP;
            confidence = 0.4;
        }
    } else {
        // No trend (ADX < 20) — range-bound
        regime = REGIMES.MEAN_REVERTING;
        confidence = volatility === 'low' ? 0.8 : 0.5;
    }

    // Transition probability: how likely we are to leave this regime
    // High when ADX is near the threshold (regime could flip)
    const adxDistFromThreshold = Math.min(
        Math.abs(adx - trendThreshold),
        Math.abs(adx - noTrendThreshold)
    );
    const transition = 1 - Math.min(adxDistFromThreshold / 15, 1.0);

    return {
        regime,
        confidence: parseFloat(confidence.toFixed(3)),
        adjustments: REGIME_ADJUSTMENTS[regime],
        atr: parseFloat(atr.toFixed(6)),
        atrPercent: parseFloat(atrPercent.toFixed(3)),
        adx,
        plusDI,
        minusDI,
        emaSlope: parseFloat(emaSlope.toFixed(6)),
        priceAboveSMA: priceAboveSMA,
        transition: parseFloat(transition.toFixed(3)),
        raw: { volatility, trendStrength, trendDirection },
    };
}

module.exports = {
    detectRegime,
    computeATR,
    computeADX,
    computeEMASlope,
    REGIMES,
    REGIME_ADJUSTMENTS,
    LEGACY_MAP,
};
