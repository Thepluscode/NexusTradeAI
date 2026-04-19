const { computeDisplacement } = require('../displacement');

describe('computeDisplacement', () => {
  test('detects displacement when body > 70% of range and range > 1.5x ATR', () => {
    // Big body candle: body = 9 (90% of range 10), range = 10 > 1.5 * 5 = 7.5
    // v24.8: magnitude = 2.0, strength = (2.0-1.5)/2.5 = 0.2
    // score = neutralDefault + strength * (1.0 - neutralDefault) = 0.3 + 0.2 * 0.7 = 0.44
    const klines = [{ open: 100, high: 110, low: 100, close: 109, volume: 1000 }];
    const result = computeDisplacement(klines, 5);
    expect(result.score).toBeGreaterThan(0.3); // above neutral (detection always scores above neutral)
    expect(result.score).toBeLessThanOrEqual(1.0);
    expect(result.raw.detected).toBe(true);
    expect(result.raw.strength).toBeGreaterThan(0);
  });

  test('barely-qualifying displacement scores at least neutralDefault', () => {
    // range = 7.6, ATR = 5 → 7.6 > 7.5 (just passes), magnitude = 1.52 → strength ≈ 0.008
    // score = 0.3 + 0.008 * 0.7 ≈ 0.306 (above neutral)
    const klines = [{ open: 100, high: 107.6, low: 100, close: 107, volume: 1000 }];
    const result = computeDisplacement(klines, 5);
    expect(result.raw.detected).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.3); // never worse than no displacement
  });

  test('stronger displacement gets higher score', () => {
    // Huge candle: range = 20, ATR = 5 → magnitude = 4.0 → strength = (4.0-1.5)/2.5 = 1.0
    const hugeKlines = [{ open: 100, high: 120, low: 100, close: 119, volume: 1000 }];
    const hugeResult = computeDisplacement(hugeKlines, 5);
    // Normal candle: range = 10, ATR = 5 → magnitude = 2.0 → strength = 0.2
    const normalKlines = [{ open: 100, high: 110, low: 100, close: 109, volume: 1000 }];
    const normalResult = computeDisplacement(normalKlines, 5);
    expect(hugeResult.score).toBeGreaterThan(normalResult.score);
    expect(hugeResult.raw.strength).toBeGreaterThan(normalResult.raw.strength);
  });

  test('no displacement when body < 70% of range', () => {
    // Small body: body = 2 (20% of range 10)
    const klines = [{ open: 104, high: 110, low: 100, close: 106, volume: 1000 }];
    const result = computeDisplacement(klines, 5);
    expect(result.score).toBeLessThan(1.0);
    expect(result.raw.detected).toBe(false);
  });

  test('no displacement when range < 1.5x ATR', () => {
    // Range = 2, ATR = 5 → 2 < 7.5
    const klines = [{ open: 100, high: 102, low: 100, close: 101.8, volume: 1000 }];
    const result = computeDisplacement(klines, 5);
    expect(result.raw.detected).toBe(false);
  });

  test('checks last N candles (lookback)', () => {
    const klines = [
      { open: 100, high: 101, low: 100, close: 100.5, volume: 100 }, // no
      { open: 100, high: 110, low: 100, close: 109, volume: 1000 },  // yes
    ];
    const result = computeDisplacement(klines, 5, 3);
    expect(result.raw.detected).toBe(true);
  });

  test('configurable neutral default', () => {
    const klines = [{ open: 100, high: 101, low: 100, close: 100.5, volume: 100 }];
    const result = computeDisplacement(klines, 5, 3, { neutralDefault: 0.3 });
    expect(result.score).toBe(0.3);
  });

  test('binary mode (forex) returns 0 when not detected', () => {
    const klines = [{ open: 100, high: 101, low: 100, close: 100.5, volume: 100 }];
    const result = computeDisplacement(klines, 5, 3, { neutralDefault: 0.0 });
    expect(result.score).toBe(0.0);
  });
});
