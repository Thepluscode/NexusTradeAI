'use strict';

/**
 * VWAP Reversal strategy — mean-reversion entry for stocks.
 *
 * Entry: price drops below VWAP lower band (1.5σ) with RSI oversold.
 * Target: VWAP midline (mean reversion).
 * Stop: 2× ATR below entry.
 *
 * Conditions (all required):
 *   1. currentPrice < vwapLowerBand
 *   2. RSI < 40
 *   3. volumeRatio >= 0.8
 *   4. SPY bullish (broad market supports longs)
 *   5. Price above daily SMA50 (structural uptrend — not catching falling knives)
 *      Skipped if sma50daily is null (daily data unavailable).
 *   6. R:R >= 1.5 (stop = 2×ATR, target = VWAP midline)
 *
 * Source: theplus-bot backtested 52.69% CAGR, Sharpe 3.48.
 * Ported from global analyzeMomentum lines 3212-3281.
 */
module.exports = {
    name: 'stockVwapReversal',
    assetClass: 'stock',
    regimes: ['ranging', 'pullback', 'opening-range', 'any'],

    evaluate(bars, context) {
        // Null-safety — require minimum context fields
        if (!context || context.vwap == null || context.vwapLowerBand == null) {
            return { killedBy: 'no_vwap_data' };
        }
        if (context.atr == null) {
            return { killedBy: 'no_atr' };
        }

        const {
            currentPrice, vwap, vwapLowerBand, rsi, volumeRatio,
            atr, spyBullish, sma50daily, percentChange,
        } = context;

        // 1. Price must be below VWAP lower band (oversold relative to intraday mean)
        if (currentPrice >= vwapLowerBand) {
            return { killedBy: 'price_above_vwap_lower_band' };
        }

        // 2. RSI must confirm oversold condition
        if (rsi == null || rsi >= 40) {
            return { killedBy: 'rsi_not_oversold' };
        }

        // 3. Minimum volume — need liquidity to enter mean-reversion
        if (volumeRatio == null || volumeRatio < 0.8) {
            return { killedBy: 'low_volume' };
        }

        // 4. SPY must be bullish — don't mean-revert in a falling market
        if (spyBullish === false) {
            return { killedBy: 'spy_bearish' };
        }

        // 5. Structural uptrend — price above daily SMA50 (skip if unavailable)
        if (sma50daily != null && currentPrice < sma50daily) {
            return { killedBy: 'below_sma50' };
        }

        // 6. Risk/reward calculation
        const stopLoss = currentPrice - (atr * 2.0);
        const takeProfit = vwap; // Mean reversion target: VWAP midline
        const risk = currentPrice - stopLoss;
        const reward = takeProfit - currentPrice;

        if (risk <= 0 || reward / risk < 1.5) {
            return { killedBy: 'insufficient_reward_risk' };
        }

        // Score — weights: oversold depth 35%, VWAP distance 25%, volume 20%, regime 20%
        const normOversold = Math.min((40 - rsi) / 20, 1.0);
        const normVwapDist = vwapLowerBand > 0
            ? Math.min(Math.abs(currentPrice - vwapLowerBand) / (vwapLowerBand * 0.02), 1.0)
            : 0;
        const normVolume = Math.min((volumeRatio || 0) / 2, 1.0);
        const score = normOversold * 0.35 + normVwapDist * 0.25 + normVolume * 0.20 + 0.20;
        // The 0.20 regime placeholder — caller passes regime quality via context in future

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
            },
        };
    },
};
