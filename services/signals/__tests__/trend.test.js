const { computeTrend } = require('../trend');

describe('computeTrend', () => {
  test('bullish trend scores 1.0 for long direction', () => {
    // Prices rising above SMA
    const klines = [];
    for (let i = 0; i < 25; i++) {
      klines.push({ open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 });
    }
    const result = computeTrend(klines, 'long');
    expect(result.score).toBeGreaterThan(0.7);
    expect(result.raw.direction).toBe('bullish');
  });

  test('bearish trend scores 1.0 for short direction', () => {
    const klines = [];
    for (let i = 0; i < 25; i++) {
      klines.push({ open: 200 - i, high: 202 - i, low: 199 - i, close: 199 - i, volume: 1000 });
    }
    const result = computeTrend(klines, 'short');
    expect(result.score).toBeGreaterThan(0.7);
  });

  test('bullish trend scores 0 for short direction', () => {
    const klines = [];
    for (let i = 0; i < 25; i++) {
      klines.push({ open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 1000 });
    }
    const result = computeTrend(klines, 'short');
    expect(result.score).toBe(0.0);
  });

  test('insufficient data returns neutral', () => {
    const result = computeTrend([], 'long');
    expect(result.score).toBe(0.5);
  });
});
