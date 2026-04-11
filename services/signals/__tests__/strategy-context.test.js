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
        // Plan 1 does NOT include adx/atr — those arrive with Plan 3 (ORB port)
        expect(ctx.adx).toBeUndefined();
        expect(ctx.atr).toBeUndefined();
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
