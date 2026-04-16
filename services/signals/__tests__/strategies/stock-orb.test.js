'use strict';

const orb = require('../../strategies/stock-orb');

// Helper: build N bars with given close price trajectory
function makeBars(closes, volumes) {
    return closes.map((c, i) => {
        const o = i === 0 ? c : closes[i - 1];
        const v = (volumes && volumes[i]) ?? 10000;
        const h = Math.max(o, c) * 1.001;
        const l = Math.min(o, c) * 0.999;
        return { o, h, l, c, v };
    });
}

// Build ORB bars: 15 opening-range bars + N confirmation bars
function makeOrbSetup({
    openingHigh = 100,
    currentPrice = 101,
    volumeRatio = 2.0,
    bullishBars = 3,
    totalBars = 18,
}) {
    const openingBars = [];
    for (let i = 0; i < 15; i++) {
        openingBars.push({ o: 99, h: openingHigh, l: 98, c: 99.5, v: 10000 });
    }
    const confirmationBars = [];
    for (let i = 0; i < totalBars - 15; i++) {
        const isBullish = i < bullishBars;
        confirmationBars.push({
            o: isBullish ? openingHigh : currentPrice + 0.5,
            h: currentPrice * 1.005,
            l: openingHigh * 0.99,
            c: isBullish ? currentPrice : openingHigh,
            v: 10000 * volumeRatio,
        });
    }
    return [...openingBars, ...confirmationBars];
}

describe('stockOrb strategy', () => {
    describe('registry interface', () => {
        test('exports correct metadata', () => {
            expect(orb.name).toBe('stockOrb');
            expect(orb.assetClass).toBe('stock');
            expect(orb.regimes).toContain('opening-range');
            expect(typeof orb.evaluate).toBe('function');
        });
    });

    describe('time window gate', () => {
        test('rejects outside ORB window', () => {
            const bars = makeOrbSetup({});
            const result = orb.evaluate(bars, {
                orbWindowOverride: false,
                currentPrice: 101, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('outside_orb_window');
        });
    });

    describe('bar count', () => {
        test('rejects with < 18 bars', () => {
            const shortBars = makeOrbSetup({ totalBars: 17 });
            const result = orb.evaluate(shortBars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('insufficient_bars');
        });
    });

    describe('breakout trigger', () => {
        test('rejects when price below breakout trigger', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 99.5 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 99.5, vwap: 99, rsi: 55,
            });
            expect(result.killedBy).toBe('no_breakout');
        });

        test('rejects overextended breakout (> 3%)', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 104 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 104, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('breakout_out_of_range');
        });
    });

    describe('bullish confirmation', () => {
        test('rejects if < 2 bullish bars in last 3', () => {
            const bars = makeOrbSetup({
                openingHigh: 100, currentPrice: 101, bullishBars: 1,
            });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('insufficient_bullish_bars');
        });
    });

    describe('volume surge', () => {
        test('rejects if recent volume < 1.8× opening', () => {
            const bars = makeOrbSetup({
                openingHigh: 100, currentPrice: 101, volumeRatio: 1.2,
            });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('low_volume_surge');
        });
    });

    describe('VWAP gate', () => {
        test('rejects if current price below VWAP', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 101 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 102, rsi: 55,
            });
            expect(result.killedBy).toBe('below_vwap');
        });

        test('allows if VWAP not provided', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 101 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, rsi: 55,
            });
            expect(result.candidate).toBeDefined();
        });
    });

    describe('RSI gate', () => {
        test('rejects RSI < 48', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 101 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 40,
            });
            expect(result.killedBy).toBe('rsi_out_of_range');
        });

        test('rejects RSI > 68', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 101 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 75,
            });
            expect(result.killedBy).toBe('rsi_out_of_range');
        });

        test('accepts RSI in [48, 68]', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 101 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 60,
            });
            expect(result.candidate).toBeDefined();
        });
    });

    describe('candidate output', () => {
        test('returns well-formed candidate on valid setup', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 101 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 55,
                regimeQuality: 0.8,
            });
            expect(result.candidate).toBeDefined();
            expect(result.candidate.strategy).toBe('stockOrb');
            expect(result.candidate.tier).toBe('orb');
            expect(result.candidate.regime).toBe('opening-range');
            expect(result.candidate.score).toBeGreaterThan(0);
            expect(result.candidate.score).toBeLessThanOrEqual(1);
            expect(result.candidate.stopLoss).toBeLessThan(101);
            expect(result.candidate.takeProfit).toBeGreaterThan(101);
        });

        test('stopLoss is 2.5% below entry', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 100.5 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 100.5, vwap: 100, rsi: 55,
            });
            expect(result.candidate.stopLoss).toBeCloseTo(100.5 * 0.975, 2);
        });

        test('takeProfit is 5.0% above entry (2:1 R:R)', () => {
            const bars = makeOrbSetup({ openingHigh: 100, currentPrice: 100.5 });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 100.5, vwap: 100, rsi: 55,
            });
            expect(result.candidate.takeProfit).toBeCloseTo(100.5 * 1.05, 2);
        });

        test('score weighted: 35% breakout + 30% volume + 20% RSI + 15% regime', () => {
            const bars = makeOrbSetup({
                openingHigh: 100, currentPrice: 101, volumeRatio: 4.0,
            });
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 60, // perfect RSI
                regimeQuality: 1.0,
            });
            // breakoutPct = (101 - 100.1) / 100 ≈ 0.009 → normBreakout ~0.18
            // volume ratio = 4.0 → normVolume = 1.0
            // RSI=60 → rsiBonus=1.15 → normRsi = 1.0
            // regime = 1.0
            // score ≈ 0.18*0.35 + 1.0*0.30 + 1.0*0.20 + 1.0*0.15 ≈ 0.713
            expect(result.candidate.score).toBeGreaterThan(0.5);
        });
    });

    describe('edge cases', () => {
        test('handles null context gracefully', () => {
            const result = orb.evaluate([], null);
            expect(result.killedBy).toBe('no_context');
        });

        test('handles non-array bars', () => {
            const result = orb.evaluate(null, {
                orbWindowOverride: true, currentPrice: 101, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('insufficient_bars');
        });

        test('handles missing currentPrice', () => {
            const bars = makeOrbSetup({});
            const result = orb.evaluate(bars, {
                orbWindowOverride: true, vwap: 100, rsi: 55,
            });
            expect(result.killedBy).toBe('no_current_price');
        });
    });
});
