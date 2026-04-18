'use strict';

/**
 * Crypto momentum strategy — tier-based entry on price momentum.
 *
 * [v24.3] ATR-based stops — adapts to each crypto pair's actual volatility.
 *   Stop:   max(1.5 × ATR, tier minimum floor) — wide enough for crypto noise
 *   Target: stop_distance × R:R multiplier (2.0 base, adjusted by tier)
 *
 * Previous: fixed 7-8% stops — insane for BTC (1% daily vol) but tight for
 * small-cap alts (10%+ daily vol). ATR-based stops size correctly for each pair.
 *
 * Tier minimum floors (prevent noise stops):
 *   tier1: 2% minimum stop   (stable majors like BTC, ETH)
 *   tier2: 3% minimum stop   (mid-cap momentum)
 *   tier3: 4% minimum stop   (high-momentum breakouts)
 *
 * Maximum stop cap: 10% — prevents single-trade catastrophe
 *
 * Tiers distinguish entry strength and risk appetite:
 *   tier1: standard momentum (≥0.5% move)
 *   tier2: high momentum    (≥1.5%)
 *   tier3: extreme momentum (≥3.0%)
 *
 * Conditions (all required for a tier to fire):
 *   1. Price momentum (percentChange) >= tier's momentumThreshold
 *   2. Price above EMA9 and SMA20 (short-term uptrend)
 *   3. RSI within tier's [rsiLower, rsiUpper] range
 *   4. Volume ratio >= 1.2 (surge confirmation)
 *   5. BTC trend is bullish OR symbol is BTC itself (guards altcoin longs)
 */

const TIER_CONFIG = {
    tier1: {
        name: 'Standard Crypto',
        momentumThreshold: 0.005,
        minStopPct: 0.02,          // 2% floor
        rsiLower: 30,
        rsiUpper: 70,
        tierWeight: 1.3,
        rrMultiplier: 2.0,         // 2:1 R:R
    },
    tier2: {
        name: 'High Momentum',
        momentumThreshold: 0.015,
        minStopPct: 0.03,          // 3% floor
        rsiLower: 35,
        rsiUpper: 75,
        tierWeight: 1.9,
        rrMultiplier: 2.0,
    },
    tier3: {
        name: 'Extreme Momentum',
        momentumThreshold: 0.03,
        minStopPct: 0.04,          // 4% floor
        rsiLower: 35,
        rsiUpper: 80,
        tierWeight: 2.6,
        rrMultiplier: 2.0,
    },
};

const ATR_STOP_MULTIPLIER = 1.5;   // stop = 1.5× ATR
const MAX_STOP_PCT = 0.10;         // 10% cap — never risk more than 10% per trade
const MIN_VOLUME_RATIO = 1.2;

function selectTier(momentumFraction, rsi) {
    const tiers = ['tier3', 'tier2', 'tier1'];
    for (const t of tiers) {
        const cfg = TIER_CONFIG[t];
        if (momentumFraction >= cfg.momentumThreshold
            && rsi >= cfg.rsiLower
            && rsi <= cfg.rsiUpper) {
            return t;
        }
    }
    return null;
}

module.exports = {
    name: 'cryptoMomentum',
    assetClass: 'crypto',
    regimes: ['trending', 'trend-expansion', 'intraday-momentum', 'any'],

    _tiers: TIER_CONFIG,
    _selectTier: selectTier,

    evaluate(bars, context) {
        if (!context) return { killedBy: 'no_context' };

        const {
            currentPrice, percentChange, rsi, volumeRatio,
            ema9, sma20, btcBullish, isBtc, atr, atrPct,
        } = context;

        if (currentPrice == null || !isFinite(currentPrice)) {
            return { killedBy: 'no_current_price' };
        }

        const momentumFrac = percentChange != null ? percentChange / 100 : 0;

        // 1. BTC trend gate
        if (btcBullish === false && !isBtc) {
            return { killedBy: 'btc_bearish' };
        }

        // 2. Trend structure: price > EMA9 > SMA20
        if (ema9 != null && sma20 != null) {
            if (!(currentPrice > ema9 && ema9 > sma20)) {
                return { killedBy: 'no_uptrend_structure' };
            }
        } else if (sma20 != null && currentPrice < sma20) {
            return { killedBy: 'below_sma20' };
        }

        // 3. Volume surge
        if (volumeRatio == null || volumeRatio < MIN_VOLUME_RATIO) {
            return { killedBy: 'low_volume' };
        }

        // 4. Tier selection based on momentum + RSI
        if (rsi == null) return { killedBy: 'no_rsi' };
        const tier = selectTier(momentumFrac, rsi);
        if (!tier) {
            if (momentumFrac < TIER_CONFIG.tier1.momentumThreshold) {
                return { killedBy: 'momentum_below_threshold' };
            }
            return { killedBy: 'rsi_out_of_tier_range' };
        }

        const cfg = TIER_CONFIG[tier];

        // ATR-based stop/target
        let stopPct;
        const computedAtrPct = atrPct || (atr && currentPrice > 0 ? atr / currentPrice : null);

        if (computedAtrPct != null && computedAtrPct > 0) {
            // ATR-based: 1.5× ATR, floored at tier minimum, capped at 10%
            stopPct = Math.min(
                Math.max(computedAtrPct * ATR_STOP_MULTIPLIER, cfg.minStopPct),
                MAX_STOP_PCT
            );
        } else {
            // Fallback: use tier minimum as default (conservative)
            stopPct = cfg.minStopPct;
        }

        const targetPct = stopPct * cfg.rrMultiplier;
        const stopLoss = currentPrice * (1 - stopPct);
        const takeProfit = currentPrice * (1 + targetPct);

        // Score: tier-weighted momentum × volume × RSI sweetness
        const rsiSweet = (rsi >= 45 && rsi <= 70) ? 1.08 : 1.0;
        const momComp = Math.max(0.5, momentumFrac * 10);
        const volComp = Math.max(1, volumeRatio);
        const rawScore = cfg.tierWeight * 1.25 * momComp * volComp * rsiSweet;
        const score = Math.min(rawScore / 10, 1.0);

        return {
            candidate: {
                price: currentPrice,
                momentum: momentumFrac,
                percentChange: parseFloat(Number(percentChange).toFixed(2)),
                volumeRatio: parseFloat(volumeRatio.toFixed(2)),
                rsi: parseFloat(rsi.toFixed(2)),
                tier,
                score: parseFloat(score.toFixed(3)),
                strategy: 'cryptoMomentum',
                regime: tier === 'tier3' ? 'trend-expansion' : 'trending',
                stopLoss: parseFloat(stopLoss.toFixed(8)),
                takeProfit: parseFloat(takeProfit.toFixed(8)),
                stopLossPercent: parseFloat((stopPct * 100).toFixed(2)),
                profitTargetPercent: parseFloat((targetPct * 100).toFixed(2)),
                rewardRisk: parseFloat(cfg.rrMultiplier.toFixed(2)),
                atrBased: computedAtrPct != null,
            },
        };
    },
};
