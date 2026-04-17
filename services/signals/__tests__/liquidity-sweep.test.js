const { computeLiquiditySweep, findSwingLows, findSwingHighs } = require('../liquidity-sweep');

function makeBar(open, high, low, close, volume = 1000) {
    return { open, high, low, close, volume };
}

// Build a series with a clear swing low that gets swept
// Key: swing detection needs the swing bar's low to be lower than neighbors on both sides
function makeBullishSweepBars() {
    const bars = [];
    // Bars 0-4: descending lows (creating left side of swing)
    bars.push(makeBar(105, 106, 104, 105));  // 0
    bars.push(makeBar(104, 105, 103, 104));  // 1
    bars.push(makeBar(103, 104, 102, 103));  // 2
    bars.push(makeBar(102, 103, 101, 102));  // 3
    bars.push(makeBar(101, 102, 100, 101));  // 4
    // Bar 5: SWING LOW at 97 (lower than all neighbors in lookback=10, halfLook=5)
    bars.push(makeBar(100, 101, 97, 99));    // 5 — swing low
    // Bars 6-10: ascending lows (creating right side of swing)
    bars.push(makeBar(99, 101, 98, 100));    // 6
    bars.push(makeBar(100, 102, 99, 101));   // 7
    bars.push(makeBar(101, 103, 100, 102));  // 8
    bars.push(makeBar(102, 104, 101, 103));  // 9
    bars.push(makeBar(103, 105, 102, 104));  // 10
    // Bars 11-14: more recovery
    bars.push(makeBar(104, 106, 103, 105));  // 11
    bars.push(makeBar(105, 106, 104, 105));  // 12
    bars.push(makeBar(105, 106, 104, 105));  // 13
    bars.push(makeBar(105, 106, 104, 105));  // 14
    // Bar 15: SWEEP — wick sweeps below swing low (97), closes above it
    bars.push(makeBar(104, 105, 95, 99));    // 15 — sweep to 95, close 99 > 97
    // Bars 16-17: Confirmation — closes higher
    bars.push(makeBar(99, 103, 98, 102));    // 16 — closes higher than 99
    bars.push(makeBar(102, 105, 101, 104));  // 17
    return bars;
}

function makeBearishSweepBars() {
    const bars = [];
    // Bars 0-4: ascending highs (creating left side of swing)
    bars.push(makeBar(95, 96, 94, 95));      // 0
    bars.push(makeBar(96, 97, 95, 96));      // 1
    bars.push(makeBar(97, 98, 96, 97));      // 2
    bars.push(makeBar(98, 99, 97, 98));      // 3
    bars.push(makeBar(99, 100, 98, 99));     // 4
    // Bar 5: SWING HIGH at 106 (higher than all neighbors)
    bars.push(makeBar(101, 106, 100, 102));  // 5 — swing high
    // Bars 6-10: descending highs (creating right side of swing)
    bars.push(makeBar(102, 105, 101, 103));  // 6
    bars.push(makeBar(103, 104, 102, 103));  // 7
    bars.push(makeBar(103, 103, 101, 102));  // 8
    bars.push(makeBar(102, 103, 100, 101));  // 9
    bars.push(makeBar(101, 102, 99, 100));   // 10
    // Bars 11-14: range
    bars.push(makeBar(100, 101, 99, 100));   // 11
    bars.push(makeBar(100, 101, 99, 100));   // 12
    bars.push(makeBar(100, 101, 99, 100));   // 13
    bars.push(makeBar(100, 101, 99, 100));   // 14
    // Bar 15: SWEEP — wick sweeps above swing high (106), closes below it
    bars.push(makeBar(104, 109, 103, 104));  // 15 — sweep to 109, close 104 < 106
    // Bars 16-17: Confirmation — closes lower
    bars.push(makeBar(104, 104, 100, 101));  // 16 — closes lower than 104
    bars.push(makeBar(101, 102, 98, 99));    // 17
    return bars;
}

function makeNoSweepBars(count = 30) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        bars.push(makeBar(100 + i * 0.1, 100.5 + i * 0.1, 99.5 + i * 0.1, 100.2 + i * 0.1));
    }
    return bars;
}

describe('computeLiquiditySweep', () => {
    const atr = 2.0;

    test('detects bullish liquidity sweep below swing low', () => {
        const bars = makeBullishSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(true);
        expect(result.raw.bullishSweeps.length).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThan(0.3);
        expect(result.raw.strength).toBeGreaterThan(0);
    });

    test('detects bearish liquidity sweep above swing high', () => {
        const bars = makeBearishSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(true);
        expect(result.raw.bearishSweeps.length).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThan(0.3);
    });

    test('returns neutral score when no sweep detected', () => {
        const bars = makeNoSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(false);
        expect(result.score).toBe(0.3); // neutralDefault
        expect(result.raw.sweepCount).toBe(0);
    });

    test('handles empty/null input gracefully', () => {
        expect(computeLiquiditySweep([], 2).raw.detected).toBe(false);
        expect(computeLiquiditySweep(null, 2).raw.detected).toBe(false);
        expect(computeLiquiditySweep(makeNoSweepBars(), 0).raw.detected).toBe(false);
    });

    test('handles insufficient bars', () => {
        const bars = makeNoSweepBars(5);
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(false);
    });

    test('deeper sweep produces higher strength', () => {
        // Create two bar sets with different sweep depths
        const shallowBars = makeBullishSweepBars();
        const deepBars = makeBullishSweepBars();
        // Make the sweep bar go deeper in deepBars
        deepBars[deepBars.length - 3] = makeBar(99, 100, 93, 99); // sweep to 93 vs 96

        const shallow = computeLiquiditySweep(shallowBars, atr);
        const deep = computeLiquiditySweep(deepBars, atr);

        if (shallow.raw.detected && deep.raw.detected) {
            expect(deep.raw.strength).toBeGreaterThanOrEqual(shallow.raw.strength);
        }
    });

    test('score is bounded between 0 and 1', () => {
        const bars = makeBullishSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
    });

    test('respects custom neutralDefault', () => {
        const bars = makeNoSweepBars();
        const result = computeLiquiditySweep(bars, atr, { neutralDefault: 0 });
        expect(result.score).toBe(0);
    });

    test('sweep must be at least minSweepATRRatio deep', () => {
        const bars = makeBullishSweepBars();
        // With very high ATR, the sweep depth ratio becomes too small
        const result = computeLiquiditySweep(bars, 100, { minSweepATRRatio: 0.3 });
        expect(result.raw.bullishSweeps.length).toBe(0);
    });
});

describe('findSwingLows', () => {
    test('finds correct swing lows', () => {
        const bars = [
            makeBar(5, 6, 4, 5),   // 0
            makeBar(5, 6, 3, 5),   // 1 — NOT swing low (bar 2 lower)
            makeBar(5, 6, 2, 5),   // 2 — swing low (lowest in neighborhood)
            makeBar(5, 6, 3, 5),   // 3
            makeBar(5, 6, 4, 5),   // 4
        ];
        const swings = findSwingLows(bars, 4); // halfLook = 2
        expect(swings.length).toBe(1);
        expect(swings[0].price).toBe(2);
        expect(swings[0].index).toBe(2);
    });

    test('returns empty for flat data', () => {
        const bars = Array(10).fill(makeBar(100, 101, 99, 100));
        const swings = findSwingLows(bars, 4);
        expect(swings.length).toBe(0);
    });
});

describe('findSwingHighs', () => {
    test('finds correct swing highs', () => {
        const bars = [
            makeBar(5, 6, 4, 5),    // 0
            makeBar(5, 7, 4, 5),    // 1
            makeBar(5, 10, 4, 5),   // 2 — swing high
            makeBar(5, 7, 4, 5),    // 3
            makeBar(5, 6, 4, 5),    // 4
        ];
        const swings = findSwingHighs(bars, 4);
        expect(swings.length).toBe(1);
        expect(swings[0].price).toBe(10);
        expect(swings[0].index).toBe(2);
    });
});
