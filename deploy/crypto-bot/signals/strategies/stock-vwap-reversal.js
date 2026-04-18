'use strict';

/**
 * VWAP Reversal strategy — mean-reversion entry for stocks.
 *
 * Entry: price drops below VWAP lower band (1.5σ) with RSI oversold.
 * Target: VWAP midline (mean reversion).
 *
 * [v24.3] ATR-based stops with VWAP-relative targets:
 *   Stop:   max(2.0 × ATR, 1% of price) — wider than momentum (mean-reversion
 *           needs room to breathe at extremes)
 *   Target: VWAP midline (structural mean — not an arbitrary multiple)
 *   R:R:    must be >= 1.5 after ATR stop calculation (rejects setups too close to VWAP)
 *   Cap:    stop never wider than 5% (position sizing safety)
 *
 * Conditions (all required):
 *   1. currentPrice < vwapLowerBand
 *   2. RSI < 40
 *   3. volumeRatio >= 0.8
 *   4. SPY bullish (broad market supports longs)
 *   5. Price above daily SMA50 (structural uptrend — not catching falling knives)
 *      Skipped if sma50daily is null (daily data unavailable).
 *   6. R:R >= 1.5 (ATR-based stop to VWAP target)
 *
 * Source: theplus-bot backtested 52.69% CAGR, Sharpe 3.48.
 */

const VWAP_REV_CONFIG = {
    atrStopMultiplier: 2.0,   // wider than momentum — mean-reversion needs room
    minStopPct: 0.01,         // 1% floor
    maxStopPct: 0.05,         // 5% cap
    minRewardRisk: 1.5,       // minimum R:R to enter
};

module.exports = {
    name: 'stockVwapReversal',
    assetClass: 'stock',
    regimes: ['ranging', 'pullback', 'opening-range', 'any'],

    _config: VWAP_REV_CONFIG,

    evaluate(bars, context) {
        if (!context || context.vwap == null || context.vwapLowerBand == null) {
            return { killedBy: 'no_vwap_data' };
        }
        if (context.atr == null) {
            return { killedBy: 'no_atr' };
        }

        const {
            currentPrice, vwap, vwapLowerBand, rsi, volumeRatio,
            atr, atrPct, spyBullish, sma50daily, percentChange,
        } = context;

        // 1. Price must be below VWAP lower band
        if (currentPrice >= vwapLowerBand) {
            return { killedBy: 'price_above_vwap_lower_band' };
        }

        // 2. RSI must confirm oversold condition
        if (rsi == null || rsi >= 40) {
            return { killedBy: 'rsi_not_oversold' };
        }

        // 3. Minimum volume
        if (volumeRatio == null || volumeRatio < 0.8) {
            return { killedBy: 'low_volume' };
        }

        // 4. SPY must be bullish
        if (spyBullish === false) {
            return { killedBy: 'spy_bearish' };
        }

        // 5. Structural uptrend (skip if unavailable)
        if (sma50daily != null && currentPrice < sma50daily) {
            return { killedBy: 'below_sma50' };
        }

        // 6. ATR-based stop + VWAP target
        const computedAtrPct = atrPct || (currentPrice > 0 ? atr / currentPrice : 0);
        let stopPct = Math.min(
            Math.max(computedAtrPct * VWAP_REV_CONFIG.atrStopMultiplier, VWAP_REV_CONFIG.minStopPct),
            VWAP_REV_CONFIG.maxStopPct
        );

        const stopLoss = currentPrice - (currentPrice * stopPct);
        const takeProfit = vwap; // Mean reversion target: VWAP midline
        const risk = currentPrice - stopLoss;
        const reward = takeProfit - currentPrice;

        if (risk <= 0 || reward / risk < VWAP_REV_CONFIG.minRewardRisk) {
            return { killedBy: 'insufficient_reward_risk' };
        }

        const rewardRisk = reward / risk;

        // Score — weights: oversold depth 35%, VWAP distance 25%, volume 20%, regime 20%
        const normOversold = Math.min((40 - rsi) / 20, 1.0);
        const normVwapDist = vwapLowerBand > 0
            ? Math.min(Math.abs(currentPrice - vwapLowerBand) / (vwapLowerBand * 0.02), 1.0)
            : 0;
        const normVolume = Math.min((volumeRatio || 0) / 2, 1.0);
        const normRegime = context.regimeQuality != null ? context.regimeQuality : 0.5;
        const score = normOversold * 0.35 + normVwapDist * 0.25 + normVolume * 0.20 + normRegime * 0.20;

        return {
            candidate: {
                price: currentPrice,
                percentChange: percentChange != null ? parseFloat(Number(percentChange).toFixed(2)) : 0,
                volumeRatio: volumeRatio != null ? parseFloat(Number(volumeRatio).toFixed(2)) : 0,
                rsi: rsi != null ? parseFloat(Number(rsi).toFixed(2)) : null,
                vwap: vwap != null ? parseFloat(Number(vwap).toFixed(2)) : null,
                tier: 'tier1',
                score: parseFloat(score.toFixed(3)),
                strategy: 'stockVwapReversal',
                regime: 'mean-reversion',
                stopLoss: parseFloat(stopLoss.toFixed(2)),
                takeProfit: parseFloat(takeProfit.toFixed(2)),
                stopLossPercent: parseFloat((stopPct * 100).toFixed(2)),
                profitTargetPercent: parseFloat((reward / currentPrice * 100).toFixed(2)),
                rewardRisk: parseFloat(rewardRisk.toFixed(2)),
                atrBased: true,
            },
        };
    },
};
