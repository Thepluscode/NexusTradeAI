'use strict';

/**
 * Liquidity Sweep Detection — identifies institutional stop hunts at key levels.
 *
 * A liquidity sweep is when price pierces a swing high/low (where retail stop
 * losses cluster), triggers those stops, then reverses with displacement.
 * This is a high-probability reversal signal used by institutional traders.
 *
 * Detection criteria (all required for a valid sweep):
 *   1. APPROACH — price must be trading near the swing level and approach it
 *      (not gap through from far away)
 *   2. PIERCE — wick extends past the swing level
 *   3. REJECTION — candle body closes on the opposite side of the level
 *      (the sweep was rejected, stops were taken but price reversed)
 *   4. VOLUME SPIKE — sweep candle volume > 1.5x average (stops triggering = volume)
 *   5. DISPLACEMENT CONFIRMATION — at least one of the next N candles shows
 *      a strong directional move away from the level (body > 60% of range,
 *      range > 1x ATR). This is NOT just "any close higher/lower" — it must
 *      be an impulsive move confirming institutional reversal intent.
 *
 * Directional output:
 *   - Bullish sweep: stop hunt below support → long signal
 *   - Bearish sweep: stop hunt above resistance → short signal
 *   - The caller filters by their desired trade direction
 *
 * Scoring factors:
 *   - Sweep depth relative to ATR (30%): deeper sweep = more stops triggered
 *   - Volume spike ratio (25%): higher volume = more conviction
 *   - Displacement strength (25%): stronger reversal = more institutional commitment
 *   - Wick-to-body ratio (20%): longer wick vs body = cleaner rejection
 *
 * @param {Array<{open,high,low,close,volume}>} bars — OHLCV bars (normalized)
 * @param {number} atr — current ATR value
 * @param {Object} config
 * @returns {{ score: number, raw: Object, meta: Object }}
 */
function computeLiquiditySweep(bars, atr, config = {}) {
    const {
        swingLookback = 10,
        confirmBars = 3,
        minSweepATRRatio = 0.3,
        minVolumeSpikeRatio = 1.5,
        neutralDefault = 0.3,
        approachBars = 5,          // bars before sweep that must be near the level
        approachDistanceATR = 3.0, // max distance from level in ATR units to count as "approaching"
    } = config;

    const minBarsNeeded = swingLookback + confirmBars + approachBars + 3;
    if (!bars || bars.length < minBarsNeeded || !atr || atr <= 0) {
        return {
            score: neutralDefault,
            raw: { bullishSweeps: [], bearishSweeps: [], detected: false, strength: 0, sweepCount: 0 },
            meta: {},
        };
    }

    // Pre-compute average volume for spike detection
    const avgVolume = bars.reduce((s, b) => s + (b.volume || 0), 0) / bars.length;

    const swingLows = findSwingLows(bars, swingLookback);
    const swingHighs = findSwingHighs(bars, swingLookback);

    const bullishSweeps = [];
    const bearishSweeps = [];

    // Only check recent bars for fresh sweeps
    const checkStart = Math.max(swingLookback + approachBars, bars.length - (confirmBars + 8));

    for (let i = checkStart; i < bars.length - 1; i++) {
        const bar = bars[i];
        const barVolume = bar.volume || 0;

        // ─── BULLISH SWEEP: stop hunt below swing low ───
        for (const swingLow of swingLows) {
            if (swingLow.index >= i - 1) continue; // swing must be well before current bar

            // 1. APPROACH: price must have been near the level in preceding bars
            const approaching = checkApproach(bars, i, swingLow.price, 'below', approachBars, atr, approachDistanceATR);
            if (!approaching) continue;

            // 2. PIERCE: wick goes below the swing low
            if (bar.low >= swingLow.price) continue;

            // 3. REJECTION: body closes above the swing low
            if (bar.close <= swingLow.price) continue;

            // Sweep depth
            const sweepDepth = (swingLow.price - bar.low) / atr;
            if (sweepDepth < minSweepATRRatio) continue;

            // 4. VOLUME SPIKE: sweep candle has elevated volume
            const volumeSpikeRatio = avgVolume > 0 ? barVolume / avgVolume : 0;
            const hasVolume = volumeSpikeRatio >= minVolumeSpikeRatio;

            // 5. DISPLACEMENT CONFIRMATION: strong reversal candle after sweep
            const displacement = checkDisplacementConfirmation(bars, i, atr, confirmBars, 'bullish');
            if (!displacement.confirmed) continue;

            const wickLength = swingLow.price - bar.low;
            const bodyLength = Math.abs(bar.close - bar.open);
            const wickRatio = bodyLength > 0 ? wickLength / bodyLength : wickLength;

            bullishSweeps.push({
                barIndex: i,
                swingLevel: swingLow.price,
                sweepExtreme: bar.low,
                sweepDepth: parseFloat(sweepDepth.toFixed(4)),
                wickRatio: parseFloat(Math.min(wickRatio, 10).toFixed(2)),
                volumeSpikeRatio: parseFloat(volumeSpikeRatio.toFixed(2)),
                hasVolume,
                displacementStrength: displacement.strength,
                direction: 'bullish',
            });
        }

        // ─── BEARISH SWEEP: stop hunt above swing high ───
        for (const swingHigh of swingHighs) {
            if (swingHigh.index >= i - 1) continue;

            const approaching = checkApproach(bars, i, swingHigh.price, 'above', approachBars, atr, approachDistanceATR);
            if (!approaching) continue;

            if (bar.high <= swingHigh.price) continue;
            if (bar.close >= swingHigh.price) continue;

            const sweepDepth = (bar.high - swingHigh.price) / atr;
            if (sweepDepth < minSweepATRRatio) continue;

            const volumeSpikeRatio = avgVolume > 0 ? barVolume / avgVolume : 0;
            const hasVolume = volumeSpikeRatio >= minVolumeSpikeRatio;

            const displacement = checkDisplacementConfirmation(bars, i, atr, confirmBars, 'bearish');
            if (!displacement.confirmed) continue;

            const wickLength = bar.high - swingHigh.price;
            const bodyLength = Math.abs(bar.close - bar.open);
            const wickRatio = bodyLength > 0 ? wickLength / bodyLength : wickLength;

            bearishSweeps.push({
                barIndex: i,
                swingLevel: swingHigh.price,
                sweepExtreme: bar.high,
                sweepDepth: parseFloat(sweepDepth.toFixed(4)),
                wickRatio: parseFloat(Math.min(wickRatio, 10).toFixed(2)),
                volumeSpikeRatio: parseFloat(volumeSpikeRatio.toFixed(2)),
                hasVolume,
                displacementStrength: displacement.strength,
                direction: 'bearish',
            });
        }
    }

    const allSweeps = [...bullishSweeps, ...bearishSweeps];
    const detected = allSweeps.length > 0;

    // Scoring: depth (30%) + volume (25%) + displacement (25%) + wick ratio (20%)
    let strength = 0;
    if (detected) {
        const best = allSweeps.reduce((a, b) => scoreSweep(a) > scoreSweep(b) ? a : b);
        strength = scoreSweep(best);
    }

    const score = detected ? Math.min(strength, 1.0) : neutralDefault;

    return {
        score: parseFloat(score.toFixed(4)),
        raw: {
            bullishSweeps,
            bearishSweeps,
            detected,
            strength: parseFloat(strength.toFixed(4)),
            sweepCount: allSweeps.length,
        },
        meta: { swingLookback, confirmBars, approachBars },
    };
}

/**
 * Score an individual sweep on 4 factors.
 */
function scoreSweep(sweep) {
    const depthScore = Math.min(sweep.sweepDepth / 1.5, 1.0);
    const volumeScore = sweep.hasVolume ? Math.min(sweep.volumeSpikeRatio / 3, 1.0) : 0.2;
    const dispScore = sweep.displacementStrength;
    const wickScore = Math.min(sweep.wickRatio / 3, 1.0);

    return depthScore * 0.30 + volumeScore * 0.25 + dispScore * 0.25 + wickScore * 0.20;
}

/**
 * Check if price was approaching a level in the bars before the sweep.
 * "Approaching" means bars were trading within approachDistanceATR of the level,
 * moving toward it — NOT gapping through from far away.
 *
 * @param {'below'|'above'} side — which side of the level to check approach from
 */
function checkApproach(bars, sweepIndex, level, side, approachBars, atr, approachDistanceATR) {
    const maxDist = atr * approachDistanceATR;
    let nearCount = 0;
    let movingToward = false;

    for (let j = Math.max(0, sweepIndex - approachBars); j < sweepIndex; j++) {
        const dist = side === 'below'
            ? bars[j].low - level   // positive = above the level (approaching from above)
            : level - bars[j].high; // positive = below the level (approaching from below)

        if (dist >= 0 && dist <= maxDist) {
            nearCount++;
        }
    }

    // At least 2 of the preceding bars must be near the level
    if (nearCount >= 2) movingToward = true;
    return movingToward;
}

/**
 * Check for displacement confirmation after the sweep candle.
 * A displacement candle has:
 *   - Body > 60% of range (strong directional commitment)
 *   - Range > 1.0× ATR (significant move, not just noise)
 *   - Closes in the expected direction (higher for bullish, lower for bearish)
 *
 * This is stricter than "any close higher" — it requires institutional-grade
 * follow-through, not just a doji or small candle.
 *
 * @returns {{ confirmed: boolean, strength: number }}
 */
function checkDisplacementConfirmation(bars, sweepIndex, atr, confirmBars, direction) {
    for (let j = 1; j <= confirmBars && sweepIndex + j < bars.length; j++) {
        const bar = bars[sweepIndex + j];
        const range = bar.high - bar.low;
        if (range === 0) continue;

        const body = Math.abs(bar.close - bar.open);
        const bodyRatio = body / range;
        const rangeToATR = range / atr;
        const correctDirection = direction === 'bullish'
            ? bar.close > bar.open  // bullish candle
            : bar.close < bar.open; // bearish candle

        if (bodyRatio > 0.6 && rangeToATR > 1.0 && correctDirection) {
            // Strength: how impulsive was the displacement?
            const strength = Math.min((rangeToATR - 1.0) / 2.0, 1.0);
            return { confirmed: true, strength: parseFloat(strength.toFixed(3)) };
        }
    }

    return { confirmed: false, strength: 0 };
}

/**
 * Find swing lows: a bar whose low is lower than N/2 bars on each side.
 */
function findSwingLows(bars, lookback) {
    const swings = [];
    const halfLook = Math.floor(lookback / 2);
    if (halfLook < 1) return swings;

    for (let i = halfLook; i < bars.length - halfLook; i++) {
        let isSwingLow = true;
        for (let j = i - halfLook; j <= i + halfLook; j++) {
            if (j === i) continue;
            if (bars[j].low <= bars[i].low) {
                isSwingLow = false;
                break;
            }
        }
        if (isSwingLow) {
            swings.push({ price: bars[i].low, index: i });
        }
    }
    return swings;
}

/**
 * Find swing highs: a bar whose high is higher than N/2 bars on each side.
 */
function findSwingHighs(bars, lookback) {
    const swings = [];
    const halfLook = Math.floor(lookback / 2);
    if (halfLook < 1) return swings;

    for (let i = halfLook; i < bars.length - halfLook; i++) {
        let isSwingHigh = true;
        for (let j = i - halfLook; j <= i + halfLook; j++) {
            if (j === i) continue;
            if (bars[j].high >= bars[i].high) {
                isSwingHigh = false;
                break;
            }
        }
        if (isSwingHigh) {
            swings.push({ price: bars[i].high, index: i });
        }
    }
    return swings;
}

module.exports = { computeLiquiditySweep, findSwingLows, findSwingHighs, checkApproach, checkDisplacementConfirmation, scoreSweep };
