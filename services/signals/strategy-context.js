// services/signals/strategy-context.js
'use strict';

const indicators = require('./indicators');

/**
 * Compute indicators strategies might need.
 * Pure function — no I/O, no side effects, deterministic output.
 *
 * IMPORTANT: indicators.js functions take arrays of CLOSES (numbers),
 * not bar objects. We extract closes once and pass it around.
 *
 * NOTE: ADX and ATR are NOT computed in Plan 1 — they live inline in the
 * stock bot and will be ported to indicators.js in Plan 3 when ORB needs them.
 *
 * @param {Array<{t,o,h,l,c,v}>} bars — OHLCV bars ordered ascending by time
 * @param {string} marketRegime — current regime from SPY detection
 * @returns {Object|null} context or null if insufficient input
 */
function computeContext(bars, marketRegime) {
    if (!Array.isArray(bars) || bars.length === 0) return null;

    const last = bars[bars.length - 1];
    const first = bars[0];
    const currentPrice = last.c;
    const todayOpen = first.o;
    const volumeToday = bars.reduce((s, b) => s + (b.v || 0), 0);
    const percentChange = todayOpen > 0 ? ((currentPrice - todayOpen) / todayOpen) * 100 : 0;

    // Extract closes once — indicators.js expects numbers, not bar objects.
    const closes = bars.map(b => b.c);

    // EMAs — return null if insufficient data.
    const ema9 = indicators.calculateEMA(closes, 9);
    const ema21 = indicators.calculateEMA(closes, 21);

    // RSI — returns 50 on insufficient data (NOT null), per indicators.js:45.
    // Callers must NOT treat 50 as "null"; use it as-is.
    const rsi = indicators.calculateRSI(closes, 14);

    // RSI(2) — short-period RSI for mean-reversion strategies.
    // Needs period+1 bars minimum; return null explicitly if fewer.
    const rsi2 = closes.length >= 3
        ? indicators.calculateRSI(closes, 2)
        : null;

    // MACD — returns {macd, signal, histogram, prevHistogram, bullish, bearish} or null.
    // Needs at least slow + signal = 26 + 9 = 35 bars to produce a value.
    const macd = indicators.calculateMACD(closes);

    // ATR — measures volatility from bar highs/lows/closes.
    const atr = indicators.calculateATR(bars);
    const atrPct = atr !== null && currentPrice > 0 ? atr / currentPrice : null;

    // VWAP with bands — for mean-reversion strategies (buy below lower band).
    const vwapData = indicators.calculateVWAPWithBands(bars);
    const vwap = vwapData ? vwapData.vwap : null;
    const vwapLowerBand = vwapData ? vwapData.lowerBand : null;
    const vwapUpperBand = vwapData ? vwapData.upperBand : null;

    // Daily range position
    const dailyHigh = Math.max(...bars.map(b => b.h));
    const dailyLow = Math.min(...bars.map(b => b.l));
    const dailyRange = dailyHigh - dailyLow;
    const positionInDailyRange = dailyRange > 0 ? (currentPrice - dailyLow) / dailyRange : null;

    // Derived flags
    const belowVwap = vwap !== null && currentPrice < vwap;
    const emaUptrend = (ema9 !== null && ema21 !== null) ? ema9 > ema21 : null;

    return {
        // Price/volume
        currentPrice,
        todayOpen,
        volumeToday,
        percentChange,
        dailyHigh,
        dailyLow,
        // Indicators
        vwap,
        vwapLowerBand,
        vwapUpperBand,
        ema9,
        ema21,
        rsi,
        rsi2,
        macd,
        atr,
        atrPct,
        // Derived
        belowVwap,
        emaUptrend,
        positionInDailyRange,
        // Market state
        marketRegime: marketRegime || null,
    };
}

module.exports = { computeContext };
