'use strict';

/**
 * Gate B Validator — walk-forward robustness check.
 *
 * Ensures a strategy isn't overfit by validating out-of-sample performance
 * across multiple rolling windows (folds).
 *
 * Requirements (all must be met):
 *   - Median OOS Sharpe >= 0.5 across folds
 *   - Sharpe decay (median IS Sharpe - median OOS Sharpe) < 0.5
 *   - At least 30 OOS trades total across all folds
 *   - No single fold has Sharpe < -0.5 (no catastrophic regime)
 *   - Walk-forward efficiency (WFE) >= 50%
 *     WFE = median(OOS Sharpe) / median(IS Sharpe) * 100
 *
 * @param {Array<{inSample: Object, outOfSample: Object}>} folds
 * @returns {{ passed: boolean, reasons: string[], stats: Object }}
 */
function validateGateB(folds) {
    const reasons = [];

    if (!Array.isArray(folds) || folds.length < 2) {
        reasons.push(`insufficient_folds (${folds ? folds.length : 0} < 2)`);
        return { passed: false, reasons, stats: {} };
    }

    const isSharpes = folds.map(f => f.inSample?.sharpe ?? 0);
    const oosSharpes = folds.map(f => f.outOfSample?.sharpe ?? 0);
    const oosTradeCounts = folds.map(f => f.outOfSample?.tradeCount ?? 0);
    const totalOOSTrades = oosTradeCounts.reduce((s, n) => s + n, 0);

    // Sort for median
    const medianIS = median(isSharpes);
    const medianOOS = median(oosSharpes);
    const sharpeDecay = medianIS - medianOOS;
    const wfe = medianIS > 0 ? (medianOOS / medianIS) * 100 : 0;
    const worstFoldSharpe = Math.min(...oosSharpes);

    // Gate checks
    if (totalOOSTrades < 30) {
        reasons.push(`insufficient_oos_trades (${totalOOSTrades} < 30)`);
    }

    if (medianOOS < 0.5) {
        reasons.push(`low_oos_sharpe (median ${medianOOS.toFixed(2)} < 0.50)`);
    }

    if (sharpeDecay > 0.5) {
        reasons.push(`high_sharpe_decay (${sharpeDecay.toFixed(2)} > 0.50 — likely overfit)`);
    }

    if (worstFoldSharpe < -0.5) {
        reasons.push(`catastrophic_fold (worst Sharpe ${worstFoldSharpe.toFixed(2)} < -0.50)`);
    }

    if (wfe < 50) {
        reasons.push(`low_wfe (${wfe.toFixed(0)}% < 50% — strategy degrades out-of-sample)`);
    }

    return {
        passed: reasons.length === 0,
        reasons,
        stats: {
            foldCount: folds.length,
            medianISSharpe: parseFloat(medianIS.toFixed(3)),
            medianOOSSharpe: parseFloat(medianOOS.toFixed(3)),
            sharpeDecay: parseFloat(sharpeDecay.toFixed(3)),
            wfe: parseFloat(wfe.toFixed(1)),
            totalOOSTrades,
            worstFoldSharpe: parseFloat(worstFoldSharpe.toFixed(3)),
            perFoldOOS: oosSharpes.map(s => parseFloat(s.toFixed(3))),
        }
    };
}

function median(arr) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
}

module.exports = { validateGateB, median };
