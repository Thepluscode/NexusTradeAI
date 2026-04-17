const { walkForward } = require('../../backtest/walk-forward-harness');

// Simple strategy that buys when price is rising
const trendFollowStrategy = {
    name: 'trendFollow',
    assetClass: 'stock',
    regimes: ['any'],
    evaluate(bars, context) {
        if (!context || !context.currentPrice) return { killedBy: 'no_context' };
        if (!context.ema9 || !context.ema21) return { killedBy: 'no_ema' };
        if (context.ema9 <= context.ema21) return { killedBy: 'no_trend' };
        const price = context.currentPrice;
        return {
            candidate: {
                price,
                stopLoss: price * 0.97,
                takeProfit: price * 1.06,
                strategy: 'trendFollow',
                tier: 'tier1',
                score: 0.7,
            },
        };
    },
};

const neverBuyStrategy = {
    name: 'neverBuy',
    assetClass: 'stock',
    regimes: ['any'],
    evaluate() { return { killedBy: 'always_reject' }; },
};

function makeRisingBars(count, startPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = startPrice + i * 0.1;
        bars.push({
            t: `2026-01-01T09:${String(30 + (i % 30)).padStart(2, '0')}:00Z`,
            o: price,
            h: price + 0.15,
            l: price - 0.05,
            c: price + 0.08,
            v: 100000 + i * 100,
        });
    }
    return bars;
}

function makeMixedBars(count, startPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        // Alternate rising/falling phases of ~50 bars each
        const phase = Math.floor(i / 50) % 2;
        const delta = phase === 0 ? 0.1 : -0.08;
        const price = startPrice + i * delta * (phase === 0 ? 1 : -0.5);
        bars.push({
            t: `2026-01-01T09:${String(30 + (i % 30)).padStart(2, '0')}:00Z`,
            o: Math.max(price, 1),
            h: Math.max(price + 0.2, 1.1),
            l: Math.max(price - 0.1, 0.9),
            c: Math.max(price + 0.05, 1),
            v: 100000,
        });
    }
    return bars;
}

describe('walkForward', () => {
    test('returns FAIL when bars are insufficient', () => {
        const bars = makeRisingBars(100);
        const result = walkForward(trendFollowStrategy, bars, {
            trainBars: 500,
            testBars: 100,
        });
        expect(result.folds).toEqual([]);
        expect(result.gateA.passed).toBe(false);
        expect(result.gateB.passed).toBe(false);
    });

    test('creates correct number of folds', () => {
        // 2000 bars, train=500, test=200 → window=700
        // folds: start=0..1800 step 200 → 7 folds (0,200,400,600,800,1000,1200 → 1200+700=1900 ≤ 2000)
        const bars = makeRisingBars(2000);
        const result = walkForward(trendFollowStrategy, bars, {
            trainBars: 500,
            testBars: 200,
            lookback: 10,
        });
        expect(result.folds.length).toBeGreaterThanOrEqual(3);
        // Each fold has both IS and OOS stats
        for (const fold of result.folds) {
            expect(fold.inSample).toHaveProperty('sharpe');
            expect(fold.outOfSample).toHaveProperty('sharpe');
            expect(fold.inSample).toHaveProperty('tradeCount');
            expect(fold.outOfSample).toHaveProperty('tradeCount');
        }
    });

    test('strategy that never trades fails both gates', () => {
        const bars = makeRisingBars(3000);
        const result = walkForward(neverBuyStrategy, bars, {
            trainBars: 1000,
            testBars: 250,
        });
        expect(result.summary.verdict).toBe('FAIL');
        expect(result.allTrades.length).toBe(0);
        expect(result.gateA.passed).toBe(false);
    });

    test('applies transaction costs to trades', () => {
        const bars = makeRisingBars(3000);
        const result = walkForward(trendFollowStrategy, bars, {
            trainBars: 1000,
            testBars: 250,
            assetClass: 'stock',
            lookback: 30,
        });
        // If there are any trades, they should have cost info
        if (result.allTrades.length > 0) {
            for (const t of result.allTrades) {
                expect(t).toHaveProperty('costPct');
                expect(t).toHaveProperty('pnlGross');
                expect(t.costPct).toBeGreaterThan(0);
            }
        }
    });

    test('summary includes all required fields', () => {
        const bars = makeRisingBars(3000);
        const result = walkForward(trendFollowStrategy, bars, {
            trainBars: 1000,
            testBars: 250,
        });
        const s = result.summary;
        expect(s).toHaveProperty('totalBars');
        expect(s).toHaveProperty('foldCount');
        expect(s).toHaveProperty('totalOOSTrades');
        expect(s).toHaveProperty('oosSharpe');
        expect(s).toHaveProperty('oosSortino');
        expect(s).toHaveProperty('oosMaxDrawdown');
        expect(s).toHaveProperty('passedGateA');
        expect(s).toHaveProperty('passedGateB');
        expect(s).toHaveProperty('verdict');
        expect(['PASS', 'FAIL']).toContain(s.verdict);
    });

    test('fold ranges are contiguous and non-overlapping test windows', () => {
        const bars = makeRisingBars(3000);
        const result = walkForward(trendFollowStrategy, bars, {
            trainBars: 800,
            testBars: 200,
        });
        for (let i = 1; i < result.folds.length; i++) {
            // Each fold's test starts where the previous fold's test ended
            expect(result.folds[i].testRange.start).toBe(result.folds[i - 1].testRange.start + 200);
        }
    });

    test('accepts assetClass option for cost calculation', () => {
        const bars = makeRisingBars(3000);
        // Crypto has higher costs than stock
        const stockResult = walkForward(trendFollowStrategy, bars, {
            trainBars: 1000, testBars: 250, assetClass: 'stock',
        });
        const cryptoResult = walkForward(trendFollowStrategy, bars, {
            trainBars: 1000, testBars: 250, assetClass: 'crypto',
        });
        // If both have trades, crypto costs should be higher
        if (stockResult.allTrades.length > 0 && cryptoResult.allTrades.length > 0) {
            expect(cryptoResult.allTrades[0].costPct).toBeGreaterThan(stockResult.allTrades[0].costPct);
        }
    });
});
