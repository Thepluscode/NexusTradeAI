'use strict';

const { simulateTrades, computeStats } = require('./runner');
const { validateGateA } = require('./gate-a-validator');
const { validateGateB } = require('./gate-b-validator');

/**
 * Walk-forward validation harness.
 *
 * Splits historical bars into rolling train/test windows, runs the strategy
 * on each fold, and validates through both Gate A (basic stats) and
 * Gate B (walk-forward robustness).
 *
 * Window logic (anchored expanding or rolling):
 *   - Default: rolling windows of trainBars + testBars, stepping by testBars
 *   - Each fold: train on [start..start+trainBars], test on [start+trainBars..start+trainBars+testBars]
 *   - Slide forward by testBars for next fold
 *
 * @param {Object} strategy — strategy module with evaluate(bars, context)
 * @param {Array<{t,o,h,l,c,v}>} bars — full historical bars (oldest first)
 * @param {Object} options
 * @param {number} options.trainBars — bars per training window (default 1000 ≈ ~4 days of 1m bars)
 * @param {number} options.testBars — bars per test window (default 250 ≈ ~1 day of 1m bars)
 * @param {string} options.assetClass — 'stock' | 'forex' | 'crypto'
 * @param {number} options.lookback — bars needed for indicator warmup (default 30)
 * @param {number} options.maxHoldBars — max bars to hold a position (default 60)
 * @param {Object} options.contextOverrides — passed to strategy context
 * @returns {{ gateA, gateB, folds, allTrades, summary }}
 */
function walkForward(strategy, bars, options = {}) {
    const {
        trainBars = 1000,
        testBars = 250,
        assetClass = 'stock',
        lookback = 30,
        maxHoldBars = 60,
        contextOverrides = {},
    } = options;

    const totalBars = bars.length;
    const windowSize = trainBars + testBars;

    if (totalBars < windowSize + lookback) {
        return {
            gateA: { passed: false, reasons: ['insufficient_data'], stats: {} },
            gateB: { passed: false, reasons: ['insufficient_data'], stats: {} },
            folds: [],
            allTrades: [],
            summary: { totalBars, requiredBars: windowSize + lookback, foldCount: 0 },
        };
    }

    const folds = [];
    const allOOSTrades = [];

    // Roll through the data
    let start = 0;
    while (start + windowSize <= totalBars) {
        const trainSlice = bars.slice(start, start + trainBars);
        const testSlice = bars.slice(start + trainBars, start + trainBars + testBars);

        // Run strategy on training data
        const trainResult = simulateTrades(strategy, trainSlice, {
            lookback, maxHoldBars, assetClass, contextOverrides,
        });

        // Run strategy on test data (out-of-sample)
        const testResult = simulateTrades(strategy, testSlice, {
            lookback, maxHoldBars, assetClass, contextOverrides,
        });

        folds.push({
            foldIndex: folds.length,
            trainRange: { start, end: start + trainBars, bars: trainBars },
            testRange: { start: start + trainBars, end: start + trainBars + testBars, bars: testBars },
            inSample: {
                tradeCount: trainResult.trades.length,
                winRate: trainResult.winRate,
                profitFactor: trainResult.profitFactor,
                sharpe: trainResult.sharpe,
                sortino: trainResult.sortino,
                maxDrawdownPct: trainResult.maxDrawdownPct,
                totalPnl: trainResult.totalPnl,
            },
            outOfSample: {
                tradeCount: testResult.trades.length,
                winRate: testResult.winRate,
                profitFactor: testResult.profitFactor,
                sharpe: testResult.sharpe,
                sortino: testResult.sortino,
                maxDrawdownPct: testResult.maxDrawdownPct,
                totalPnl: testResult.totalPnl,
            },
        });

        allOOSTrades.push(...testResult.trades);
        start += testBars; // slide by test window size
    }

    // Gate A on all OOS trades combined
    const gateA = validateGateA(allOOSTrades);

    // Gate B on per-fold results
    const gateB = validateGateB(folds);

    // Combined OOS stats
    const oosStats = computeStats(allOOSTrades);

    return {
        gateA,
        gateB,
        folds,
        allTrades: allOOSTrades,
        summary: {
            totalBars,
            foldCount: folds.length,
            totalOOSTrades: allOOSTrades.length,
            oosWinRate: oosStats.winRate,
            oosSharpe: oosStats.sharpe,
            oosSortino: oosStats.sortino,
            oosMaxDrawdown: oosStats.maxDrawdownPct,
            oosTotalPnl: oosStats.totalPnl,
            oosExpectancy: oosStats.expectancy,
            passedGateA: gateA.passed,
            passedGateB: gateB.passed,
            verdict: gateA.passed && gateB.passed ? 'PASS' : 'FAIL',
        },
    };
}

module.exports = { walkForward };
