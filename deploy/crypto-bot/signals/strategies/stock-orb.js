'use strict';

/**
 * Opening Range Breakout (ORB) strategy — momentum entry for stocks.
 *
 * Entry: price breaks above the 15-minute opening range high with volume surge.
 *
 * [v24.3] ATR-based stops — adapts to each stock's actual volatility.
 *   Stop:   max(1.5 × ATR, 1% of price) — wide enough to avoid noise shakeouts
 *   Target: stop_distance × R:R multiplier (dynamic 2.0-3.0 based on ATR%)
 *   - Low volatility  (ATR% < 0.5%): R:R = 3.0 (tight stop, wide target)
 *   - Normal volatility (0.5-1.5%):  R:R = 2.5
 *   - High volatility (> 1.5%):      R:R = 2.0 (wider stop, proportional target)
 *
 * Previous: fixed 2.5% stop / 5.0% target — caused premature stops on volatile
 * stocks and missed targets on low-vol stocks.
 *
 * Conditions (all required):
 *   1. In the ORB entry window (after 15min opening range, before 11:00 EST)
 *   2. ≥18 bars available (15 opening + 3 breakout confirmation)
 *   3. Current price breaks above opening range high + buffer (0.10 USD or 0.1%)
 *   4. Breakout magnitude 0% < pct ≤ 3% (not overextended chase)
 *   5. ≥2 of last 3 bars are bullish (close > open)
 *   6. Recent 3-bar avg volume ≥ 1.8× opening-range avg volume
 *   7. Price at/above VWAP
 *   8. RSI in [48, 68] (not oversold, not overbought)
 *   9. ATR available for stop calculation (context.atr or context.atrPct)
 *
 * Source: extracted from unified-trading-bot.js.
 */

const ORB_CONFIG = {
    openingRangeMinutes: 15,
    entryCutoffHour: 11,
    breakoutBufferDollars: 0.10,
    breakoutBufferPct: 0.001,
    minBreakoutVolumeRatio: 1.8,
    rsiMin: 48,
    rsiMax: 68,
    maxBreakoutPct: 0.03,
    // ATR-based stop/target (replaces fixed 2.5%/5.0%)
    atrStopMultiplier: 1.5,      // stop = 1.5× ATR below entry
    minStopPct: 0.01,            // floor: at least 1% stop distance
    maxStopPct: 0.06,            // cap: never wider than 6%
    maxRecentBarsForConfirmation: 3,
    minBullishRecentBars: 2,
};

/**
 * Dynamic R:R based on volatility regime.
 * Low vol = wider R:R (let winners run), high vol = tighter R:R (take profits faster).
 */
function dynamicRewardRisk(atrPct) {
    if (atrPct == null || atrPct <= 0) return 2.5; // default
    if (atrPct < 0.005) return 3.0;   // low vol: tight stop, wide target
    if (atrPct > 0.015) return 2.0;   // high vol: wider stop, proportional target
    // Linear interpolation between 3.0 and 2.0
    return 3.0 - ((atrPct - 0.005) / (0.015 - 0.005)) * 1.0;
}

function isInORBWindow(now) {
    if (!now) now = new Date();
    const isMarketDay = now.getDay() >= 1 && now.getDay() <= 5;
    if (!isMarketDay) return false;
    const timeInMinutes = now.getHours() * 60 + now.getMinutes();
    const marketOpen = 9 * 60 + 30;
    const orbEnd = marketOpen + ORB_CONFIG.openingRangeMinutes;
    const entryCutoff = ORB_CONFIG.entryCutoffHour * 60;
    return timeInMinutes >= orbEnd && timeInMinutes <= entryCutoff;
}

module.exports = {
    name: 'stockOrb',
    assetClass: 'stock',
    regimes: ['opening-range', 'any'],

    _isInORBWindow: isInORBWindow,
    _config: ORB_CONFIG,
    _dynamicRewardRisk: dynamicRewardRisk,

    evaluate(bars, context) {
        if (!context) return { killedBy: 'no_context' };

        const orbWindowCheck = context.orbWindowOverride != null
            ? context.orbWindowOverride
            : isInORBWindow(context.now);
        if (!orbWindowCheck) return { killedBy: 'outside_orb_window' };

        if (!Array.isArray(bars) || bars.length < ORB_CONFIG.openingRangeMinutes + 3) {
            return { killedBy: 'insufficient_bars' };
        }

        const openingBars = bars.slice(0, ORB_CONFIG.openingRangeMinutes);
        const openingHigh = Math.max(...openingBars.map(b => b.h));
        const current = context.currentPrice;

        if (current == null || !isFinite(current)) return { killedBy: 'no_current_price' };

        // Breakout trigger with buffer
        const buffer = Math.max(ORB_CONFIG.breakoutBufferDollars, openingHigh * ORB_CONFIG.breakoutBufferPct);
        const breakoutTrigger = openingHigh + buffer;
        if (current <= breakoutTrigger) return { killedBy: 'no_breakout' };

        // Breakout magnitude sanity
        const breakoutPct = (current - breakoutTrigger) / openingHigh;
        if (breakoutPct <= 0 || breakoutPct > ORB_CONFIG.maxBreakoutPct) {
            return { killedBy: 'breakout_out_of_range' };
        }

        // Recent bars bullish confirmation
        const recentBars = bars.slice(-ORB_CONFIG.maxRecentBarsForConfirmation);
        const bullishCloses = recentBars.filter(b => b.c > b.o).length;
        if (bullishCloses < ORB_CONFIG.minBullishRecentBars) {
            return { killedBy: 'insufficient_bullish_bars' };
        }

        // Volume surge
        const avgOpeningVol = openingBars.reduce((s, b) => s + b.v, 0) / openingBars.length;
        const avgRecentVol = recentBars.reduce((s, b) => s + b.v, 0) / recentBars.length;
        const volRatio = avgOpeningVol > 0 ? avgRecentVol / avgOpeningVol : 0;
        if (volRatio < ORB_CONFIG.minBreakoutVolumeRatio) return { killedBy: 'low_volume_surge' };

        // VWAP gate
        if (context.vwap != null && current < context.vwap) {
            return { killedBy: 'below_vwap' };
        }

        // RSI window
        const rsi = context.rsi;
        if (rsi == null || rsi < ORB_CONFIG.rsiMin || rsi > ORB_CONFIG.rsiMax) {
            return { killedBy: 'rsi_out_of_range' };
        }

        // ATR-based stop/target
        const atr = context.atr;
        const atrPct = context.atrPct || (atr && current > 0 ? atr / current : null);
        let stopDistance, stopPct;

        if (atr != null && atr > 0) {
            // ATR-based: stop = 1.5× ATR, floored at 1%, capped at 6%
            stopPct = Math.min(
                Math.max(atrPct * ORB_CONFIG.atrStopMultiplier, ORB_CONFIG.minStopPct),
                ORB_CONFIG.maxStopPct
            );
        } else {
            // Fallback when ATR unavailable: use 2% (conservative midpoint)
            stopPct = 0.02;
        }
        stopDistance = current * stopPct;

        const rr = dynamicRewardRisk(atrPct);
        const stopLoss = current - stopDistance;
        const takeProfit = current + (stopDistance * rr);

        // Score components — all normalised to [0,1]
        const normBreakout = Math.min(breakoutPct / 0.05, 1.0);
        const normVolume = Math.min(volRatio / 4, 1.0);
        const rsiBonus = 1 + Math.max(0, 1 - Math.abs(rsi - 60) / 20) * 0.15;
        const normRsi = (rsiBonus - 1.0) / 0.15;
        const normRegime = context.regimeQuality != null ? context.regimeQuality : 0.5;

        const score = (normBreakout * 0.35 + normVolume * 0.30 + normRsi * 0.20 + normRegime * 0.15);

        const percentChange = bars[0] && bars[0].o > 0
            ? ((current - bars[0].o) / bars[0].o) * 100
            : 0;

        return {
            candidate: {
                price: current,
                percentChange: parseFloat(percentChange.toFixed(2)),
                volumeRatio: parseFloat(volRatio.toFixed(2)),
                rsi: parseFloat(rsi.toFixed(2)),
                vwap: context.vwap != null ? parseFloat(Number(context.vwap).toFixed(2)) : null,
                tier: 'orb',
                score: parseFloat(score.toFixed(3)),
                strategy: 'stockOrb',
                regime: 'opening-range',
                stopLoss: parseFloat(stopLoss.toFixed(2)),
                takeProfit: parseFloat(takeProfit.toFixed(2)),
                stopLossPercent: parseFloat((stopPct * 100).toFixed(2)),
                profitTargetPercent: parseFloat((stopPct * rr * 100).toFixed(2)),
                rewardRisk: parseFloat(rr.toFixed(2)),
                openingRangeHigh: parseFloat(openingHigh.toFixed(2)),
                breakoutTrigger: parseFloat(breakoutTrigger.toFixed(2)),
                atrBased: atr != null,
            },
        };
    },
};
