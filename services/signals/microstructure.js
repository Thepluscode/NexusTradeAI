'use strict';

/**
 * Enhanced Microstructure Analysis — institutional-grade order flow signals.
 *
 * Goes beyond basic buy/sell volume classification with:
 *
 * 1. VPIN (Volume-Synchronized Probability of Informed Trading)
 *    - Measures the probability that recent volume was driven by informed traders
 *    - High VPIN (>0.7) = smart money moving → impending large price move
 *    - Low VPIN (<0.3) = retail noise → no edge from order flow
 *    - Uses volume buckets instead of time bars for proper synchronization
 *
 * 2. MULTI-LEVEL ORDER BOOK DEPTH
 *    - Analyzes volume distribution at different price levels
 *    - Top-heavy = resistance above (bearish for longs)
 *    - Bottom-heavy = support below (bullish for longs)
 *    - Thin book = high impact potential (moves will be sharp)
 *
 * 3. TRADE FLOW TOXICITY (Lee-Ready tick test approximation)
 *    - Classifies each bar as buyer-initiated or seller-initiated
 *    - Uses close vs midpoint of range (tick test proxy without tick data)
 *    - Sustained buyer-initiated flow = accumulation
 *    - Sustained seller-initiated flow = distribution
 *
 * @module microstructure
 */

/**
 * Compute VPIN — Volume-Synchronized Probability of Informed Trading.
 *
 * Algorithm:
 *   1. Divide recent volume into equal-sized buckets (volume bars)
 *   2. For each bucket, classify volume as buy or sell using the Lee-Ready proxy
 *   3. VPIN = average |buyVol - sellVol| / bucketSize across N buckets
 *
 * A high VPIN means buy and sell volumes are very unequal in each bucket,
 * indicating directional pressure (informed trading).
 *
 * @param {Array<{open,high,low,close,volume}>} bars
 * @param {Object} config
 * @param {number} config.numBuckets — number of volume buckets (default 20)
 * @param {number} config.neutralDefault — score when insufficient data
 * @returns {{ score: number, raw: Object }}
 */
function computeVPIN(bars, config = {}) {
    const { numBuckets = 20, neutralDefault = 0.5 } = config;

    if (!bars || bars.length < numBuckets) {
        return { score: neutralDefault, raw: { vpin: 0, bucketSize: 0, bucketCount: 0 }, present: false };
    }

    // Total volume to divide into buckets
    const totalVolume = bars.reduce((s, b) => s + (b.volume || 0), 0);
    if (totalVolume === 0) {
        return { score: neutralDefault, raw: { vpin: 0, bucketSize: 0, bucketCount: 0 }, present: false };
    }

    const bucketSize = totalVolume / numBuckets;
    const buckets = [];
    let currentBuyVol = 0;
    let currentSellVol = 0;
    let currentBucketVol = 0;

    for (const bar of bars) {
        const vol = bar.volume || 0;
        if (vol === 0) continue;

        // Lee-Ready proxy: classify bar as buy or sell
        // If close > midpoint of range → buyer-initiated
        // If close < midpoint → seller-initiated
        const midpoint = (bar.high + bar.low) / 2;
        const buyFraction = bar.high !== bar.low
            ? (bar.close - bar.low) / (bar.high - bar.low)
            : 0.5;

        const buyVol = vol * buyFraction;
        const sellVol = vol * (1 - buyFraction);

        currentBuyVol += buyVol;
        currentSellVol += sellVol;
        currentBucketVol += vol;

        // Bucket is full — record and start new one
        while (currentBucketVol >= bucketSize && buckets.length < numBuckets) {
            const overflow = currentBucketVol - bucketSize;
            const overflowFraction = overflow / vol;

            const bucketBuy = currentBuyVol - buyVol * overflowFraction;
            const bucketSell = currentSellVol - sellVol * overflowFraction;

            buckets.push({
                buyVol: bucketBuy,
                sellVol: bucketSell,
                imbalance: Math.abs(bucketBuy - bucketSell),
            });

            // Carry overflow into next bucket
            currentBuyVol = buyVol * overflowFraction;
            currentSellVol = sellVol * overflowFraction;
            currentBucketVol = overflow;
        }
    }

    if (buckets.length === 0) {
        return { score: neutralDefault, raw: { vpin: 0, bucketSize, bucketCount: 0 }, present: false };
    }

    // VPIN = average imbalance / bucket size
    const avgImbalance = buckets.reduce((s, b) => s + b.imbalance, 0) / buckets.length;
    const vpin = bucketSize > 0 ? avgImbalance / bucketSize : 0;

    // Score: VPIN 0 → 0.5 (neutral), VPIN 0.5 → 0.75, VPIN 1.0 → 1.0
    const score = 0.5 + vpin * 0.5;

    return {
        score: parseFloat(Math.min(score, 1.0).toFixed(4)),
        raw: {
            vpin: parseFloat(vpin.toFixed(4)),
            bucketSize: parseFloat(bucketSize.toFixed(2)),
            bucketCount: buckets.length,
            avgImbalance: parseFloat(avgImbalance.toFixed(2)),
        },
        present: true,
    };
}

/**
 * Compute trade flow toxicity — sustained directional pressure.
 *
 * Uses a rolling window to detect whether recent bars are consistently
 * buyer-initiated (accumulation) or seller-initiated (distribution).
 *
 * @param {Array<{open,high,low,close,volume}>} bars
 * @param {number} lookback — bars to analyze (default 20)
 * @returns {{ score: number, raw: Object }}
 */
function computeTradeFlowToxicity(bars, lookback = 20) {
    if (!bars || bars.length < lookback) {
        return { score: 0.5, raw: { toxicity: 0, direction: 'neutral', streak: 0 }, present: false };
    }

    const recent = bars.slice(-lookback);
    let buyInitiated = 0;
    let sellInitiated = 0;
    let streak = 0;
    let lastDirection = null;

    for (const bar of recent) {
        const midpoint = (bar.high + bar.low) / 2;
        const isBuyInitiated = bar.close >= midpoint;

        if (isBuyInitiated) {
            buyInitiated++;
            if (lastDirection === 'buy') streak++;
            else streak = 1;
            lastDirection = 'buy';
        } else {
            sellInitiated++;
            if (lastDirection === 'sell') streak++;
            else streak = 1;
            lastDirection = 'sell';
        }
    }

    const total = buyInitiated + sellInitiated;
    const imbalance = total > 0 ? (buyInitiated - sellInitiated) / total : 0;

    // Toxicity = how one-sided the flow is (0 = balanced, 1 = all one direction)
    const toxicity = Math.abs(imbalance);

    // Direction of the flow
    const direction = imbalance > 0.2 ? 'accumulation'
        : imbalance < -0.2 ? 'distribution'
        : 'neutral';

    // Score: high toxicity in the direction of the trade = strong signal
    // Raw score is the signed imbalance for the caller to interpret by trade direction
    const score = (imbalance + 1) / 2; // normalize to 0-1 (0 = all sells, 1 = all buys)

    return {
        score: parseFloat(score.toFixed(4)),
        raw: {
            toxicity: parseFloat(toxicity.toFixed(4)),
            imbalance: parseFloat(imbalance.toFixed(4)),
            direction,
            streak,
            buyBars: buyInitiated,
            sellBars: sellInitiated,
        },
        present: true,
    };
}

/**
 * Combined microstructure score.
 * Aggregates VPIN (50%) + trade flow toxicity (50%).
 *
 * @param {Array} bars — OHLCV bars
 * @param {Object} config
 * @returns {{ score: number, vpin: Object, toxicity: Object }}
 */
function computeMicrostructure(bars, config = {}) {
    const vpin = computeVPIN(bars, config);
    const toxicity = computeTradeFlowToxicity(bars, config.lookback || 20);

    let score = 0.5;
    let totalWeight = 0;

    if (vpin.present) {
        score += (vpin.score - 0.5) * 0.50; // VPIN contributes 50%
        totalWeight += 0.50;
    }
    if (toxicity.present) {
        score += (toxicity.score - 0.5) * 0.50; // Toxicity contributes 50%
        totalWeight += 0.50;
    }

    return {
        score: parseFloat(Math.max(0, Math.min(1, score)).toFixed(4)),
        vpin,
        toxicity,
        present: vpin.present || toxicity.present,
    };
}

module.exports = { computeVPIN, computeTradeFlowToxicity, computeMicrostructure };
