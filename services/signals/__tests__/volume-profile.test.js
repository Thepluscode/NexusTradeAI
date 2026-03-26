const { computeVolumeProfile } = require('../volume-profile');

describe('computeVolumeProfile', () => {
  const makeKlines = (data) => data.map(([o, h, l, c, v]) => ({
    open: o, high: h, low: l, close: c, volume: v
  }));

  const klines = makeKlines([
    [100, 105, 98, 103, 500],
    [103, 107, 101, 106, 600],
    [106, 110, 104, 108, 400],
    [108, 112, 106, 111, 700],
    [111, 115, 109, 113, 300],
  ]);

  test('returns VAH, VAL, POC', () => {
    const result = computeVolumeProfile(klines);
    expect(result.raw).toHaveProperty('vah');
    expect(result.raw).toHaveProperty('val');
    expect(result.raw).toHaveProperty('poc');
    expect(result.raw.vah).toBeGreaterThan(result.raw.poc);
    expect(result.raw.poc).toBeGreaterThan(result.raw.val);
  });

  test('price at VAL scores high (buying at discount)', () => {
    const result = computeVolumeProfile(klines);
    const { val } = result.raw;
    const scoreAtVal = computeVolumeProfile(klines, { currentPrice: val }).score;
    expect(scoreAtVal).toBeGreaterThan(0.7);
  });

  test('price at VAH scores low (buying at premium)', () => {
    const result = computeVolumeProfile(klines);
    const { vah } = result.raw;
    const scoreAtVah = computeVolumeProfile(klines, { currentPrice: vah }).score;
    expect(scoreAtVah).toBeLessThan(0.3);
  });

  test('direction-aware: short at VAH scores high', () => {
    const result = computeVolumeProfile(klines);
    const { vah } = result.raw;
    const score = computeVolumeProfile(klines, { currentPrice: vah, direction: 'short' }).score;
    expect(score).toBeGreaterThan(0.7);
  });

  test('insufficient data returns neutral 0.5', () => {
    const result = computeVolumeProfile([]);
    expect(result.score).toBe(0.5);
  });
});
