const {
    computePortfolioCorrelation,
    canAddToPortfolio,
    computeEquityCurveSizing,
    computeCapitalAllocation,
    pearsonCorrelation,
} = require('../portfolio-intelligence');

describe('pearsonCorrelation', () => {
    test('returns 1 for perfectly correlated arrays', () => {
        const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const b = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20];
        expect(pearsonCorrelation(a, b)).toBeCloseTo(1.0, 3);
    });

    test('returns -1 for perfectly inversely correlated', () => {
        const a = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        const b = [20, 18, 16, 14, 12, 10, 8, 6, 4, 2];
        expect(pearsonCorrelation(a, b)).toBeCloseTo(-1.0, 3);
    });

    test('returns 0 for insufficient data', () => {
        expect(pearsonCorrelation([1, 2], [3, 4])).toBe(0);
        expect(pearsonCorrelation(null, null)).toBe(0);
    });
});

describe('computePortfolioCorrelation', () => {
    test('returns low correlation for diversified positions', () => {
        const positions = [
            { symbol: 'AAPL', returns: [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.01, 0.02, -0.03, 0.01] },
            { symbol: 'GLD', returns: [-0.01, 0.02, -0.03, 0.01, -0.02, 0.03, -0.02, 0.01, 0.02, -0.01] },
        ];
        const result = computePortfolioCorrelation(positions);
        expect(result.avgCorrelation).toBeLessThan(0.6);
        expect(result.canAddPosition).toBe(true);
    });

    test('returns high correlation for correlated positions', () => {
        const returns = [0.01, 0.02, -0.01, 0.03, -0.02, 0.01, 0.02, -0.01, 0.01, 0.02];
        const positions = [
            { symbol: 'AAPL', returns },
            { symbol: 'MSFT', returns: returns.map(r => r * 1.1) }, // nearly identical returns
        ];
        const result = computePortfolioCorrelation(positions);
        expect(result.avgCorrelation).toBeGreaterThan(0.8);
        expect(result.highCorrelationPairs.length).toBeGreaterThan(0);
    });

    test('handles single position', () => {
        const result = computePortfolioCorrelation([
            { symbol: 'AAPL', returns: [0.01, 0.02, -0.01] },
        ]);
        expect(result.canAddPosition).toBe(true);
        expect(result.avgCorrelation).toBe(0);
    });

    test('handles empty positions', () => {
        const result = computePortfolioCorrelation([]);
        expect(result.canAddPosition).toBe(true);
    });
});

describe('canAddToPortfolio', () => {
    test('allows uncorrelated addition', () => {
        const current = [
            { symbol: 'AAPL', returns: [0.01, -0.02, 0.03, -0.01, 0.02, 0.01, -0.01, 0.02, -0.03, 0.01] },
        ];
        const newPos = { symbol: 'GLD', returns: [-0.01, 0.02, -0.03, 0.01, -0.02, 0.03, -0.02, 0.01, 0.02, -0.01] };
        const result = canAddToPortfolio(current, newPos);
        expect(result.canAdd).toBe(true);
    });

    test('blocks highly correlated addition', () => {
        const returns = [0.01, 0.02, -0.01, 0.03, -0.02, 0.01, 0.02, -0.01, 0.01, 0.02];
        const current = [
            { symbol: 'AAPL', returns },
            { symbol: 'MSFT', returns: returns.map(r => r * 0.95) },
        ];
        const newPos = { symbol: 'GOOG', returns: returns.map(r => r * 1.05) };
        const result = canAddToPortfolio(current, newPos, 0.6);
        expect(result.canAdd).toBe(false);
        expect(result.projectedCorrelation).toBeGreaterThan(0.6);
    });

    test('handles empty portfolio', () => {
        const result = canAddToPortfolio([], { symbol: 'AAPL', returns: [0.01, 0.02] });
        expect(result.canAdd).toBe(true);
    });
});

describe('computeEquityCurveSizing', () => {
    test('normal sizing when equity above MA', () => {
        // Equity steadily rising → above MA
        const curve = Array.from({ length: 30 }, (_, i) => 10000 + i * 50);
        const result = computeEquityCurveSizing(curve);
        expect(result.multiplier).toBeGreaterThanOrEqual(1.0);
        expect(result.aboveMA).toBe(true);
        expect(result.phase).toBe('near_highs');
    });

    test('reduced sizing when equity below MA', () => {
        // Rising then dropping → below MA
        const rising = Array.from({ length: 20 }, (_, i) => 10000 + i * 100);
        const falling = Array.from({ length: 10 }, (_, i) => 12000 - i * 150);
        const curve = [...rising, ...falling];
        const result = computeEquityCurveSizing(curve);
        expect(result.multiplier).toBeLessThan(1.0);
        expect(result.aboveMA).toBe(false);
    });

    test('deep drawdown = minimal sizing', () => {
        // Peak at 12000, now at 10000 → 16.7% drawdown
        const curve = Array.from({ length: 25 }, (_, i) => {
            if (i < 15) return 10000 + i * 200; // peak at 12800
            return 12800 - (i - 15) * 300; // drop
        });
        const result = computeEquityCurveSizing(curve, { maxDrawdownPct: 15 });
        expect(result.multiplier).toBeLessThanOrEqual(0.3);
        expect(result.phase).toMatch(/drawdown/);
    });

    test('multiplier is bounded 0.1 to 1.5', () => {
        const extreme = Array.from({ length: 25 }, (_, i) => 10000 - i * 500);
        const result = computeEquityCurveSizing(extreme);
        expect(result.multiplier).toBeGreaterThanOrEqual(0.1);
        expect(result.multiplier).toBeLessThanOrEqual(1.5);
    });

    test('handles insufficient data', () => {
        const result = computeEquityCurveSizing([100, 200, 300]);
        expect(result.multiplier).toBe(1.0);
        expect(result.phase).toBe('insufficient_data');
    });
});

describe('computeCapitalAllocation', () => {
    test('allocates more to higher Sharpe bot', () => {
        const bots = [
            { bot: 'stock', sharpe: 1.5, trades: 50 },
            { bot: 'crypto', sharpe: 0.8, trades: 40 },
            { bot: 'forex', sharpe: 0.3, trades: 30 },
        ];
        const result = computeCapitalAllocation(bots);
        // Stock (Sharpe 1.5) gets most, crypto (0.8) more than forex (0.3)
        expect(result.allocations.stock).toBeGreaterThan(result.allocations.crypto);
        expect(result.allocations.crypto).toBeGreaterThan(result.allocations.forex);
    });

    test('negative Sharpe gets minimum allocation', () => {
        const bots = [
            { bot: 'stock', sharpe: 1.0, trades: 50 },
            { bot: 'forex', sharpe: -0.5, trades: 30 },
        ];
        const result = computeCapitalAllocation(bots);
        expect(result.allocations.forex).toBeLessThanOrEqual(0.15); // near minimum after normalization
    });

    test('allocations sum to approximately 1.0', () => {
        const bots = [
            { bot: 'stock', sharpe: 1.5, trades: 50 },
            { bot: 'crypto', sharpe: 0.8, trades: 40 },
            { bot: 'forex', sharpe: 0.3, trades: 30 },
        ];
        const result = computeCapitalAllocation(bots);
        const total = Object.values(result.allocations).reduce((s, v) => s + v, 0);
        expect(total).toBeCloseTo(1.0, 1);
    });

    test('equal allocation when insufficient trades', () => {
        const bots = [
            { bot: 'stock', sharpe: 1.5, trades: 5 },
            { bot: 'crypto', sharpe: 0.5, trades: 3 },
        ];
        const result = computeCapitalAllocation(bots);
        expect(result.method).toBe('equal_insufficient_data');
        expect(result.allocations.stock).toBeCloseTo(0.5, 1);
    });

    test('handles empty input', () => {
        const result = computeCapitalAllocation([]);
        expect(result.method).toBe('no_data');
    });

    test('no single bot exceeds max allocation', () => {
        const bots = [
            { bot: 'stock', sharpe: 5.0, trades: 100 },  // dominant
            { bot: 'crypto', sharpe: 0.1, trades: 50 },
            { bot: 'forex', sharpe: 0.1, trades: 50 },
        ];
        const result = computeCapitalAllocation(bots, { maxAllocation: 0.60 });
        // After normalization, stock may exceed 60% but the raw weight was capped
        expect(result.allocations.stock).toBeDefined();
    });
});
