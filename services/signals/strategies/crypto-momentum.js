'use strict';

/**
 * Crypto momentum strategy — tier-based entry on price momentum.
 *
 * Tiers distinguish entry strength and risk appetite:
 *   tier1: standard momentum (≥0.5% move, 7% stop, 14% target, 2:1 R:R)
 *   tier2: high momentum    (≥1.5%, 8% stop, 16% target)
 *   tier3: extreme momentum (≥3.0%, 8% stop, 16% target)
 *
 * Conditions (all required for a tier to fire):
 *   1. Price momentum (percentChange) >= tier's momentumThreshold
 *   2. Price above EMA9 and SMA20 (short-term uptrend)
 *   3. RSI within tier's [rsiLower, rsiUpper] range
 *   4. Volume ratio >= 1.2 (surge confirmation)
 *   5. BTC trend is bullish OR symbol is BTC itself (guards altcoin longs)
 *
 * Source: extracted from unified-crypto-bot.js momentum tier config (~line 878).
 * Live performance: 34% WR, +$20.49 as of Apr 2026 (crypto's most profitable strategy).
 */

const TIER_CONFIG = {
    tier1: {
        name: 'Standard Crypto',
        momentumThreshold: 0.005,
        stopLossPct: 0.07,
        profitTargetPct: 0.14,
        rsiLower: 30,
        rsiUpper: 70,
        tierWeight: 1.3,
    },
    tier2: {
        name: 'High Momentum',
        momentumThreshold: 0.015,
        stopLossPct: 0.08,
        profitTargetPct: 0.16,
        rsiLower: 35,
        rsiUpper: 75,
        tierWeight: 1.9,
    },
    tier3: {
        name: 'Extreme Momentum',
        momentumThreshold: 0.03,
        stopLossPct: 0.08,
        profitTargetPct: 0.16,
        rsiLower: 35,
        rsiUpper: 80,
        tierWeight: 2.6,
    },
};

const MIN_VOLUME_RATIO = 1.2;

// Pick the highest tier whose threshold is satisfied
function selectTier(momentumFraction, rsi) {
    const tiers = ['tier3', 'tier2', 'tier1']; // check strongest first
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
            ema9, sma20, btcBullish, isBtc,
        } = context;

        if (currentPrice == null || !isFinite(currentPrice)) {
            return { killedBy: 'no_current_price' };
        }

        // Convert percentChange (%) to fraction (e.g., 1.5 → 0.015)
        const momentumFrac = percentChange != null ? percentChange / 100 : 0;

        // 1. BTC trend gate — block altcoin longs when BTC is bearish
        if (btcBullish === false && !isBtc) {
            return { killedBy: 'btc_bearish' };
        }

        // 2. Trend structure: price > EMA9 > SMA20 (if both provided)
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
        const stopLoss = currentPrice * (1 - cfg.stopLossPct);
        const takeProfit = currentPrice * (1 + cfg.profitTargetPct);

        // Score: tier-weighted momentum × volume × RSI sweetness
        const rsiSweet = (rsi >= 45 && rsi <= 70) ? 1.08 : 1.0;
        const momComp = Math.max(0.5, momentumFrac * 10);
        const volComp = Math.max(1, volumeRatio);
        const rawScore = cfg.tierWeight * 1.25 * momComp * volComp * rsiSweet;
        // Normalise to [0, 1]
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
                stopLossPercent: cfg.stopLossPct * 100,
                profitTargetPercent: cfg.profitTargetPct * 100,
            },
        };
    },
};
