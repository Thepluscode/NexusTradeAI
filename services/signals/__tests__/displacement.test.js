const { computeDisplacement } = require('../displacement');

describe('computeDisplacement', () => {
  test('detects displacement when body > 70% of range and range > 1.5x ATR', () => {
    // Big body candle: body = 9 (90% of range 10), range = 10 > 1.5 * 5 = 7.5
    const klines = [{ open: 100, high: 110, low: 100, close: 109, volume: 1000 }];
    const result = computeDisplacement(klines, 5);
    expect(result.score).toBe(1.0);
    expect(result.raw.detected).toBe(true);
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
