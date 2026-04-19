const { detectRegime, computeATR, computeADX, computeEMASlope, REGIMES, REGIME_ADJUSTMENTS, LEGACY_MAP } = require('../regime-detector');

function makeBar(open, high, low, close, volume = 1000) {
    return { open, high, low, close, volume };
}

// Generate bars with a clear uptrend
function makeUptrendBars(count = 80, startPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = startPrice + i * 0.5; // steady climb
        const noise = Math.sin(i * 0.3) * 0.3; // small oscillation
        bars.push(makeBar(
            price + noise,
            price + 1.0 + Math.abs(noise),
            price - 0.3,
            price + 0.4 + noise
        ));
    }
    return bars;
}

// Generate bars with a clear downtrend
function makeDowntrendBars(count = 80, startPrice = 150) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = startPrice - i * 0.5;
        const noise = Math.sin(i * 0.3) * 0.3;
        bars.push(makeBar(
            price + noise,
            price + 0.3,
            price - 1.0 - Math.abs(noise),
            price - 0.4 + noise
        ));
    }
    return bars;
}

// Generate flat/ranging bars (oscillating around a price)
function makeRangingBars(count = 80, centerPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const osc = Math.sin(i * 0.5) * 0.3; // small oscillation
        bars.push(makeBar(
            centerPrice + osc,
            centerPrice + 0.15 + Math.abs(osc),
            centerPrice - 0.15 - Math.abs(osc),
            centerPrice + osc * 0.5
        ));
    }
    return bars;
}

// Generate highly volatile bars
function makeVolatileBars(count = 80, centerPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const swing = (i % 2 === 0 ? 1 : -1) * 5; // big swings each bar
        bars.push(makeBar(
            centerPrice + swing,
            centerPrice + 6,
            centerPrice - 6,
            centerPrice - swing
        ));
    }
    return bars;
}

describe('computeATR', () => {
    test('calculates ATR from bars', () => {
        const klines = [];
        for (let i = 0; i < 20; i++) {
            klines.push(makeBar(100, 103, 97, 101));
        }
        const atr = computeATR(klines, 14);
        expect(atr).toBeCloseTo(6, 0);
    });

    test('returns 0 for insufficient data', () => {
        expect(computeATR([], 14)).toBe(0);
        expect(computeATR([makeBar(100, 101, 99, 100)], 14)).toBe(0);
    });
});

describe('computeADX', () => {
    test('returns ADX, plusDI, minusDI', () => {
        const bars = makeUptrendBars(60);
        const result = computeADX(bars, 14);
        expect(result).toHaveProperty('adx');
        expect(result).toHaveProperty('plusDI');
        expect(result).toHaveProperty('minusDI');
        expect(typeof result.adx).toBe('number');
    });

    test('ADX is higher for trending data than ranging', () => {
        const trending = computeADX(makeUptrendBars(80), 14);
        const ranging = computeADX(makeRangingBars(80), 14);
        expect(trending.adx).toBeGreaterThan(ranging.adx);
    });

    test('returns default for insufficient data', () => {
        const result = computeADX([makeBar(100, 101, 99, 100)], 14);
        expect(result.adx).toBe(15); // default
    });
});

describe('computeEMASlope', () => {
    test('positive slope in uptrend', () => {
        const bars = makeUptrendBars(80);
        const slope = computeEMASlope(bars, 20, 5);
        expect(slope).toBeGreaterThan(0);
    });

    test('negative slope in downtrend', () => {
        const bars = makeDowntrendBars(80);
        const slope = computeEMASlope(bars, 20, 5);
        expect(slope).toBeLessThan(0);
    });

    test('near-zero slope in range', () => {
        const bars = makeRangingBars(80);
        const slope = computeEMASlope(bars, 20, 5);
        expect(Math.abs(slope)).toBeLessThan(0.01);
    });

    test('returns 0 for insufficient data', () => {
        expect(computeEMASlope([], 20, 5)).toBe(0);
    });
});

describe('detectRegime', () => {
    test('detects TRENDING_UP in strong uptrend', () => {
        const bars = makeUptrendBars(80);
        const result = detectRegime(bars);
        expect(result.regime).toBe(REGIMES.TRENDING_UP);
        expect(result.confidence).toBeGreaterThan(0);
        expect(result.emaSlope).toBeGreaterThan(0);
    });

    test('detects TRENDING_DOWN in strong downtrend', () => {
        const bars = makeDowntrendBars(80);
        const result = detectRegime(bars);
        expect(result.regime).toBe(REGIMES.TRENDING_DOWN);
        expect(result.emaSlope).toBeLessThan(0);
    });

    test('detects MEAN_REVERTING in flat range', () => {
        const bars = makeRangingBars(80);
        const result = detectRegime(bars);
        expect(result.regime).toBe(REGIMES.MEAN_REVERTING);
    });

    test('detects HIGH_VOLATILITY in crisis bars', () => {
        const bars = makeVolatileBars(80);
        const result = detectRegime(bars);
        expect(result.regime).toBe(REGIMES.HIGH_VOLATILITY);
    });

    test('output includes all required fields', () => {
        const bars = makeUptrendBars(80);
        const result = detectRegime(bars);
        expect(result).toHaveProperty('regime');
        expect(result).toHaveProperty('confidence');
        expect(result).toHaveProperty('adjustments');
        expect(result).toHaveProperty('atr');
        expect(result).toHaveProperty('atrPercent');
        expect(result).toHaveProperty('adx');
        expect(result).toHaveProperty('emaSlope');
        expect(result).toHaveProperty('transition');
        expect(result).toHaveProperty('raw');
        expect(result.raw).toHaveProperty('volatility');
        expect(result.raw).toHaveProperty('trendStrength');
        expect(result.raw).toHaveProperty('trendDirection');
    });

    test('adjustments include strategy routing', () => {
        const bars = makeUptrendBars(80);
        const result = detectRegime(bars);
        expect(result.adjustments).toHaveProperty('positionSizeMultiplier');
        expect(result.adjustments).toHaveProperty('scoreThresholdMultiplier');
        expect(result.adjustments).toHaveProperty('maxPositions');
        expect(result.adjustments).toHaveProperty('allowedDirections');
        expect(result.adjustments).toHaveProperty('strategies');
    });

    test('TRENDING_UP only allows long entries', () => {
        expect(REGIME_ADJUSTMENTS.TRENDING_UP.allowedDirections).toEqual(['long']);
    });

    test('TRENDING_DOWN only allows short entries', () => {
        expect(REGIME_ADJUSTMENTS.TRENDING_DOWN.allowedDirections).toEqual(['short']);
    });

    test('HIGH_VOLATILITY reduces position size to 0.3', () => {
        expect(REGIME_ADJUSTMENTS.HIGH_VOLATILITY.positionSizeMultiplier).toBe(0.3);
    });

    test('confidence is bounded 0 to 1', () => {
        for (const bars of [makeUptrendBars(), makeDowntrendBars(), makeRangingBars(), makeVolatileBars()]) {
            const result = detectRegime(bars);
            expect(result.confidence).toBeGreaterThanOrEqual(0);
            expect(result.confidence).toBeLessThanOrEqual(1);
        }
    });

    test('transition probability is bounded 0 to 1', () => {
        const result = detectRegime(makeUptrendBars());
        expect(result.transition).toBeGreaterThanOrEqual(0);
        expect(result.transition).toBeLessThanOrEqual(1);
    });

    test('handles insufficient data gracefully', () => {
        const result = detectRegime([makeBar(100, 101, 99, 100)]);
        expect(result.regime).toBe(REGIMES.MEAN_REVERTING);
        expect(result.confidence).toBe(0.3);
    });

    test('handles null/empty input', () => {
        expect(detectRegime(null).regime).toBe(REGIMES.MEAN_REVERTING);
        expect(detectRegime([]).regime).toBe(REGIMES.MEAN_REVERTING);
    });

    test('accepts custom thresholds', () => {
        const bars = makeRangingBars(80);
        // With very high highVolThreshold, even volatile bars won't be classified as high vol
        const result = detectRegime(bars, { highVolThreshold: 100 });
        expect(result.regime).not.toBe(REGIMES.HIGH_VOLATILITY);
    });
});

describe('LEGACY_MAP', () => {
    test('maps old 3-state labels to new 4-state', () => {
        expect(LEGACY_MAP.low).toBe(REGIMES.MEAN_REVERTING);
        expect(LEGACY_MAP.medium).toBe(REGIMES.TRENDING_UP);
        expect(LEGACY_MAP.high).toBe(REGIMES.HIGH_VOLATILITY);
        expect(LEGACY_MAP.ranging).toBe(REGIMES.MEAN_REVERTING);
        expect(LEGACY_MAP.trending).toBe(REGIMES.TRENDING_UP);
        expect(LEGACY_MAP.volatile).toBe(REGIMES.HIGH_VOLATILITY);
    });
});

describe('REGIMES enum', () => {
    test('has exactly 4 states', () => {
        expect(Object.keys(REGIMES).length).toBe(4);
    });

    test('every regime has adjustments', () => {
        for (const regime of Object.values(REGIMES)) {
            expect(REGIME_ADJUSTMENTS[regime]).toBeDefined();
            expect(REGIME_ADJUSTMENTS[regime].positionSizeMultiplier).toBeGreaterThan(0);
        }
    });
});
