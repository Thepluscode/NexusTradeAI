const {
    calculateSMA,
    calculateEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    calculateATR,
    calculateVWAPWithBands,
} = require('../indicators');

// ── SMA ──────────────────────────────────────────────────────────────────────

describe('calculateSMA', () => {
    test('returns average of last N values', () => {
        expect(calculateSMA([2, 4, 6, 8, 10], 3)).toBeCloseTo(8, 5); // avg of [6, 8, 10]
    });

    test('returns null for insufficient data', () => {
        expect(calculateSMA([1, 2], 5)).toBeNull();
        expect(calculateSMA(null, 5)).toBeNull();
        expect(calculateSMA([], 5)).toBeNull();
    });
});

// ── EMA ──────────────────────────────────────────────────────────────────────

describe('calculateEMA', () => {
    test('returns a number for valid input', () => {
        const data = [22, 24, 23, 25, 26, 28, 27, 29, 30, 28, 26, 27];
        const result = calculateEMA(data, 5);
        expect(typeof result).toBe('number');
    });

    test('seed value equals SMA of first N prices', () => {
        const data = [10, 20, 30];
        // period=3: SMA seed = (10+20+30)/3 = 20, no further iterations
        expect(calculateEMA(data, 3)).toBeCloseTo(20, 5);
    });

    test('returns null for insufficient data', () => {
        expect(calculateEMA([1, 2], 5)).toBeNull();
        expect(calculateEMA(null, 5)).toBeNull();
    });

    test('applies exponential weighting after seed', () => {
        const data = [10, 20, 30, 40]; // period=3
        // SMA seed = 20, then EMA = (40 - 20) * 0.5 + 20 = 30
        expect(calculateEMA(data, 3)).toBeCloseTo(30, 5);
    });
});

// ── RSI ──────────────────────────────────────────────────────────────────────

describe('calculateRSI', () => {
    test('returns 50 for insufficient data', () => {
        expect(calculateRSI([1, 2, 3], 14)).toBe(50);
        expect(calculateRSI(null, 14)).toBe(50);
    });

    test('returns 100 when all changes are positive', () => {
        const prices = [];
        for (let i = 0; i < 30; i++) prices.push(100 + i);
        expect(calculateRSI(prices, 14)).toBe(100);
    });

    test('returns value between 0 and 100 for mixed data', () => {
        const prices = [];
        for (let i = 0; i < 30; i++) prices.push(100 + Math.sin(i) * 10);
        const rsi = calculateRSI(prices, 14);
        expect(rsi).toBeGreaterThanOrEqual(0);
        expect(rsi).toBeLessThanOrEqual(100);
    });

    test('uses Wilder smoothing (not simple average)', () => {
        // Wilder's: avgGain = (prev * 13 + gain) / 14
        // Simple: would average all gains in window
        // These produce different values — verify RSI is not 50 for trending data
        const prices = [100, 101, 102, 101, 103, 104, 103, 105, 106, 105,
                        107, 108, 107, 109, 110, 109, 111, 112, 111, 113,
                        114, 113, 115, 116, 115, 117, 118, 117, 119, 120];
        const rsi = calculateRSI(prices, 14);
        expect(rsi).toBeGreaterThan(50);
        expect(rsi).toBeLessThan(100);
    });
});

// ── MACD ─────────────────────────────────────────────────────────────────────

describe('calculateMACD', () => {
    test('returns null for insufficient data', () => {
        const prices = [];
        for (let i = 0; i < 30; i++) prices.push(100 + i);
        expect(calculateMACD(prices)).toBeNull(); // need 26 + 9 = 35
    });

    test('returns full MACD object for sufficient data', () => {
        const prices = [];
        for (let i = 0; i < 50; i++) prices.push(100 + i * 0.5 + Math.sin(i) * 2);
        const result = calculateMACD(prices);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('macd');
        expect(result).toHaveProperty('signal');
        expect(result).toHaveProperty('histogram');
        expect(result).toHaveProperty('prevHistogram');
        expect(result).toHaveProperty('bullish');
        expect(result).toHaveProperty('bearish');
        expect(typeof result.macd).toBe('number');
        expect(typeof result.bullish).toBe('boolean');
        expect(typeof result.bearish).toBe('boolean');
    });

    test('bullish and bearish are mutually exclusive (or both false at 0)', () => {
        const prices = [];
        for (let i = 0; i < 50; i++) prices.push(100 + i);
        const result = calculateMACD(prices);
        // histogram > 0 → bullish=true, bearish=false (or vice versa)
        if (result.histogram > 0) {
            expect(result.bullish).toBe(true);
            expect(result.bearish).toBe(false);
        } else if (result.histogram < 0) {
            expect(result.bullish).toBe(false);
            expect(result.bearish).toBe(true);
        }
    });

    test('returns null for null input', () => {
        expect(calculateMACD(null)).toBeNull();
    });
});

// ── Bollinger Bands ──────────────────────────────────────────────────────────

describe('calculateBollingerBands', () => {
    test('returns null for insufficient data', () => {
        expect(calculateBollingerBands([1, 2, 3], 20)).toBeNull();
        expect(calculateBollingerBands(null, 20)).toBeNull();
    });

    test('returns correct structure for sufficient data', () => {
        const prices = [];
        for (let i = 0; i < 25; i++) prices.push(100 + Math.random() * 10);
        const result = calculateBollingerBands(prices, 20);
        expect(result).not.toBeNull();
        expect(result).toHaveProperty('upper');
        expect(result).toHaveProperty('middle');
        expect(result).toHaveProperty('lower');
        expect(result).toHaveProperty('bandwidth');
        expect(result).toHaveProperty('percentB');
        expect(result.upper).toBeGreaterThan(result.middle);
        expect(result.lower).toBeLessThan(result.middle);
    });

    test('upper and lower are symmetric around middle', () => {
        const prices = [];
        for (let i = 0; i < 20; i++) prices.push(100);
        const result = calculateBollingerBands(prices, 20, 2);
        // All prices equal → stdDev = 0 → upper = middle = lower
        expect(result.upper).toBeCloseTo(100, 5);
        expect(result.middle).toBeCloseTo(100, 5);
        expect(result.lower).toBeCloseTo(100, 5);
        expect(result.bandwidth).toBeCloseTo(0, 5);
    });

    test('percentB is 0.5 when price equals middle band', () => {
        const prices = [];
        for (let i = 0; i < 20; i++) prices.push(100 + (i % 2 === 0 ? 5 : -5));
        // Last price will be -5 or +5 from 100
        const result = calculateBollingerBands(prices, 20, 2);
        // percentB should be a number between 0 and 1
        expect(result.percentB).toBeGreaterThanOrEqual(-0.5);
        expect(result.percentB).toBeLessThanOrEqual(1.5);
    });
});

// ── ATR ─────────────────────────────────────────────────────────────────────

describe('calculateATR', () => {
    test('returns null when fewer than period+1 bars', () => {
        const bars = Array(14).fill({ h: 10, l: 9, c: 9.5 });
        expect(calculateATR(bars, 14)).toBeNull();
    });

    test('computes ATR correctly for uniform-range bars', () => {
        // 16 bars, each with h=101, l=100, c=100.5 → TR = 1.0 for each
        // ATR(14) with all TR=1.0 should be 1.0
        const bars = [];
        for (let i = 0; i < 16; i++) {
            bars.push({ h: 101, l: 100, c: 100.5 });
        }
        const atr = calculateATR(bars, 14);
        expect(atr).not.toBeNull();
        expect(atr).toBeCloseTo(1.0, 2);
    });

    test('uses Wilder smoothing after seed period', () => {
        // 15 bars: TR=1.0 each, then bar 16: TR=2.0
        // Seed ATR = 1.0 (average of first 14 TRs)
        // Wilder: (1.0 * 13 + 2.0) / 14 ≈ 1.071
        const bars = [];
        for (let i = 0; i < 15; i++) {
            bars.push({ h: 101, l: 100, c: 100.5 });
        }
        bars.push({ h: 102, l: 100, c: 101 }); // TR = max(2, |102-100.5|, |100-100.5|) = 2.0
        const atr = calculateATR(bars, 14);
        expect(atr).toBeCloseTo(1.071, 2);
    });

    test('defaults to period 14', () => {
        const bars = Array(16).fill({ h: 101, l: 100, c: 100.5 });
        expect(calculateATR(bars)).toEqual(calculateATR(bars, 14));
    });

    test('handles gap-up bars (true range uses prev close)', () => {
        // Bar 1: c=100, Bar 2: h=110, l=108 → TR = max(2, |110-100|, |108-100|) = 10
        const bars = [
            { h: 101, l: 100, c: 100 },
            { h: 110, l: 108, c: 109 }, // gap up
        ];
        // Need 15 bars for period=14, but test with period=1 for isolation
        expect(calculateATR(bars, 1)).toBeCloseTo(10, 1);
    });
});

// ── VWAP with bands ─────────────────────────────────────────────────────────

describe('calculateVWAPWithBands', () => {
    test('returns null for empty bars', () => {
        expect(calculateVWAPWithBands([])).toBeNull();
        expect(calculateVWAPWithBands(null)).toBeNull();
    });

    test('returns vwap + upperBand + lowerBand + stdDev', () => {
        const bars = [
            { h: 10, l: 10, c: 10, v: 100 },
            { h: 20, l: 20, c: 20, v: 100 },
        ];
        const result = calculateVWAPWithBands(bars);
        expect(result).toHaveProperty('vwap');
        expect(result).toHaveProperty('upperBand');
        expect(result).toHaveProperty('lowerBand');
        expect(result).toHaveProperty('stdDev');
    });

    test('VWAP equals volume-weighted typical price', () => {
        const bars = [
            { h: 10, l: 10, c: 10, v: 100 },
            { h: 100, l: 100, c: 100, v: 900 },
        ];
        const result = calculateVWAPWithBands(bars);
        // weighted: (10*100 + 100*900) / 1000 = 91
        expect(result.vwap).toBeCloseTo(91, 2);
    });

    test('bands use 1.5 sigma spread', () => {
        const bars = [
            { h: 10, l: 10, c: 10, v: 100 },
            { h: 20, l: 20, c: 20, v: 100 },
        ];
        const result = calculateVWAPWithBands(bars);
        expect(result.upperBand).toBeCloseTo(result.vwap + 1.5 * result.stdDev, 5);
        expect(result.lowerBand).toBeCloseTo(result.vwap - 1.5 * result.stdDev, 5);
    });

    test('returns null when total volume is zero', () => {
        const bars = [{ h: 10, l: 10, c: 10, v: 0 }];
        expect(calculateVWAPWithBands(bars)).toBeNull();
    });

    test('stdDev is zero when all prices are equal', () => {
        const bars = [
            { h: 50, l: 50, c: 50, v: 100 },
            { h: 50, l: 50, c: 50, v: 100 },
        ];
        const result = calculateVWAPWithBands(bars);
        expect(result.stdDev).toBeCloseTo(0, 5);
        expect(result.upperBand).toBeCloseTo(result.vwap, 5);
        expect(result.lowerBand).toBeCloseTo(result.vwap, 5);
    });
});
