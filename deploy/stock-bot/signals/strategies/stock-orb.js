'use strict';

/**
 * Opening Range Breakout (ORB) strategy — momentum entry for stocks.
 *
 * Entry: price breaks above the 15-minute opening range high with volume surge.
 * Target: +5.0% (2:1 R:R vs 2.5% stop).
 * Stop: 2.5% below entry (adapted for opening-range volatility).
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
 *
 * Source: extracted from unified-trading-bot.js:1572-1647 (buildOpeningRangeBreakoutCandidate).
 * Live performance: 36.9% WR, nearly breakeven (-$6.37) as of Apr 2026.
 * Lives alongside stock-vwap-reversal.js in the strategy registry.
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
    stopLossPct: 0.025,
    profitTargetPct: 0.050,
    maxRecentBarsForConfirmation: 3,
    minBullishRecentBars: 2,
};

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

    // Exported for tests — allows override of "now"
    _isInORBWindow: isInORBWindow,
    _config: ORB_CONFIG,

    evaluate(bars, context) {
        if (!context) return { killedBy: 'no_context' };

        // 0. Time window gate (unless context supplies orbWindowOverride for tests/shadow mode)
        const orbWindowCheck = context.orbWindowOverride != null
            ? context.orbWindowOverride
            : isInORBWindow(context.now);
        if (!orbWindowCheck) return { killedBy: 'outside_orb_window' };

        // 1. Need enough bars: 15 opening + 3 confirmation
        if (!Array.isArray(bars) || bars.length < ORB_CONFIG.openingRangeMinutes + 3) {
            return { killedBy: 'insufficient_bars' };
        }

        const openingBars = bars.slice(0, ORB_CONFIG.openingRangeMinutes);
        const openingHigh = Math.max(...openingBars.map(b => b.h));
        const current = context.currentPrice;

        if (current == null || !isFinite(current)) return { killedBy: 'no_current_price' };

        // 2. Breakout trigger with buffer
        const buffer = Math.max(ORB_CONFIG.breakoutBufferDollars, openingHigh * ORB_CONFIG.breakoutBufferPct);
        const breakoutTrigger = openingHigh + buffer;
        if (current <= breakoutTrigger) return { killedBy: 'no_breakout' };

        // 3. Breakout magnitude sanity
        const breakoutPct = (current - breakoutTrigger) / openingHigh;
        if (breakoutPct <= 0 || breakoutPct > ORB_CONFIG.maxBreakoutPct) {
            return { killedBy: 'breakout_out_of_range' };
        }

        // 4. Recent bars bullish confirmation
        const recentBars = bars.slice(-ORB_CONFIG.maxRecentBarsForConfirmation);
        const bullishCloses = recentBars.filter(b => b.c > b.o).length;
        if (bullishCloses < ORB_CONFIG.minBullishRecentBars) {
            return { killedBy: 'insufficient_bullish_bars' };
        }

        // 5. Volume surge
        const avgOpeningVol = openingBars.reduce((s, b) => s + b.v, 0) / openingBars.length;
        const avgRecentVol = recentBars.reduce((s, b) => s + b.v, 0) / recentBars.length;
        const volRatio = avgOpeningVol > 0 ? avgRecentVol / avgOpeningVol : 0;
        if (volRatio < ORB_CONFIG.minBreakoutVolumeRatio) return { killedBy: 'low_volume_surge' };

        // 6. VWAP gate
        if (context.vwap != null && current < context.vwap) {
            return { killedBy: 'below_vwap' };
        }

        // 7. RSI window
        const rsi = context.rsi;
        if (rsi == null || rsi < ORB_CONFIG.rsiMin || rsi > ORB_CONFIG.rsiMax) {
            return { killedBy: 'rsi_out_of_range' };
        }

        // Score components — all normalised to [0,1]
        const normBreakout = Math.min(breakoutPct / 0.05, 1.0);
        const normVolume = Math.min(volRatio / 4, 1.0);
        const rsiBonus = 1 + Math.max(0, 1 - Math.abs(rsi - 60) / 20) * 0.15;
        const normRsi = (rsiBonus - 1.0) / 0.15;
        // Regime quality passed via context (set by caller from regime detector)
        const normRegime = context.regimeQuality != null ? context.regimeQuality : 0.5;

        const score = (normBreakout * 0.35 + normVolume * 0.30 + normRsi * 0.20 + normRegime * 0.15);

        const stopLoss = current * (1 - ORB_CONFIG.stopLossPct);
        const takeProfit = current * (1 + ORB_CONFIG.profitTargetPct);

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
                openingRangeHigh: parseFloat(openingHigh.toFixed(2)),
                breakoutTrigger: parseFloat(breakoutTrigger.toFixed(2)),
            },
        };
    },
};
