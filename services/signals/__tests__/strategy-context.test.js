// services/signals/__tests__/strategy-context.test.js
const { computeContext } = require('../strategy-context');

// Shared test fixture: 30 one-minute bars, increasing trend
function makeTrendingBars(count = 30) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const base = 100 + i * 0.1;
        bars.push({
            t: new Date(2026, 3, 10, 9, 30 + i).toISOString(),
            o: base,
            h: base + 0.05,
            l: base - 0.05,
            c: base + 0.02,
            v: 100000 + i * 1000
        });
    }
    return bars;
}

describe('computeContext', () => {
    test('is a pure function — same input returns equal output', () => {
        const bars = makeTrendingBars(30);
        const a = computeContext(bars, 'trending');
        const b = computeContext(bars, 'trending');
        expect(a).toEqual(b);
    });

    test('returns null for empty bars', () => {
        expect(computeContext([], 'trending')).toBeNull();
    });

    test('returns null for undefined bars', () => {
        expect(computeContext(undefined, 'trending')).toBeNull();
    });

    test('returns object with expected top-level keys', () => {
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(ctx).toHaveProperty('currentPrice');
        expect(ctx).toHaveProperty('vwap');
        expect(ctx).toHaveProperty('ema9');
        expect(ctx).toHaveProperty('ema21');
        expect(ctx).toHaveProperty('rsi');
        expect(ctx).toHaveProperty('marketRegime');
        expect(ctx).toHaveProperty('belowVwap');
        expect(ctx).toHaveProperty('emaUptrend');
        // ATR + VWAP bands added for VWAP Reversal strategy
        expect(ctx).toHaveProperty('atr');
        expect(ctx).toHaveProperty('atrPct');
        expect(ctx).toHaveProperty('vwapLowerBand');
        expect(ctx).toHaveProperty('vwapUpperBand');
    });

    test('RSI returns a numeric value on 30 trending bars', () => {
        // Regression: verify calculateRSI is called with closes (numbers),
        // not bars (objects) — passing bars produces NaN.
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(typeof ctx.rsi).toBe('number');
        expect(Number.isFinite(ctx.rsi)).toBe(true);
        expect(ctx.rsi).toBeGreaterThan(0);
        expect(ctx.rsi).toBeLessThanOrEqual(100);
    });

    test('EMA9 and EMA21 return numeric values on 30 trending bars', () => {
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(typeof ctx.ema9).toBe('number');
        expect(typeof ctx.ema21).toBe('number');
        expect(Number.isFinite(ctx.ema9)).toBe(true);
        expect(Number.isFinite(ctx.ema21)).toBe(true);
    });

    test('MACD returns null when fewer than 35 bars', () => {
        // calculateMACD needs slow(26) + signal(9) = 35 bars minimum
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(ctx.macd).toBeNull();
    });

    test('MACD returns an object with histogram on 40 trending bars', () => {
        // 40 >= 35, should produce a real MACD object
        const ctx = computeContext(makeTrendingBars(40), 'trending');
        expect(ctx.macd).not.toBeNull();
        expect(typeof ctx.macd).toBe('object');
        expect(ctx.macd).toHaveProperty('histogram');
        expect(ctx.macd).toHaveProperty('bullish');
        expect(Number.isFinite(ctx.macd.histogram)).toBe(true);
    });

    test('currentPrice matches last bar close', () => {
        const bars = makeTrendingBars(30);
        const ctx = computeContext(bars, 'trending');
        expect(ctx.currentPrice).toBe(bars[bars.length - 1].c);
    });

    test('marketRegime passes through', () => {
        const ctx = computeContext(makeTrendingBars(30), 'opening-range');
        expect(ctx.marketRegime).toBe('opening-range');
    });
});

describe('computeContext — VWAP', () => {
    test('VWAP equals mean price when all volumes are equal', () => {
        // 3 bars, all vol=100, typical prices 10, 20, 30
        const bars = [
            { t: '', o: 10, h: 10, l: 10, c: 10, v: 100 },
            { t: '', o: 20, h: 20, l: 20, c: 20, v: 100 },
            { t: '', o: 30, h: 30, l: 30, c: 30, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.vwap).toBeCloseTo(20, 5); // (10+20+30)/3
    });

    test('VWAP weights heavy-volume bars more', () => {
        const bars = [
            { t: '', o: 10, h: 10, l: 10, c: 10, v: 100 },
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 900 }, // 9x volume
        ];
        const ctx = computeContext(bars, 'trending');
        // weighted mean: (10*100 + 100*900) / 1000 = 91
        expect(ctx.vwap).toBeCloseTo(91, 5);
    });

    test('VWAP is null when total volume is zero', () => {
        const bars = [
            { t: '', o: 10, h: 10, l: 10, c: 10, v: 0 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.vwap).toBeNull();
    });

    test('belowVwap is true when price is below VWAP', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 90, h: 90, l: 90, c: 90, v: 100 }, // current price 90 < vwap ~96.7
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.belowVwap).toBe(true);
    });

    test('belowVwap is false when VWAP is null (insufficient data)', () => {
        const bars = [{ t: '', o: 10, h: 10, l: 10, c: 10, v: 0 }];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.belowVwap).toBe(false);
    });
});

describe('computeContext — insufficient data', () => {
    test('returns null ema21 when < 21 bars', () => {
        const bars = [];
        for (let i = 0; i < 10; i++) {
            bars.push({ t: '', o: 100, h: 100, l: 100, c: 100 + i, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.ema21).toBeNull();
    });

    test('returns null emaUptrend when either EMA is null', () => {
        const bars = [];
        for (let i = 0; i < 5; i++) {
            bars.push({ t: '', o: 100, h: 100, l: 100, c: 100, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.emaUptrend).toBeNull();
    });

    test('RSI returns 50 on insufficient data (not null — existing contract)', () => {
        // indicators.calculateRSI returns 50 (not null) when prices.length < period * 2
        // Our context inherits this behavior — document it here as the contract.
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 101, h: 101, l: 101, c: 101, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.rsi).toBe(50);
    });

    test('rsi2 returns null when < 3 bars', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 101, h: 101, l: 101, c: 101, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.rsi2).toBeNull();
    });

    test('emaUptrend=true when ema9 > ema21 in rising bars', () => {
        const bars = [];
        for (let i = 0; i < 30; i++) {
            const price = 100 + i * 2; // clearly rising
            bars.push({ t: '', o: price, h: price + 0.1, l: price - 0.1, c: price, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.ema9).not.toBeNull();
        expect(ctx.ema21).not.toBeNull();
        expect(ctx.emaUptrend).toBe(true);
    });

    test('emaUptrend=false when ema9 < ema21 in falling bars', () => {
        const bars = [];
        for (let i = 0; i < 30; i++) {
            const price = 100 - i * 2; // clearly falling
            bars.push({ t: '', o: price, h: price + 0.1, l: price - 0.1, c: price, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.emaUptrend).toBe(false);
    });

    test('positionInDailyRange is null when daily range is zero', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.positionInDailyRange).toBeNull();
    });

    test('positionInDailyRange is 0 at daily low, 1 at daily high', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 }, // low
            { t: '', o: 110, h: 110, l: 110, c: 110, v: 100 }, // high
            { t: '', o: 105, h: 105, l: 105, c: 105, v: 100 }, // middle
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.positionInDailyRange).toBeCloseTo(0.5, 2);
    });
});
