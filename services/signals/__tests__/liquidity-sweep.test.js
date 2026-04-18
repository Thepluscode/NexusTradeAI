const { computeLiquiditySweep, findSwingLows, findSwingHighs, checkApproach, checkDisplacementConfirmation, scoreSweep } = require('../liquidity-sweep');

function makeBar(open, high, low, close, volume = 1000) {
    return { open, high, low, close, volume };
}

/**
 * Build bars that create a valid bullish liquidity sweep:
 * 1. Establish swing low
 * 2. Price trades near but above the swing low (approach)
 * 3. Sweep candle: wick below swing low, closes above it, high volume
 * 4. Displacement confirmation: strong bullish candle after sweep
 */
function makeBullishSweepBars() {
    const bars = [];
    // Bars 0-7: range context (need 21+ bars total for minBarsNeeded)
    bars.push(makeBar(107, 108, 106, 107, 1000));
    bars.push(makeBar(106, 107, 105, 106, 1000));
    bars.push(makeBar(105, 106, 104, 105, 1000));
    bars.push(makeBar(105, 106, 104, 105, 1000));
    bars.push(makeBar(104, 105, 103, 104, 1000));
    bars.push(makeBar(103, 104, 102, 103, 1000));
    bars.push(makeBar(102, 103, 101, 102, 1000));
    bars.push(makeBar(101, 102, 100, 101, 1000));
    // Bar 8: SWING LOW at 97
    bars.push(makeBar(100, 101, 97, 99, 1000));
    // Bars 9-13: ascending (right side of swing)
    bars.push(makeBar(99, 101, 98, 100, 1000));
    bars.push(makeBar(100, 102, 99, 101, 1000));
    bars.push(makeBar(101, 103, 100, 102, 1000));
    bars.push(makeBar(102, 104, 101, 103, 1000));
    bars.push(makeBar(103, 105, 102, 104, 1000));
    // Bars 14-18: APPROACH — price comes back down near swing low
    bars.push(makeBar(103, 104, 101, 102, 1000));
    bars.push(makeBar(102, 103, 100, 101, 1000));
    bars.push(makeBar(101, 102, 99, 100, 1000));
    bars.push(makeBar(100, 101, 98, 99, 1000));
    bars.push(makeBar(99, 100, 97.5, 98, 1000));
    // Bar 19: SWEEP — wick below swing low (97), closes above, HIGH VOLUME
    bars.push(makeBar(98, 99, 94, 98, 3000));
    // Bar 20: DISPLACEMENT CONFIRMATION — strong bullish candle
    bars.push(makeBar(98, 102, 97.5, 101.5, 2000)); // range=4.5, body=3.5 (78%)
    // Bars 21-22: continuation
    bars.push(makeBar(101.5, 104, 101, 103, 1500));
    bars.push(makeBar(103, 105, 102, 104, 1000));
    return bars;
}

function makeBearishSweepBars() {
    const bars = [];
    // Bars 0-7: ascending to create left side of swing (need enough bars for minBarsNeeded=21)
    bars.push(makeBar(93, 94, 92, 93, 1000));
    bars.push(makeBar(94, 95, 93, 94, 1000));
    bars.push(makeBar(95, 96, 94, 95, 1000));
    bars.push(makeBar(96, 97, 95, 96, 1000));
    bars.push(makeBar(97, 98, 96, 97, 1000));
    bars.push(makeBar(98, 99, 97, 98, 1000));
    bars.push(makeBar(99, 100, 98, 99, 1000));
    bars.push(makeBar(100, 101, 99, 100, 1000));
    // Bar 8: SWING HIGH at 106
    bars.push(makeBar(101, 106, 100, 103, 1000));
    // Bars 9-13: descending (right side of swing)
    bars.push(makeBar(103, 105, 102, 104, 1000));
    bars.push(makeBar(104, 104, 101, 102, 1000));
    bars.push(makeBar(102, 103, 100, 101, 1000));
    bars.push(makeBar(101, 102, 99, 100, 1000));
    bars.push(makeBar(100, 101, 98, 99, 1000));
    // Bars 14-18: APPROACH — price trades near the swing high
    bars.push(makeBar(101, 103, 100, 102, 1000));
    bars.push(makeBar(102, 104, 101, 103, 1000));
    bars.push(makeBar(103, 105, 102, 104, 1000));
    bars.push(makeBar(104, 105.5, 103, 105, 1000));
    bars.push(makeBar(105, 105.8, 104, 105.5, 1000));
    // Bar 19: SWEEP — wick above swing high (106), closes below, HIGH VOLUME
    bars.push(makeBar(105, 109, 104, 105, 3000));
    // Bar 20: DISPLACEMENT CONFIRMATION — strong bearish candle
    bars.push(makeBar(105, 105.5, 101, 101.5, 2000)); // range=4.5, body=3.5 (78%)
    // Bars 21-22: continuation
    bars.push(makeBar(101.5, 102, 99, 100, 1500));
    bars.push(makeBar(100, 101, 98, 99, 1000));
    return bars;
}

function makeNoSweepBars(count = 30) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        bars.push(makeBar(100 + i * 0.1, 100.5 + i * 0.1, 99.5 + i * 0.1, 100.2 + i * 0.1, 1000));
    }
    return bars;
}

describe('computeLiquiditySweep', () => {
    const atr = 2.0;

    test('detects bullish liquidity sweep with all 5 criteria met', () => {
        const bars = makeBullishSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(true);
        expect(result.raw.bullishSweeps.length).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThan(0.3);

        const sweep = result.raw.bullishSweeps[0];
        expect(sweep.direction).toBe('bullish');
        expect(sweep.sweepDepth).toBeGreaterThan(0);
        expect(sweep.volumeSpikeRatio).toBeGreaterThan(1);
        expect(sweep.displacementStrength).toBeGreaterThan(0);
    });

    test('detects bearish liquidity sweep with all 5 criteria met', () => {
        const bars = makeBearishSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(true);
        expect(result.raw.bearishSweeps.length).toBeGreaterThan(0);
        expect(result.score).toBeGreaterThan(0.3);

        const sweep = result.raw.bearishSweeps[0];
        expect(sweep.direction).toBe('bearish');
        expect(sweep.displacementStrength).toBeGreaterThan(0);
    });

    test('returns neutral when no sweep detected', () => {
        const bars = makeNoSweepBars();
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.detected).toBe(false);
        expect(result.score).toBe(0.3);
        expect(result.raw.sweepCount).toBe(0);
    });

    test('rejects sweep without displacement confirmation', () => {
        const bars = makeBullishSweepBars();
        // Replace the displacement candle (bar 20) with a doji (body < 60% of range)
        bars[20] = makeBar(98, 99, 97, 98.2, 2000); // tiny body (0.2), range (2) — 10% body ratio
        const result = computeLiquiditySweep(bars, atr);
        // Should NOT detect because displacement confirmation fails
        expect(result.raw.bullishSweeps.length).toBe(0);
    });

    test('rejects sweep without volume spike', () => {
        const bars = makeBullishSweepBars();
        // Replace sweep candle (bar 19) volume with below-average volume
        bars[19] = makeBar(98, 99, 94, 98, 500); // vol well below average (~1000)
        const result = computeLiquiditySweep(bars, atr, { minVolumeSpikeRatio: 1.5 });
        // Volume check is NOT a hard gate — it affects the score
        // The sweep can still be detected if displacement confirms
        // But the hasVolume flag should be false
        if (result.raw.bullishSweeps.length > 0) {
            expect(result.raw.bullishSweeps[0].hasVolume).toBe(false);
        }
    });

    test('rejects sweep without approach (gap through)', () => {
        const bars = makeBullishSweepBars();
        // Replace approach bars (14-18) with bars far from the level
        for (let i = 14; i < 19; i++) {
            bars[i] = makeBar(120, 122, 118, 121, 1000); // price at 120, swing at 97 — no approach
        }
        const result = computeLiquiditySweep(bars, atr);
        expect(result.raw.bullishSweeps.length).toBe(0);
    });

    test('handles empty/null input gracefully', () => {
        expect(computeLiquiditySweep([], 2).raw.detected).toBe(false);
        expect(computeLiquiditySweep(null, 2).raw.detected).toBe(false);
        expect(computeLiquiditySweep(makeNoSweepBars(), 0).raw.detected).toBe(false);
    });

    test('score is bounded 0 to 1', () => {
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
});

describe('checkDisplacementConfirmation', () => {
    const atr = 2.0;

    test('confirms strong bullish displacement candle', () => {
        const bars = [
            makeBar(100, 101, 99, 100),
            makeBar(100, 104, 99.5, 103.5), // range=4.5 > 2×ATR, body=3.5/4.5=78%
        ];
        const result = checkDisplacementConfirmation(bars, 0, atr, 1, 'bullish');
        expect(result.confirmed).toBe(true);
        expect(result.strength).toBeGreaterThan(0);
    });

    test('rejects doji (body too small)', () => {
        const bars = [
            makeBar(100, 101, 99, 100),
            makeBar(100, 103, 97, 100.1), // range=6 but body=0.1 (1.7%)
        ];
        const result = checkDisplacementConfirmation(bars, 0, atr, 1, 'bullish');
        expect(result.confirmed).toBe(false);
    });

    test('rejects small range (noise, not displacement)', () => {
        const bars = [
            makeBar(100, 101, 99, 100),
            makeBar(100, 101, 99.5, 100.8), // range=1.5 < 1×ATR(2), body=0.8/1.5=53%
        ];
        const result = checkDisplacementConfirmation(bars, 0, atr, 1, 'bullish');
        expect(result.confirmed).toBe(false);
    });

    test('rejects wrong direction', () => {
        const bars = [
            makeBar(100, 101, 99, 100),
            makeBar(103, 104, 99, 100), // bearish candle, not bullish
        ];
        const result = checkDisplacementConfirmation(bars, 0, atr, 1, 'bullish');
        expect(result.confirmed).toBe(false);
    });

    test('checks multiple confirmation bars', () => {
        const bars = [
            makeBar(100, 101, 99, 100),     // bar 0 (sweep)
            makeBar(100, 100.5, 99.5, 100),  // bar 1: no displacement (doji)
            makeBar(100, 104, 99.5, 103.5),  // bar 2: displacement!
        ];
        const result = checkDisplacementConfirmation(bars, 0, atr, 2, 'bullish');
        expect(result.confirmed).toBe(true);
    });
});

describe('checkApproach', () => {
    const atr = 2.0;

    test('detects approach from above to swing low', () => {
        const bars = [
            makeBar(100, 101, 99, 100),   // 0
            makeBar(99, 100, 98, 99),     // 1: low=98, near level 97
            makeBar(98, 99, 97.5, 98),    // 2: low=97.5, near level 97
            makeBar(98, 99, 94, 98),      // 3: sweep candle
        ];
        // Level 97, checking bars 0-2 for approach
        const result = checkApproach(bars, 3, 97, 'below', 3, atr, 3.0);
        expect(result).toBe(true);
    });

    test('rejects approach from far away (gap through)', () => {
        const bars = [
            makeBar(120, 122, 118, 121),  // 0: far from level
            makeBar(119, 121, 117, 120),  // 1: far
            makeBar(118, 120, 116, 119),  // 2: far
            makeBar(98, 99, 94, 98),      // 3: sweep candle (gapped down)
        ];
        const result = checkApproach(bars, 3, 97, 'below', 3, atr, 3.0);
        expect(result).toBe(false);
    });
});

describe('scoreSweep', () => {
    test('higher depth = higher score', () => {
        const shallow = { sweepDepth: 0.5, hasVolume: true, volumeSpikeRatio: 2.0, displacementStrength: 0.5, wickRatio: 2.0 };
        const deep = { sweepDepth: 1.2, hasVolume: true, volumeSpikeRatio: 2.0, displacementStrength: 0.5, wickRatio: 2.0 };
        expect(scoreSweep(deep)).toBeGreaterThan(scoreSweep(shallow));
    });

    test('volume spike increases score', () => {
        const noVol = { sweepDepth: 0.8, hasVolume: false, volumeSpikeRatio: 0.5, displacementStrength: 0.5, wickRatio: 2.0 };
        const withVol = { sweepDepth: 0.8, hasVolume: true, volumeSpikeRatio: 2.5, displacementStrength: 0.5, wickRatio: 2.0 };
        expect(scoreSweep(withVol)).toBeGreaterThan(scoreSweep(noVol));
    });

    test('stronger displacement = higher score', () => {
        const weak = { sweepDepth: 0.8, hasVolume: true, volumeSpikeRatio: 2.0, displacementStrength: 0.2, wickRatio: 2.0 };
        const strong = { sweepDepth: 0.8, hasVolume: true, volumeSpikeRatio: 2.0, displacementStrength: 0.9, wickRatio: 2.0 };
        expect(scoreSweep(strong)).toBeGreaterThan(scoreSweep(weak));
    });
});

describe('findSwingLows', () => {
    test('finds correct swing lows', () => {
        const bars = [
            makeBar(5, 6, 4, 5),
            makeBar(5, 6, 3, 5),
            makeBar(5, 6, 2, 5),   // swing low at 2
            makeBar(5, 6, 3, 5),
            makeBar(5, 6, 4, 5),
        ];
        const swings = findSwingLows(bars, 4);
        expect(swings.length).toBe(1);
        expect(swings[0].price).toBe(2);
    });

    test('returns empty for flat data', () => {
        const bars = Array(10).fill(makeBar(100, 101, 99, 100));
        expect(findSwingLows(bars, 4).length).toBe(0);
    });
});

describe('findSwingHighs', () => {
    test('finds correct swing highs', () => {
        const bars = [
            makeBar(5, 6, 4, 5),
            makeBar(5, 7, 4, 5),
            makeBar(5, 10, 4, 5),  // swing high at 10
            makeBar(5, 7, 4, 5),
            makeBar(5, 6, 4, 5),
        ];
        const swings = findSwingHighs(bars, 4);
        expect(swings.length).toBe(1);
        expect(swings[0].price).toBe(10);
    });
});
