'use strict';

/**
 * Portfolio Intelligence Module — cross-bot optimization for the full portfolio.
 *
 * Three capabilities:
 *
 * 1. PAIRWISE CORRELATION GUARD — not just directional counts, but actual
 *    price correlation between held positions. Blocks entries that would
 *    make the portfolio more correlated (undiversified).
 *
 * 2. EQUITY CURVE RESPONSIVE SIZING — anti-martingale position scaling.
 *    Uses the equity curve's position relative to its moving average AND
 *    the drawdown depth to scale positions up or down.
 *
 * 3. DYNAMIC CAPITAL ALLOCATION — shifts capital between bots based on
 *    their recent risk-adjusted performance (rolling Sharpe).
 *
 * @module portfolio-intelligence
 */

/**
 * Compute pairwise correlation matrix for current portfolio positions.
 * Uses recent returns of each held symbol to detect undiversified exposure.
 *
 * @param {Array<{symbol: string, returns: number[]}>} positions — each with recent price returns
 * @param {number} maxAvgCorrelation — threshold above which new entries are blocked (default 0.6)
 * @returns {{ avgCorrelation, pairs, canAddPosition, highCorrelationPairs }}
 */
function computePortfolioCorrelation(positions, maxAvgCorrelation = 0.6) {
    if (!positions || positions.length < 2) {
        return {
            avgCorrelation: 0,
            pairs: [],
            canAddPosition: true,
            highCorrelationPairs: [],
            positionCount: positions?.length || 0,
        };
    }

    const pairs = [];
    let totalCorr = 0;
    let pairCount = 0;
    const highCorrelationPairs = [];

    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            const a = positions[i];
            const b = positions[j];
            const corr = pearsonCorrelation(a.returns, b.returns);

            pairs.push({
                symbolA: a.symbol,
                symbolB: b.symbol,
                correlation: parseFloat(corr.toFixed(4)),
            });

            if (Math.abs(corr) > 0.7) {
                highCorrelationPairs.push({ symbols: [a.symbol, b.symbol], correlation: parseFloat(corr.toFixed(4)) });
            }

            totalCorr += Math.abs(corr);
            pairCount++;
        }
    }

    const avgCorrelation = pairCount > 0 ? totalCorr / pairCount : 0;

    return {
        avgCorrelation: parseFloat(avgCorrelation.toFixed(4)),
        pairs,
        canAddPosition: avgCorrelation < maxAvgCorrelation,
        highCorrelationPairs,
        positionCount: positions.length,
    };
}

/**
 * Check if adding a new symbol would increase portfolio correlation above threshold.
 *
 * @param {Array<{symbol: string, returns: number[]}>} currentPositions
 * @param {{ symbol: string, returns: number[] }} newPosition
 * @param {number} maxAvgCorrelation
 * @returns {{ canAdd, projectedCorrelation, worstPair }}
 */
function canAddToPortfolio(currentPositions, newPosition, maxAvgCorrelation = 0.6) {
    if (!currentPositions || currentPositions.length === 0 || !newPosition?.returns?.length) {
        return { canAdd: true, projectedCorrelation: 0, worstPair: null };
    }

    const allPositions = [...currentPositions, newPosition];
    const result = computePortfolioCorrelation(allPositions, maxAvgCorrelation);

    // Find worst correlation pair involving the new symbol
    const newPairs = result.pairs.filter(
        p => p.symbolA === newPosition.symbol || p.symbolB === newPosition.symbol
    );
    const worstPair = newPairs.length > 0
        ? newPairs.reduce((a, b) => Math.abs(a.correlation) > Math.abs(b.correlation) ? a : b)
        : null;

    return {
        canAdd: result.canAddPosition,
        projectedCorrelation: result.avgCorrelation,
        worstPair,
    };
}

/**
 * Enhanced equity curve position sizing — anti-martingale with drawdown awareness.
 *
 * Uses TWO signals:
 *   1. Equity vs MA (existing): below MA = reduce, above = full size
 *   2. Drawdown depth (new): deeper drawdown = more aggressive reduction
 *
 * The combination prevents doubling down during losing streaks while
 * allowing full sizing when the strategy is working.
 *
 * @param {number[]} equityCurve — cumulative equity values (most recent last)
 * @param {Object} config
 * @returns {{ multiplier, aboveMA, drawdownPct, phase }}
 */
function computeEquityCurveSizing(equityCurve, config = {}) {
    const { maLookback = 20, maxDrawdownPct = 15 } = config;

    if (!equityCurve || equityCurve.length < maLookback) {
        return { multiplier: 1.0, aboveMA: true, drawdownPct: 0, phase: 'insufficient_data' };
    }

    const current = equityCurve[equityCurve.length - 1];
    const peak = Math.max(...equityCurve);
    const drawdownPct = peak > 0 ? ((peak - current) / peak) * 100 : 0;

    // MA check
    const maSlice = equityCurve.slice(-maLookback);
    const ma = maSlice.reduce((s, v) => s + v, 0) / maLookback;
    const aboveMA = current >= ma;

    let multiplier = 1.0;
    let phase;

    if (drawdownPct > maxDrawdownPct) {
        // Deep drawdown — minimal sizing to protect remaining capital
        multiplier = 0.25;
        phase = 'deep_drawdown';
    } else if (!aboveMA && drawdownPct > 5) {
        // Below MA + moderate drawdown — significant reduction
        const deviation = (ma - current) / ma;
        multiplier = Math.max(0.3, 1.0 - deviation * 4);
        phase = 'below_ma_drawdown';
    } else if (!aboveMA) {
        // Below MA but shallow drawdown — mild reduction
        multiplier = 0.7;
        phase = 'below_ma';
    } else if (drawdownPct < 2 && current > peak * 0.99) {
        // Near all-time highs — full confidence
        multiplier = 1.1;
        phase = 'near_highs';
    } else {
        phase = 'normal';
    }

    return {
        multiplier: parseFloat(Math.max(0.1, Math.min(1.5, multiplier)).toFixed(3)),
        aboveMA,
        drawdownPct: parseFloat(drawdownPct.toFixed(2)),
        equityMA: parseFloat(ma.toFixed(2)),
        peak: parseFloat(peak.toFixed(2)),
        phase,
    };
}

/**
 * Dynamic capital allocation across bots based on rolling Sharpe ratio.
 *
 * Bots with higher risk-adjusted returns get more capital.
 * Bots with negative Sharpe get minimum allocation (10%).
 *
 * @param {Array<{bot: string, sharpe: number, trades: number}>} botPerformance
 * @param {Object} config
 * @returns {Object} allocation — { stock: 0.40, forex: 0.25, crypto: 0.35, ... }
 */
function computeCapitalAllocation(botPerformance, config = {}) {
    const { minAllocation = 0.10, maxAllocation = 0.60, minTrades = 10 } = config;

    if (!botPerformance || botPerformance.length === 0) {
        return { allocations: {}, method: 'no_data' };
    }

    // Filter bots with enough trades for meaningful Sharpe
    const qualified = botPerformance.filter(b => b.trades >= minTrades);
    const unqualified = botPerformance.filter(b => b.trades < minTrades);

    if (qualified.length === 0) {
        // No bot has enough data — equal allocation
        const equal = 1.0 / botPerformance.length;
        const allocations = {};
        for (const b of botPerformance) {
            allocations[b.bot] = parseFloat(equal.toFixed(3));
        }
        return { allocations, method: 'equal_insufficient_data' };
    }

    // Sharpe-weighted allocation (only for positive-Sharpe bots)
    const positiveSharpe = qualified.filter(b => b.sharpe > 0);
    const negativeSharpe = qualified.filter(b => b.sharpe <= 0);

    const allocations = {};

    if (positiveSharpe.length === 0) {
        // All bots have negative Sharpe — minimum allocation for all
        for (const b of botPerformance) {
            allocations[b.bot] = minAllocation;
        }
        return { allocations, method: 'all_negative_sharpe' };
    }

    // Weighted by Sharpe^2 (squares emphasize differences, dampens noise)
    const totalSharpeWeight = positiveSharpe.reduce((s, b) => s + b.sharpe ** 2, 0);

    for (const b of positiveSharpe) {
        const rawWeight = totalSharpeWeight > 0 ? b.sharpe ** 2 / totalSharpeWeight : 0;
        const allocation = Math.min(maxAllocation, Math.max(minAllocation, rawWeight));
        allocations[b.bot] = parseFloat(allocation.toFixed(3));
    }

    // Negative Sharpe bots get minimum
    for (const b of negativeSharpe) {
        allocations[b.bot] = minAllocation;
    }
    // Unqualified bots get minimum
    for (const b of unqualified) {
        allocations[b.bot] = minAllocation;
    }

    // Normalize so allocations sum to 1.0
    const totalAlloc = Object.values(allocations).reduce((s, v) => s + v, 0);
    if (totalAlloc > 0) {
        for (const key of Object.keys(allocations)) {
            allocations[key] = parseFloat((allocations[key] / totalAlloc).toFixed(3));
        }
    }

    return {
        allocations,
        method: 'sharpe_weighted',
        qualified: qualified.map(b => ({ bot: b.bot, sharpe: b.sharpe, trades: b.trades })),
    };
}

/**
 * Pearson correlation between two arrays of equal length.
 */
function pearsonCorrelation(a, b) {
    const n = Math.min(a?.length || 0, b?.length || 0);
    if (n < 5) return 0;

    const sliceA = a.slice(-n);
    const sliceB = b.slice(-n);

    const meanA = sliceA.reduce((s, v) => s + v, 0) / n;
    const meanB = sliceB.reduce((s, v) => s + v, 0) / n;

    let covAB = 0, varA = 0, varB = 0;
    for (let i = 0; i < n; i++) {
        const dA = sliceA[i] - meanA;
        const dB = sliceB[i] - meanB;
        covAB += dA * dB;
        varA += dA * dA;
        varB += dB * dB;
    }

    const denom = Math.sqrt(varA * varB);
    return denom > 0 ? covAB / denom : 0;
}

module.exports = {
    computePortfolioCorrelation,
    canAddToPortfolio,
    computeEquityCurveSizing,
    computeCapitalAllocation,
    pearsonCorrelation,
};
