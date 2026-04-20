'use strict';

/**
 * Cross-Asset Signal Module — information beyond the chart you're trading.
 *
 * Provides 3 alpha sources that give each trade context from other markets:
 *
 * 1. VIX FEAR GAUGE — measures market-wide fear/complacency
 *    - VIX < 15: complacency → trend-following works, mean-reversion risky
 *    - VIX 15-25: normal → all strategies viable
 *    - VIX 25-35: elevated fear → reduce size, tighten stops
 *    - VIX > 35: crisis → sit out or trade very small
 *    - VIX term structure: contango (front < back) = normal, backwardation = panic
 *
 * 2. CORRELATION REGIME — are assets moving together or diverging?
 *    - High correlation (>0.7): market is risk-on/risk-off, diversification fails
 *    - Low correlation (<0.3): stock-picking works, individual signals matter more
 *    - BTC/SPY correlation: when high, crypto follows stocks (trade accordingly)
 *
 * 3. INTER-MARKET DIVERGENCE — when one market leads another
 *    - Bonds up + stocks up = normal bull market
 *    - Bonds up + stocks down = flight to safety (bearish for risk assets)
 *    - Dollar strength + commodities weakness = deflationary pressure
 *
 * @module cross-asset
 */

/**
 * Compute VIX fear gauge signal.
 * Uses VIX level to produce a risk adjustment factor.
 *
 * @param {number} vixLevel — current VIX value (e.g., 18.5)
 * @param {number|null} vixPrev — previous VIX value for change detection
 * @returns {{ score: number, riskMultiplier: number, zone: string, vixChange: number }}
 */
function computeVIXSignal(vixLevel, vixPrev = null) {
    if (vixLevel == null || vixLevel <= 0) {
        return { score: 0.5, riskMultiplier: 1.0, zone: 'unknown', vixChange: 0, present: false };
    }

    let zone, riskMultiplier, score;

    if (vixLevel < 15) {
        zone = 'complacent';
        riskMultiplier = 1.1;   // calm → slightly larger positions
        score = 0.7;            // favorable for trend-following
    } else if (vixLevel < 25) {
        zone = 'normal';
        riskMultiplier = 1.0;
        score = 0.6;
    } else if (vixLevel < 35) {
        zone = 'elevated';
        riskMultiplier = 0.6;   // fear → smaller positions
        score = 0.3;            // unfavorable — many false breakouts
    } else {
        zone = 'crisis';
        riskMultiplier = 0.3;   // extreme fear → minimal exposure
        score = 0.1;            // only the strongest setups
    }

    // VIX spike detection: sudden jump = panic, sudden drop = opportunity
    const vixChange = vixPrev != null && vixPrev > 0
        ? (vixLevel - vixPrev) / vixPrev
        : 0;

    // VIX spike > 20% in one period = crisis acceleration
    if (vixChange > 0.20) {
        riskMultiplier *= 0.5;
        score = Math.max(score - 0.2, 0);
    }
    // VIX crash > 15% = fear subsiding rapidly (bullish)
    if (vixChange < -0.15) {
        score = Math.min(score + 0.15, 1.0);
    }

    return {
        score: parseFloat(score.toFixed(3)),
        riskMultiplier: parseFloat(riskMultiplier.toFixed(3)),
        zone,
        vixChange: parseFloat(vixChange.toFixed(4)),
        present: true,
    };
}

/**
 * Compute rolling correlation between two price series.
 * Uses Pearson correlation over a rolling window.
 *
 * @param {number[]} seriesA — closing prices of asset A
 * @param {number[]} seriesB — closing prices of asset B
 * @param {number} window — lookback period (default 20)
 * @returns {{ correlation: number, regime: string, present: boolean }}
 */
function computeCorrelation(seriesA, seriesB, window = 20) {
    if (!seriesA || !seriesB || seriesA.length < window || seriesB.length < window) {
        return { correlation: 0, regime: 'unknown', present: false };
    }

    // Use returns, not prices (removes level dependency)
    const returnsA = computeReturns(seriesA.slice(-window - 1));
    const returnsB = computeReturns(seriesB.slice(-window - 1));
    const n = Math.min(returnsA.length, returnsB.length);
    if (n < 5) return { correlation: 0, regime: 'unknown', present: false };

    const a = returnsA.slice(-n);
    const b = returnsB.slice(-n);

    const meanA = a.reduce((s, v) => s + v, 0) / n;
    const meanB = b.reduce((s, v) => s + v, 0) / n;

    let covAB = 0, varA = 0, varB = 0;
    for (let i = 0; i < n; i++) {
        const dA = a[i] - meanA;
        const dB = b[i] - meanB;
        covAB += dA * dB;
        varA += dA * dA;
        varB += dB * dB;
    }

    const denom = Math.sqrt(varA * varB);
    const correlation = denom > 0 ? covAB / denom : 0;

    let regime;
    if (Math.abs(correlation) > 0.7) regime = 'high_correlation';
    else if (Math.abs(correlation) > 0.3) regime = 'moderate_correlation';
    else regime = 'low_correlation';

    return {
        correlation: parseFloat(correlation.toFixed(4)),
        regime,
        present: true,
    };
}

/**
 * Compute inter-market divergence signal.
 * Detects when related markets disagree (e.g., stocks up but bonds also up = anomaly).
 *
 * @param {Object} markets — { spy: number[], bonds: number[], dollar: number[], gold: number[] }
 *   Each is an array of recent closing prices (most recent last).
 * @param {number} lookback — period for momentum comparison (default 10)
 * @returns {{ divergenceScore: number, signals: Object, present: boolean }}
 */
function computeInterMarketDivergence(markets, lookback = 10) {
    if (!markets) return { divergenceScore: 0, signals: {}, present: false };

    const signals = {};
    let divergenceCount = 0;
    let totalChecks = 0;

    // Compute momentum (% change over lookback) for each market
    function momentum(prices) {
        if (!prices || prices.length < lookback + 1) return null;
        const recent = prices[prices.length - 1];
        const past = prices[prices.length - 1 - lookback];
        return past > 0 ? (recent - past) / past : null;
    }

    const spyMom = momentum(markets.spy);
    const bondMom = momentum(markets.bonds);
    const dollarMom = momentum(markets.dollar);
    const goldMom = momentum(markets.gold);

    // Check 1: Stocks vs Bonds — same direction = normal, opposite = divergence
    if (spyMom != null && bondMom != null) {
        totalChecks++;
        const stocksUp = spyMom > 0;
        const bondsUp = bondMom > 0;
        if (stocksUp && bondsUp) {
            // Both up = money flowing everywhere (late cycle, or rate cut expectations)
            signals.stockBond = 'both_up';
        } else if (!stocksUp && bondsUp) {
            // Stocks down, bonds up = flight to safety (BEARISH for risk assets)
            signals.stockBond = 'flight_to_safety';
            divergenceCount++;
        } else if (stocksUp && !bondsUp) {
            // Stocks up, bonds down = risk-on, normal expansion
            signals.stockBond = 'risk_on';
        } else {
            // Both down = liquidity drain (very bearish)
            signals.stockBond = 'liquidity_drain';
            divergenceCount++;
        }
    }

    // Check 2: Dollar vs Gold — normally inverse
    if (dollarMom != null && goldMom != null) {
        totalChecks++;
        if (dollarMom > 0.005 && goldMom > 0.005) {
            // Both up = unusual (crisis buying of both safe havens)
            signals.dollarGold = 'crisis_hedging';
            divergenceCount++;
        } else if (dollarMom < -0.005 && goldMom < -0.005) {
            // Both down = risk-on euphoria (sell safety, buy risk)
            signals.dollarGold = 'risk_euphoria';
        } else {
            signals.dollarGold = 'normal_inverse';
        }
    }

    // Check 3: Dollar strength vs Stocks — strong dollar typically weighs on stocks
    if (dollarMom != null && spyMom != null) {
        totalChecks++;
        if (dollarMom > 0.01 && spyMom > 0.01) {
            // Both up = unusual divergence
            signals.dollarStock = 'divergence';
            divergenceCount++;
        } else {
            signals.dollarStock = 'normal';
        }
    }

    const divergenceScore = totalChecks > 0 ? divergenceCount / totalChecks : 0;

    return {
        divergenceScore: parseFloat(divergenceScore.toFixed(3)),
        signals,
        present: totalChecks > 0,
        momentum: {
            spy: spyMom != null ? parseFloat(spyMom.toFixed(5)) : null,
            bonds: bondMom != null ? parseFloat(bondMom.toFixed(5)) : null,
            dollar: dollarMom != null ? parseFloat(dollarMom.toFixed(5)) : null,
            gold: goldMom != null ? parseFloat(goldMom.toFixed(5)) : null,
        },
    };
}

/**
 * Combined cross-asset score for entry qualification.
 * Aggregates VIX + correlation + divergence into a single 0-1 score.
 *
 * @param {Object} params
 * @returns {{ score: number, riskMultiplier: number, components: Object }}
 */
function computeCrossAssetScore({
    vixLevel = null,
    vixPrev = null,
    correlationData = null,
    interMarketData = null,
} = {}) {
    const vix = computeVIXSignal(vixLevel, vixPrev);
    const corr = correlationData || { correlation: 0, regime: 'unknown', present: false };
    const divg = interMarketData || { divergenceScore: 0, present: false };

    let totalWeight = 0;
    let weightedScore = 0;

    // VIX: 50% weight (strongest signal)
    if (vix.present) {
        weightedScore += vix.score * 0.50;
        totalWeight += 0.50;
    }

    // Correlation regime: 25% weight
    if (corr.present) {
        // Low correlation = stock-picking works = good for individual signals
        const corrScore = corr.regime === 'low_correlation' ? 0.8
            : corr.regime === 'moderate_correlation' ? 0.5
            : 0.3; // high correlation = risk-on/off, harder to pick
        weightedScore += corrScore * 0.25;
        totalWeight += 0.25;
    }

    // Divergence: 25% weight
    if (divg.present) {
        // No divergence = normal market = higher score
        const divScore = 1.0 - divg.divergenceScore; // 0 divergence → 1.0, max divergence → 0.0
        weightedScore += divScore * 0.25;
        totalWeight += 0.25;
    }

    const score = totalWeight > 0 ? weightedScore / totalWeight : 0.5;
    const riskMultiplier = vix.present ? vix.riskMultiplier : 1.0;

    return {
        score: parseFloat(score.toFixed(3)),
        riskMultiplier,
        components: {
            vix: vix.present ? { score: vix.score, zone: vix.zone, riskMultiplier: vix.riskMultiplier } : null,
            correlation: corr.present ? { correlation: corr.correlation, regime: corr.regime } : null,
            divergence: divg.present ? { score: 1.0 - divg.divergenceScore, signals: divg.signals } : null,
        },
    };
}

function computeReturns(prices) {
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
        returns.push(prices[i - 1] > 0 ? (prices[i] - prices[i - 1]) / prices[i - 1] : 0);
    }
    return returns;
}

module.exports = {
    computeVIXSignal,
    computeCorrelation,
    computeInterMarketDivergence,
    computeCrossAssetScore,
    computeReturns,
};
