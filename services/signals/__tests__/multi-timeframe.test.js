const { computeMTFScore } = require('../multi-timeframe');

const makeTrending = (dir, n) => {
  const klines = [];
  for (let i = 0; i < n; i++) {
    const base = dir === 'up' ? 100 + i : 200 - i;
    klines.push({ open: base, high: base + 1, low: base - 1, close: base + (dir === 'up' ? 0.5 : -0.5), volume: 1000 });
  }
  return klines;
};

describe('computeMTFScore', () => {
  test('all timeframes bullish + long direction = 1.0', () => {
    const result = computeMTFScore(null, makeTrending('up', 25), makeTrending('up', 25), makeTrending('up', 25), 'long');
    expect(result.score).toBe(1.0);
    expect(result.alignment).toBe(1.0);
  });

  test('all timeframes bearish + long direction = 0.0', () => {
    const result = computeMTFScore(null, makeTrending('down', 25), makeTrending('down', 25), makeTrending('down', 25), 'long');
    expect(result.score).toBe(0.0);
  });

  test('all timeframes bearish + short direction = 1.0', () => {
    const result = computeMTFScore(null, makeTrending('down', 25), makeTrending('down', 25), makeTrending('down', 25), 'short');
    expect(result.score).toBe(1.0);
  });

  test('mixed alignment scores partial', () => {
    const result = computeMTFScore(null, makeTrending('up', 25), makeTrending('down', 25), makeTrending('up', 25), 'long');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(1);
  });

  test('insufficient data returns 0.5', () => {
    const result = computeMTFScore(null, [], [], [], 'long');
    expect(result.score).toBe(0.5);
  });
});
