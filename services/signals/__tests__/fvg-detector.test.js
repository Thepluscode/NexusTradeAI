const { computeFVG, scoreGapValidity, findSwingPoints } = require('../fvg-detector');

function makeBar(open, high, low, close, volume = 1000) {
    return { open, high, low, close, volume };
}

describe('computeFVG', () => {
    test('detects bullish FVG (gap up)', () => {
        const klines = [
            makeBar(100, 103, 99, 102),
            makeBar(102, 108, 101, 107),  // big up candle
            makeBar(107, 110, 106, 109),  // low (106) > prev high (103) → bullish FVG
        ];
        const result = computeFVG(klines);
        expect(result.raw.bullishCount).toBeGreaterThan(0);
    });

    test('detects bearish FVG (gap down)', () => {
        const klines = [
            makeBar(110, 112, 108, 109),
            makeBar(109, 110, 102, 103),  // big down
            makeBar(103, 105, 100, 101),  // high (105) < prev low (108) → bearish FVG
        ];
        const result = computeFVG(klines);
        expect(result.raw.bearishCount).toBeGreaterThan(0);
    });

    test('no FVG when bars overlap normally', () => {
        const klines = [
            makeBar(100, 103, 99, 102),
            makeBar(102, 104, 101, 103),
            makeBar(103, 105, 102, 104),
        ];
        const result = computeFVG(klines);
        expect(result.raw.bullishCount).toBe(0);
        expect(result.raw.bearishCount).toBe(0);
    });

    test('returns neutralDefault when no gaps found', () => {
        const noGap = [
            makeBar(100, 102, 99, 101),
            makeBar(101, 103, 100, 102),
            makeBar(102, 104, 101, 103),
        ];
        expect(computeFVG(noGap, { neutralDefault: 0.3 }).score).toBe(0.3);
        expect(computeFVG(noGap, { neutralDefault: 0.0 }).score).toBe(0.0);
    });

    test('empty klines returns neutral', () => {
        expect(computeFVG([], { neutralDefault: 0.3 }).score).toBe(0.3);
    });

    test('each gap has validity scoring with 6 factors', () => {
        // Build bars with a clear bullish FVG
        const klines = [];
        // 15 bars of ranging market to establish swing levels
        for (let i = 0; i < 15; i++) {
            klines.push(makeBar(100 + i * 0.2, 101 + i * 0.2, 99 + i * 0.2, 100.5 + i * 0.2));
        }
        // 3 bars forming a bullish FVG
        klines.push(makeBar(103, 105, 102, 104));   // prev
        klines.push(makeBar(104, 112, 103, 111));   // big up candle
        klines.push(makeBar(111, 115, 108, 114));   // low (108) > prev high (105) → FVG
        // A few more bars after (no mitigation)
        klines.push(makeBar(114, 116, 113, 115));
        klines.push(makeBar(115, 117, 114, 116));

        const result = computeFVG(klines, { lookback: 30 });
        expect(result.raw.bullishCount).toBeGreaterThan(0);

        const gap = result.raw.gaps[0];
        expect(gap.validity).toBeDefined();
        expect(gap.validity).toHaveProperty('unmitigated');
        expect(gap.validity).toHaveProperty('candleReaction');
        expect(gap.validity).toHaveProperty('srConfluence');
        expect(gap.validity).toHaveProperty('priority');
        expect(gap.validity).toHaveProperty('fibPosition');
        expect(gap.validity).toHaveProperty('breakOfStructure');
        expect(gap.validity).toHaveProperty('overall');
        expect(gap.validityScore).toBeGreaterThan(0);
        expect(gap.validityScore).toBeLessThanOrEqual(1);
    });

    test('unmitigated gap scores higher than mitigated gap', () => {
        // GAP that is NOT mitigated
        const unmitBars = [];
        for (let i = 0; i < 10; i++) unmitBars.push(makeBar(100, 101, 99, 100));
        unmitBars.push(makeBar(100, 102, 99, 101));   // prev
        unmitBars.push(makeBar(101, 110, 100, 109));   // big up
        unmitBars.push(makeBar(109, 112, 105, 111));   // FVG: low(105) > prev high(102)
        unmitBars.push(makeBar(111, 113, 110, 112));   // stays above gap
        unmitBars.push(makeBar(112, 114, 111, 113));

        // GAP that IS mitigated (price comes back through it)
        const mitBars = [...unmitBars.slice(0, 13)];
        mitBars.push(makeBar(105, 106, 98, 99));  // drops below gapLow (102) → mitigated
        mitBars.push(makeBar(99, 101, 98, 100));

        const unmitResult = computeFVG(unmitBars, { lookback: 20 });
        const mitResult = computeFVG(mitBars, { lookback: 20 });

        if (unmitResult.raw.gaps.length > 0 && mitResult.raw.gaps.length > 0) {
            expect(unmitResult.raw.gaps[0].validity.unmitigated)
                .toBeGreaterThan(mitResult.raw.gaps[0].validity.unmitigated);
        }
    });

    test('valid gaps are filtered from total gaps', () => {
        const klines = [];
        for (let i = 0; i < 10; i++) klines.push(makeBar(100, 101, 99, 100));
        klines.push(makeBar(100, 102, 99, 101));
        klines.push(makeBar(101, 110, 100, 109));
        klines.push(makeBar(109, 112, 105, 111));
        klines.push(makeBar(111, 113, 110, 112));
        klines.push(makeBar(112, 114, 111, 113));

        const result = computeFVG(klines, { lookback: 20 });
        expect(result.raw).toHaveProperty('validGaps');
        expect(result.meta).toHaveProperty('validCount');
        expect(result.meta).toHaveProperty('totalCount');
    });

    test('score is bounded 0 to 1', () => {
        const klines = [];
        for (let i = 0; i < 10; i++) klines.push(makeBar(100, 101, 99, 100));
        klines.push(makeBar(100, 102, 99, 101));
        klines.push(makeBar(101, 110, 100, 109));
        klines.push(makeBar(109, 112, 105, 111));
        klines.push(makeBar(111, 115, 110, 114));

        const result = computeFVG(klines, { lookback: 20 });
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(1);
    });
});

describe('findSwingPoints', () => {
    test('finds swing highs', () => {
        const bars = [
            makeBar(100, 102, 99, 101),
            makeBar(101, 103, 100, 102),
            makeBar(102, 108, 101, 107), // swing high at 108
            makeBar(107, 106, 104, 105),
            makeBar(105, 105, 103, 104),
        ];
        const swings = findSwingPoints(bars, 4, 'high');
        expect(swings.length).toBe(1);
        expect(swings[0].price).toBe(108);
    });

    test('finds swing lows', () => {
        const bars = [
            makeBar(105, 106, 104, 105),
            makeBar(104, 105, 103, 104),
            makeBar(103, 104, 97, 98),  // swing low at 97
            makeBar(98, 100, 98, 99),
            makeBar(99, 101, 99, 100),
        ];
        const swings = findSwingPoints(bars, 4, 'low');
        expect(swings.length).toBe(1);
        expect(swings[0].price).toBe(97);
    });

    test('returns empty for flat data', () => {
        const bars = Array(10).fill(makeBar(100, 101, 99, 100));
        expect(findSwingPoints(bars, 4, 'high').length).toBe(0);
    });
});
