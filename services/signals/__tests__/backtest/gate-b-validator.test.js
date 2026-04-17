const { validateGateB, median } = require('../../backtest/gate-b-validator');

// Helper: create a fold with IS and OOS stats
function makeFold(isSharpe, oosSharpe, oosTrades = 20) {
    return {
        inSample: { sharpe: isSharpe, tradeCount: 50 },
        outOfSample: { sharpe: oosSharpe, tradeCount: oosTrades },
    };
}

describe('validateGateB', () => {
    test('passes with strong walk-forward results', () => {
        const folds = [
            makeFold(1.2, 0.8, 15),
            makeFold(1.0, 0.7, 15),
            makeFold(1.3, 0.9, 15),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(true);
        expect(result.reasons).toEqual([]);
        expect(result.stats.medianOOSSharpe).toBeGreaterThanOrEqual(0.5);
        expect(result.stats.wfe).toBeGreaterThanOrEqual(50);
    });

    test('fails with insufficient folds', () => {
        const result = validateGateB([makeFold(1.0, 0.6, 30)]);
        expect(result.passed).toBe(false);
        expect(result.reasons[0]).toMatch(/insufficient_folds/);
    });

    test('fails with low OOS Sharpe', () => {
        const folds = [
            makeFold(1.0, 0.2, 15),
            makeFold(1.0, 0.3, 15),
            makeFold(1.0, 0.1, 15),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('low_oos_sharpe'))).toBe(true);
    });

    test('fails with high Sharpe decay (overfit)', () => {
        const folds = [
            makeFold(2.5, 0.8, 15),
            makeFold(2.8, 0.6, 15),
            makeFold(2.6, 0.5, 15),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('high_sharpe_decay'))).toBe(true);
    });

    test('fails with catastrophic fold', () => {
        const folds = [
            makeFold(1.0, 0.8, 15),
            makeFold(1.0, -0.6, 15), // catastrophic
            makeFold(1.0, 0.9, 15),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('catastrophic_fold'))).toBe(true);
    });

    test('fails with insufficient OOS trades', () => {
        const folds = [
            makeFold(1.0, 0.8, 5),
            makeFold(1.0, 0.7, 5),
            makeFold(1.0, 0.9, 5),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('insufficient_oos_trades'))).toBe(true);
    });

    test('fails with low WFE (degrades OOS)', () => {
        // IS Sharpe 3.0, OOS Sharpe 0.6 → WFE = 20%
        const folds = [
            makeFold(3.0, 0.6, 15),
            makeFold(3.0, 0.6, 15),
            makeFold(3.0, 0.6, 15),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(false);
        expect(result.reasons.some(r => r.includes('low_wfe'))).toBe(true);
    });

    test('reports multiple failure reasons', () => {
        const folds = [
            makeFold(3.0, 0.1, 3),
            makeFold(3.0, -0.8, 3),
        ];
        const result = validateGateB(folds);
        expect(result.passed).toBe(false);
        expect(result.reasons.length).toBeGreaterThanOrEqual(3);
    });

    test('handles empty folds array', () => {
        const result = validateGateB([]);
        expect(result.passed).toBe(false);
    });

    test('handles null input', () => {
        const result = validateGateB(null);
        expect(result.passed).toBe(false);
    });

    test('stats include per-fold OOS Sharpes', () => {
        const folds = [
            makeFold(1.0, 0.8, 15),
            makeFold(1.0, 0.7, 15),
        ];
        const result = validateGateB(folds);
        expect(result.stats.perFoldOOS.sort()).toEqual([0.7, 0.8]);
        expect(result.stats.foldCount).toBe(2);
    });
});

describe('median', () => {
    test('returns middle value for odd-length array', () => {
        expect(median([3, 1, 2])).toBe(2);
    });

    test('returns average of two middle values for even-length array', () => {
        expect(median([1, 2, 3, 4])).toBe(2.5);
    });

    test('returns 0 for empty array', () => {
        expect(median([])).toBe(0);
    });

    test('returns single element for length-1 array', () => {
        expect(median([5])).toBe(5);
    });

    test('handles negative values', () => {
        expect(median([-3, -1, -2])).toBe(-2);
    });
});
