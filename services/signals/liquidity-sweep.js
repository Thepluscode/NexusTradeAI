'use strict';

/**
 * Liquidity Sweep Detection — identifies stop hunts at key levels.
 *
 * A liquidity sweep occurs when price briefly pierces a support/resistance
 * level (where stop losses cluster), then reverses — indicating institutional
 * accumulation/distribution. This is a high-probability reversal signal.
 *
 * Bullish sweep (buy signal):
 *   1. Price sweeps below a recent swing low (stop hunt below support)
 *   2. Wick extends below the low but body closes above it
 *   3. Subsequent candle confirms reversal (closes higher)
 *
 * Bearish sweep (sell signal):
 *   1. Price sweeps above a recent swing high (stop hunt above resistance)
 *   2. Wick extends above the high but body closes below it
 *   3. Subsequent candle confirms reversal (closes lower)
 *
 * Scoring:
 *   - Sweep depth (how far past the level): deeper = stronger
 *   - Recovery speed (how quickly price recovered): faster = stronger
 *   - Volume confirmation: high volume on sweep candle = stronger
 *   - Multiple sweeps in same area: stronger signal
 *
 * @param {Array<{open,high,low,close,volume}>} bars — OHLCV bars (normalized)
 * @param {Object} config
 * @param {number} config.swingLookback — bars to find swing highs/lows (default 10)
 * @param {number} config.confirmBars — bars after sweep to confirm reversal (default 2)
 * @param {number} config.minSweepATRRatio — minimum sweep depth as ATR fraction (default 0.3)
 * @param {number} config.neutralDefault — score when no sweep detected (default 0.3)
 * @returns {{ score: number, raw: Object, meta: Object }}
 */
function computeLiquiditySweep(bars, atr, config = {}) {
    const {
        swingLookback = 10,
        confirmBars = 2,
        minSweepATRRatio = 0.3,
        neutralDefault = 0.3,
    } = config;

    if (!bars || bars.length < swingLookback + confirmBars + 3 || !atr || atr <= 0) {
        return {
            score: neutralDefault,
            raw: { bullishSweeps: [], bearishSweeps: [], detected: false, strength: 0 },
            meta: {},
        };
    }

    // Step 1: Find swing lows and swing highs in the lookback window
    const swingLows = findSwingLows(bars, swingLookback);
    const swingHighs = findSwingHighs(bars, swingLookback);

    const bullishSweeps = [];
    const bearishSweeps = [];

    // Step 2: Check recent bars for sweeps of those levels
    // Only check the last (confirmBars + 3) bars for fresh sweeps
    const checkStart = Math.max(swingLookback, bars.length - (confirmBars + 5));

    for (let i = checkStart; i < bars.length - confirmBars; i++) {
        const bar = bars[i];

        // Bullish sweep: wick below swing low, body closes above
        for (const swingLow of swingLows) {
            if (swingLow.index >= i) continue; // swing must be before current bar
            if (bar.low < swingLow.price && bar.close > swingLow.price) {
                const sweepDepth = (swingLow.price - bar.low) / atr;
                if (sweepDepth < minSweepATRRatio) continue;

                // Check reversal confirmation: next N bars should close higher
                let confirmed = false;
                for (let j = 1; j <= confirmBars && i + j < bars.length; j++) {
                    if (bars[i + j].close > bar.close) {
                        confirmed = true;
                        break;
                    }
                }

                if (confirmed) {
                    const wickRatio = bar.close - bar.open !== 0
                        ? (swingLow.price - bar.low) / Math.abs(bar.close - bar.open)
                        : 1.0;
                    bullishSweeps.push({
                        barIndex: i,
                        swingLevel: swingLow.price,
                        sweepLow: bar.low,
                        sweepDepth,
                        wickRatio: Math.min(wickRatio, 5),
                        direction: 'bullish',
                    });
                }
            }
        }

        // Bearish sweep: wick above swing high, body closes below
        for (const swingHigh of swingHighs) {
            if (swingHigh.index >= i) continue;
            if (bar.high > swingHigh.price && bar.close < swingHigh.price) {
                const sweepDepth = (bar.high - swingHigh.price) / atr;
                if (sweepDepth < minSweepATRRatio) continue;

                let confirmed = false;
                for (let j = 1; j <= confirmBars && i + j < bars.length; j++) {
                    if (bars[i + j].close < bar.close) {
                        confirmed = true;
                        break;
                    }
                }

                if (confirmed) {
                    const wickRatio = bar.close - bar.open !== 0
                        ? (bar.high - swingHigh.price) / Math.abs(bar.close - bar.open)
                        : 1.0;
                    bearishSweeps.push({
                        barIndex: i,
                        swingLevel: swingHigh.price,
                        sweepHigh: bar.high,
                        sweepDepth,
                        wickRatio: Math.min(wickRatio, 5),
                        direction: 'bearish',
                    });
                }
            }
        }
    }

    const allSweeps = [...bullishSweeps, ...bearishSweeps];
    const detected = allSweeps.length > 0;

    // Graded scoring: depth (50%) + wick ratio (30%) + recency (20%)
    let strength = 0;
    if (detected) {
        const best = allSweeps.reduce((a, b) => a.sweepDepth > b.sweepDepth ? a : b);
        const depthScore = Math.min(best.sweepDepth / 1.5, 1.0);  // caps at 1.5x ATR sweep
        const wickScore = Math.min(best.wickRatio / 3, 1.0);       // caps at 3:1 wick:body
        const recency = 1 - (bars.length - 1 - best.barIndex) / bars.length;
        strength = depthScore * 0.5 + wickScore * 0.3 + recency * 0.2;
    }

    const score = detected ? 0.3 + strength * 0.7 : neutralDefault;

    return {
        score: parseFloat(score.toFixed(4)),
        raw: {
            bullishSweeps,
            bearishSweeps,
            detected,
            strength: parseFloat(strength.toFixed(4)),
            sweepCount: allSweeps.length,
        },
        meta: { swingLookback, confirmBars },
    };
}

/**
 * Find swing lows: a bar whose low is lower than N bars on each side.
 */
function findSwingLows(bars, lookback) {
    const swings = [];
    const halfLook = Math.floor(lookback / 2);
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
 * Find swing highs: a bar whose high is higher than N bars on each side.
 */
function findSwingHighs(bars, lookback) {
    const swings = [];
    const halfLook = Math.floor(lookback / 2);
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

module.exports = { computeLiquiditySweep, findSwingLows, findSwingHighs };
