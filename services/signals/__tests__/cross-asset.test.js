const {
    computeVIXSignal, computeCorrelation, computeInterMarketDivergence,
    computeCrossAssetScore, computeReturns
} = require('../cross-asset');

describe('computeVIXSignal', () => {
    test('complacent zone (VIX < 15)', () => {
        const result = computeVIXSignal(12);
        expect(result.zone).toBe('complacent');
        expect(result.riskMultiplier).toBeGreaterThan(1.0);
        expect(result.score).toBeGreaterThan(0.5);
        expect(result.present).toBe(true);
    });

    test('normal zone (VIX 15-25)', () => {
        const result = computeVIXSignal(20);
        expect(result.zone).toBe('normal');
        expect(result.riskMultiplier).toBe(1.0);
    });

    test('elevated zone (VIX 25-35)', () => {
        const result = computeVIXSignal(30);
        expect(result.zone).toBe('elevated');
        expect(result.riskMultiplier).toBeLessThan(1.0);
        expect(result.score).toBeLessThan(0.5);
    });

    test('crisis zone (VIX > 35)', () => {
        const result = computeVIXSignal(45);
        expect(result.zone).toBe('crisis');
        expect(result.riskMultiplier).toBeLessThanOrEqual(0.3);
        expect(result.score).toBeLessThanOrEqual(0.2);
    });

    test('VIX spike > 20% reduces risk further', () => {
        const stable = computeVIXSignal(25, 24);
        const spiking = computeVIXSignal(30, 24); // 25% spike
        expect(spiking.riskMultiplier).toBeLessThan(stable.riskMultiplier);
    });

    test('VIX crash > 15% boosts score', () => {
        const beforeCrash = computeVIXSignal(20, null);
        const afterCrash = computeVIXSignal(17, 22); // -22.7% drop
        expect(afterCrash.score).toBeGreaterThan(beforeCrash.score);
    });

    test('returns not present for null VIX', () => {
        const result = computeVIXSignal(null);
        expect(result.present).toBe(false);
        expect(result.riskMultiplier).toBe(1.0);
    });
});

describe('computeCorrelation', () => {
    test('perfectly correlated series', () => {
        const a = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118, 119, 120];
        const b = [50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70];
        const result = computeCorrelation(a, b, 20);
        expect(result.correlation).toBeGreaterThan(0.9);
        expect(result.regime).toBe('high_correlation');
        expect(result.present).toBe(true);
    });

    test('inversely correlated series (alternating pattern)', () => {
        // When A zigs, B zags — true inverse returns on a bar-by-bar basis
        const a = [100, 102, 100, 103, 99, 104, 98, 105, 97, 106, 96, 107, 95, 108, 94, 109, 93, 110, 92, 111, 91];
        const b = [100, 98, 100, 97, 101, 96, 102, 95, 103, 94, 104, 93, 105, 92, 106, 91, 107, 90, 108, 89, 109];
        const result = computeCorrelation(a, b, 20);
        expect(result.correlation).toBeLessThan(-0.5);
        expect(result.present).toBe(true);
    });

    test('insufficient data returns not present', () => {
        const result = computeCorrelation([1, 2, 3], [4, 5, 6], 20);
        expect(result.present).toBe(false);
    });
});

describe('computeInterMarketDivergence', () => {
    test('flight to safety: stocks down, bonds up', () => {
        const prices = (start, delta, n) => Array.from({ length: n }, (_, i) => start + i * delta);
        const result = computeInterMarketDivergence({
            spy: prices(100, -1, 15),    // stocks falling
            bonds: prices(100, 0.5, 15), // bonds rising
        }, 10);
        expect(result.signals.stockBond).toBe('flight_to_safety');
        expect(result.divergenceScore).toBeGreaterThan(0);
        expect(result.present).toBe(true);
    });

    test('risk on: stocks up, bonds down', () => {
        const prices = (start, delta, n) => Array.from({ length: n }, (_, i) => start + i * delta);
        const result = computeInterMarketDivergence({
            spy: prices(100, 1, 15),      // stocks rising
            bonds: prices(100, -0.5, 15), // bonds falling
        }, 10);
        expect(result.signals.stockBond).toBe('risk_on');
        expect(result.divergenceScore).toBe(0);
    });

    test('handles null markets', () => {
        const result = computeInterMarketDivergence(null);
        expect(result.present).toBe(false);
    });

    test('handles missing market data', () => {
        const result = computeInterMarketDivergence({ spy: [100, 101] }, 10);
        expect(result.present).toBe(false);
    });
});

describe('computeCrossAssetScore', () => {
    test('favorable conditions: low VIX + low correlation', () => {
        const result = computeCrossAssetScore({
            vixLevel: 12,
            correlationData: { correlation: 0.2, regime: 'low_correlation', present: true },
        });
        expect(result.score).toBeGreaterThan(0.6);
        expect(result.riskMultiplier).toBeGreaterThanOrEqual(1.0);
    });

    test('unfavorable conditions: high VIX + divergence', () => {
        const result = computeCrossAssetScore({
            vixLevel: 40,
            interMarketData: { divergenceScore: 0.8, present: true },
        });
        expect(result.score).toBeLessThan(0.3);
        expect(result.riskMultiplier).toBeLessThan(0.5);
    });

    test('returns 0.5 when no data available', () => {
        const result = computeCrossAssetScore({});
        expect(result.score).toBe(0.5);
    });

    test('includes component breakdown', () => {
        const result = computeCrossAssetScore({ vixLevel: 20 });
        expect(result.components).toHaveProperty('vix');
        expect(result.components.vix.zone).toBe('normal');
    });
});

describe('computeReturns', () => {
    test('computes percentage returns', () => {
        const returns = computeReturns([100, 110, 105]);
        expect(returns[0]).toBeCloseTo(0.1, 4);   // 10% up
        expect(returns[1]).toBeCloseTo(-0.0455, 3); // ~4.5% down
    });

    test('handles zero prices', () => {
        const returns = computeReturns([0, 100, 200]);
        expect(returns[0]).toBe(0); // 0 price → 0 return
    });
});
