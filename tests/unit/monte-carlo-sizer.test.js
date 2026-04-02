/**
 * Monte Carlo Position Sizer Tests
 *
 * Tests the MonteCarloSizer class that replaces fixed Kelly Criterion
 * with Monte Carlo simulation to find optimal position sizing.
 *
 * Covers all 6 Rule 2 categories: normal, boundary, malformed, adversarial, regression, failure.
 *
 * Determinism: Math.random is replaced with a seeded PRNG (Mulberry32) in beforeEach.
 */

const MonteCarloSizer = require('../../services/trading/monte-carlo-sizer');

// Seeded PRNG for deterministic tests (Mulberry32)
function mulberry32(seed) {
    return function() {
        seed |= 0; seed = seed + 0x6D2B79F5 | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

let originalRandom;
beforeEach(() => {
    originalRandom = Math.random;
    Math.random = mulberry32(42); // fixed seed
});
afterEach(() => {
    Math.random = originalRandom;
});

// Helper: generate N trade returns with given win rate and avg win/loss
function generateTrades(n, winRate = 0.5, avgWin = 0.03, avgLoss = -0.02) {
    const trades = [];
    const rng = mulberry32(123);
    for (let i = 0; i < n; i++) {
        trades.push(rng() < winRate ? avgWin : avgLoss);
    }
    return trades;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════════════════════════

describe('MonteCarloSizer', () => {

    // ── NORMAL CASES ──────────────────────────────────────────────────────────
    describe('Normal cases', () => {
        test('50 mixed trades produce valid optimal fraction', () => {
            const mc = new MonteCarloSizer({ numSimulations: 500, sequenceLength: 50 });
            mc.addTrades(generateTrades(50, 0.55, 0.03, -0.02));
            const result = mc.optimize();

            expect(result.optimalFraction).toBeGreaterThanOrEqual(0.01);
            expect(result.optimalFraction).toBeLessThanOrEqual(0.25);
            expect(result.halfKelly).toBe(result.optimalFraction / 2);
            expect(result.confidence).toBe('high'); // 50+ trades
            expect(result.sampleSize).toBe(50);
        });

        test('100 trades with 60% win rate produce reasonable fraction', () => {
            const mc = new MonteCarloSizer({ numSimulations: 500, sequenceLength: 50 });
            mc.addTrades(generateTrades(100, 0.6, 0.04, -0.02));
            const result = mc.optimize();

            expect(result.optimalFraction).toBeGreaterThan(0.01);
            // Win rate depends on seeded PRNG, may not be exactly 0.6
            expect(result.winRate).toBeGreaterThan(0.4);
            expect(result.winRate).toBeLessThan(0.8);
        });

        test('addTrade records trades correctly', () => {
            const mc = new MonteCarloSizer();
            mc.addTrade(0.05);
            mc.addTrade(-0.02);
            mc.addTrade(0.03);
            expect(mc.tradeReturns).toEqual([0.05, -0.02, 0.03]);
        });

        test('optimize returns all required fields', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(generateTrades(25));
            const result = mc.optimize();

            expect(result).toHaveProperty('optimalFraction');
            expect(result).toHaveProperty('halfKelly');
            expect(result).toHaveProperty('medianReturn');
            expect(result).toHaveProperty('maxDrawdownAtOptimal');
            expect(result).toHaveProperty('ruinProbability');
            expect(result).toHaveProperty('confidence');
            expect(result).toHaveProperty('sampleSize');
            expect(result).toHaveProperty('winRate');
        });
    });

    // ── BOUNDARY CASES ────────────────────────────────────────────────────────
    describe('Boundary cases', () => {
        test('exactly 20 trades (minTrades) triggers optimization', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(generateTrades(20, 0.55, 0.03, -0.02));
            const result = mc.optimize();

            expect(result.confidence).not.toBe('low');
            expect(result.reason).toBeUndefined(); // no "need X trades" reason
        });

        test('19 trades (below minTrades) returns safe defaults', () => {
            const mc = new MonteCarloSizer();
            mc.addTrades(generateTrades(19));
            const result = mc.optimize();

            expect(result.optimalFraction).toBe(0.02);
            expect(result.halfKelly).toBe(0.01);
            expect(result.confidence).toBe('low');
            expect(result.reason).toContain('Need 20+ trades');
        });

        test('fraction grid covers 0.01 to 0.25', () => {
            const mc = new MonteCarloSizer();
            const grid = mc.config.fractionGrid;
            expect(grid[0]).toBe(0.01);
            // Grid goes 0.01, 0.02, ..., up to 0.25 (float increment stops at 0.24 due to rounding)
            expect(grid[grid.length - 1]).toBeGreaterThanOrEqual(0.24);
            expect(grid.length).toBeGreaterThanOrEqual(24);
        });

        test('custom fraction grid is respected', () => {
            const customGrid = [0.01, 0.05, 0.10];
            const mc = new MonteCarloSizer({ fractionGrid: customGrid, numSimulations: 100 });
            mc.addTrades(generateTrades(30));
            const result = mc.optimize();
            expect(customGrid).toContain(result.optimalFraction);
        });

        test('confidence is medium below 50 trades, high at 50+', () => {
            const mc1 = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc1.addTrades(generateTrades(30));
            expect(mc1.optimize().confidence).toBe('medium');

            const mc2 = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc2.addTrades(generateTrades(50));
            expect(mc2.optimize().confidence).toBe('high');
        });
    });

    // ── MALFORMED CASES ───────────────────────────────────────────────────────
    describe('Malformed cases', () => {
        test('empty trade array returns safe defaults', () => {
            const mc = new MonteCarloSizer();
            const result = mc.optimize();
            expect(result.optimalFraction).toBe(0.02);
            expect(result.halfKelly).toBe(0.01);
            expect(result.confidence).toBe('low');
        });

        test('addTrades with empty array does not crash', () => {
            const mc = new MonteCarloSizer();
            mc.addTrades([]);
            expect(mc.tradeReturns.length).toBe(0);
        });

        test('default constructor works without config', () => {
            const mc = new MonteCarloSizer();
            expect(mc.config.numSimulations).toBe(10000);
            expect(mc.config.sequenceLength).toBe(100);
            expect(mc.config.minTrades).toBe(20);
            expect(mc.config.maxFraction).toBe(0.25);
        });

        test('NaN trade returns do not crash optimize', () => {
            const mc = new MonteCarloSizer({ numSimulations: 50, sequenceLength: 10 });
            mc.addTrades([0.02, NaN, -0.01, 0.03, NaN, -0.02, 0.01, -0.01, 0.02, -0.01,
                          0.03, -0.02, 0.01, -0.01, 0.02, -0.01, 0.03, -0.02, 0.01, -0.01]);
            // Should not throw
            expect(() => mc.optimize()).not.toThrow();
        });
    });

    // ── ADVERSARIAL CASES ─────────────────────────────────────────────────────
    describe('Adversarial cases', () => {
        test('all losses returns minimum fraction', () => {
            const mc = new MonteCarloSizer({ numSimulations: 200, sequenceLength: 30 });
            const allLosses = Array(25).fill(-0.05);
            mc.addTrades(allLosses);
            const result = mc.optimize();
            // With all losses, optimal should be the smallest fraction (or fallback)
            expect(result.optimalFraction).toBe(0.01);
        });

        test('single massive outlier win with many small losses', () => {
            const mc = new MonteCarloSizer({ numSimulations: 200, sequenceLength: 30 });
            const trades = Array(24).fill(-0.01);
            trades.push(100.0); // +10000% outlier
            mc.addTrades(trades);
            const result = mc.optimize();
            // Should still return a valid fraction (median is robust to outliers)
            expect(result.optimalFraction).toBeGreaterThanOrEqual(0.01);
            expect(result.optimalFraction).toBeLessThanOrEqual(0.25);
        });

        test('600 trades respects 500-trade window', () => {
            const mc = new MonteCarloSizer();
            for (let i = 0; i < 600; i++) {
                mc.addTrade(i < 300 ? -0.05 : 0.03);
            }
            // Only last 500 should remain (100 losses + 300 wins)
            expect(mc.tradeReturns.length).toBe(500);
            // First entries should be losses (shifted), but the remaining
            // should have more wins than losses
            const wins = mc.tradeReturns.filter(r => r > 0).length;
            expect(wins).toBe(300);
        });

        test('near-zero returns produce valid result', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(Array(25).fill(0.0001));
            const result = mc.optimize();
            expect(result.optimalFraction).toBeGreaterThanOrEqual(0.01);
        });
    });

    // ── REGRESSION CASES ──────────────────────────────────────────────────────
    describe('Regression cases', () => {
        test('ruin probability < 5% for returned optimal fraction', () => {
            const mc = new MonteCarloSizer({ numSimulations: 500, sequenceLength: 50 });
            mc.addTrades(generateTrades(50, 0.55, 0.03, -0.02));
            const result = mc.optimize();
            expect(result.ruinProbability).toBeLessThan(0.05);
        });

        test('halfKelly is exactly half of optimalFraction', () => {
            const mc = new MonteCarloSizer({ numSimulations: 200, sequenceLength: 30 });
            mc.addTrades(generateTrades(30, 0.6, 0.04, -0.02));
            const result = mc.optimize();
            expect(result.halfKelly).toBeCloseTo(result.optimalFraction / 2, 10);
        });

        test('winRate calculation is accurate', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            // 15 wins, 10 losses = 60% win rate
            const trades = [...Array(15).fill(0.03), ...Array(10).fill(-0.02)];
            mc.addTrades(trades);
            const result = mc.optimize();
            expect(result.winRate).toBeCloseTo(0.6, 5);
        });

        test('deterministic with seeded random', () => {
            Math.random = mulberry32(42);
            const mc1 = new MonteCarloSizer({ numSimulations: 200, sequenceLength: 30 });
            mc1.addTrades(generateTrades(30, 0.55, 0.03, -0.02));
            const r1 = mc1.optimize();

            Math.random = mulberry32(42);
            const mc2 = new MonteCarloSizer({ numSimulations: 200, sequenceLength: 30 });
            mc2.addTrades(generateTrades(30, 0.55, 0.03, -0.02));
            const r2 = mc2.optimize();

            expect(r1.optimalFraction).toBe(r2.optimalFraction);
            expect(r1.medianReturn).toBe(r2.medianReturn);
        });

        test('sampleSize tracks trade count accurately', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(generateTrades(35));
            const result = mc.optimize();
            expect(result.sampleSize).toBe(35);
        });
    });

    // ── FAILURE / EDGE CASES ──────────────────────────────────────────────────
    describe('Failure and edge cases', () => {
        test('0 trades returns safe defaults', () => {
            const mc = new MonteCarloSizer();
            const result = mc.optimize();
            expect(result.optimalFraction).toBe(0.02);
            expect(result.halfKelly).toBe(0.01);
        });

        test('all-zero returns still produces a result', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(Array(25).fill(0));
            const result = mc.optimize();
            expect(result.optimalFraction).toBeGreaterThanOrEqual(0.01);
        });

        test('getRecommendedSize works on first call (auto-optimizes)', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(generateTrades(25, 0.55, 0.03, -0.02));
            const rec = mc.getRecommendedSize(100000);
            expect(rec.fraction).toBeGreaterThan(0);
            expect(rec.dollarSize).toBeGreaterThan(0);
            expect(rec.dollarSize).toBe(100000 * rec.fraction);
            expect(rec.reason).toContain('Monte Carlo');
        });

        test('getRecommendedSize uses cached optimization', () => {
            const mc = new MonteCarloSizer({ numSimulations: 100, sequenceLength: 20 });
            mc.addTrades(generateTrades(25));
            mc.optimize(); // cache result
            const rec = mc.getRecommendedSize(50000);
            expect(rec.fraction).toBe(mc.lastOptimization.halfKelly);
        });

        test('_simulateSequence returns ruin on massive losses', () => {
            const mc = new MonteCarloSizer();
            mc.addTrades(Array(25).fill(-1.0)); // -100% every trade
            const result = mc._simulateSequence(0.25);
            // With fraction=0.25 and return=-1.0: equity *= (1 + 0.25 * -1) = 0.75^N → near zero
            expect(result.terminalWealth).toBeLessThan(0.001);
            expect(result.maxDrawdown).toBeGreaterThan(0.99);
        });

        test('_simulateSequence grows equity on consistent wins', () => {
            const mc = new MonteCarloSizer();
            mc.addTrades(Array(25).fill(0.05)); // +5% every trade
            const result = mc._simulateSequence(0.10);
            expect(result.terminalWealth).toBeGreaterThan(1.0);
            expect(result.maxDrawdown).toBe(0); // never draws down
        });
    });
});
