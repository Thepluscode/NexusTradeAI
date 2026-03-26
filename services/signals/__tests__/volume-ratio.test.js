const { computeVolumeRatio } = require('../volume-ratio');

describe('computeVolumeRatio', () => {
  const makeKlines = (volumes) => volumes.map(v => ({
    open: 100, high: 105, low: 95, close: 102, volume: v
  }));

  test('3x average volume scores 1.0 (capped)', () => {
    const klines = makeKlines([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 300]);
    const result = computeVolumeRatio(klines);
    expect(result.score).toBe(1.0);
  });

  test('1.5x average volume scores 0.5', () => {
    const klines = makeKlines([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 150]);
    const result = computeVolumeRatio(klines);
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  test('returns raw ratio', () => {
    const klines = makeKlines([100, 100, 200]);
    const result = computeVolumeRatio(klines);
    expect(result.raw.ratio).toBeGreaterThan(1);
  });
});
