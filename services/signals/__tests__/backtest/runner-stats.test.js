const { computeStats, computeSharpe, computeSortino, computeMaxDrawdown } = require('../../backtest/runner');

describe('computeSharpe', () => {
    test('returns 0 for single return', () => {
        expect(computeSharpe([1.5])).toBe(0);
    });

    test('returns 0 for constant returns (zero std)', () => {
        expect(computeSharpe([1, 1, 1, 1])).toBe(0);
    });

    test('positive for consistently positive returns', () => {
        const returns = [1, 2, 1.5, 2.5, 1.8, 2.2, 1.3, 2.1, 1.9, 1.6];
        expect(computeSharpe(returns)).toBeGreaterThan(0);
    });

    test('negative for consistently negative returns', () => {
        const returns = [-1, -2, -1.5, -2.5, -1.8, -2.2, -1.3, -2.1];
        expect(computeSharpe(returns)).toBeLessThan(0);
    });

    test('higher for less volatile positive returns', () => {
        const stable = [1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0, 1.1, 0.9, 1.0];
        const volatile = [3.0, -1.0, 4.0, -2.0, 3.0, -1.0, 4.0, -2.0, 3.0, -1.0];
        // Both have positive mean, but stable has lower std
        expect(computeSharpe(stable)).toBeGreaterThan(computeSharpe(volatile));
    });

    test('returns 0 for empty array', () => {
        expect(computeSharpe([])).toBe(0);
    });
});

describe('computeSortino', () => {
    test('returns 0 for single return', () => {
        expect(computeSortino([1.5])).toBe(0);
    });

    test('returns Infinity for all-positive returns', () => {
        const returns = [1, 2, 3, 4, 5];
        expect(computeSortino(returns)).toBe(Infinity);
    });

    test('penalizes downside more than Sharpe', () => {
        // Asymmetric: big ups, small downs
        const returns = [5, -1, 5, -1, 5, -1, 5, -1, 5, -1];
        const sharpe = computeSharpe(returns);
        const sortino = computeSortino(returns);
        // Sortino should be higher because downside deviation is smaller than total deviation
        expect(sortino).toBeGreaterThan(sharpe);
    });

    test('returns 0 for empty array', () => {
        expect(computeSortino([])).toBe(0);
    });
});

describe('computeMaxDrawdown', () => {
    test('returns 0 for empty trades', () => {
        expect(computeMaxDrawdown([])).toBe(0);
    });

    test('returns 0 for all-winning trades', () => {
        const trades = [{ pnl: 10 }, { pnl: 5 }, { pnl: 8 }];
        expect(computeMaxDrawdown(trades)).toBe(0);
    });

    test('calculates drawdown correctly', () => {
        // Equity: 0 → +10 → +15 → +5 → +8
        // Peak at +15, trough at +5 → DD = 10/15 = 66.7%
        const trades = [{ pnl: 10 }, { pnl: 5 }, { pnl: -10 }, { pnl: 3 }];
        const dd = computeMaxDrawdown(trades);
        expect(dd).toBeCloseTo(66.67, 0);
    });

    test('handles total wipeout', () => {
        const trades = [{ pnl: 10 }, { pnl: -10 }];
        const dd = computeMaxDrawdown(trades);
        expect(dd).toBeCloseTo(100, 0);
    });

    test('all-losing trades: drawdown is 0 (never had a peak)', () => {
        // Equity never goes positive → peak stays at 0 → dd formula gives 0
        const trades = [{ pnl: -5 }, { pnl: -3 }];
        const dd = computeMaxDrawdown(trades);
        expect(dd).toBe(0);
    });
});

describe('computeStats', () => {
    test('returns zeros for empty trades', () => {
        const stats = computeStats([]);
        expect(stats.winRate).toBe(0);
        expect(stats.sharpe).toBe(0);
        expect(stats.totalPnl).toBe(0);
    });

    test('computes correct win rate', () => {
        const trades = [
            { pnl: 10, entry_price: 100 },
            { pnl: -5, entry_price: 100 },
            { pnl: 8, entry_price: 100 },
            { pnl: -3, entry_price: 100 },
        ];
        const stats = computeStats(trades);
        expect(stats.winRate).toBe(0.5);
    });

    test('computes correct profit factor', () => {
        const trades = [
            { pnl: 10, entry_price: 100 },
            { pnl: -5, entry_price: 100 },
        ];
        const stats = computeStats(trades);
        expect(stats.profitFactor).toBe(2.0);
    });

    test('computes expectancy', () => {
        const trades = [
            { pnl: 10, entry_price: 100 },
            { pnl: -5, entry_price: 100 },
            { pnl: 8, entry_price: 100 },
            { pnl: -3, entry_price: 100 },
        ];
        const stats = computeStats(trades);
        expect(stats.expectancy).toBe(2.5); // (10-5+8-3)/4
    });

    test('includes Sharpe and Sortino', () => {
        const trades = Array.from({ length: 20 }, (_, i) => ({
            pnl: i % 3 === 0 ? -2 : 5,
            entry_price: 100,
        }));
        const stats = computeStats(trades);
        expect(typeof stats.sharpe).toBe('number');
        expect(typeof stats.sortino).toBe('number');
    });
});
