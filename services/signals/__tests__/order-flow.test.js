const { computeOrderFlow } = require('../order-flow');

describe('computeOrderFlow', () => {
  const makeKlines = (patterns) => patterns.map(([o, h, l, c, v]) => ({
    open: o, high: h, low: l, close: c, volume: v
  }));

  test('strong buying pressure scores high', () => {
    // All up candles (close >= open)
    const klines = makeKlines([
      [100, 105, 99, 104, 1000],
      [104, 108, 103, 107, 1200],
      [107, 110, 106, 109, 800]
    ]);
    const result = computeOrderFlow(klines);
    expect(result.score).toBeGreaterThan(0.7);
  });

  test('strong selling pressure scores low', () => {
    // All down candles (close < open)
    const klines = makeKlines([
      [104, 105, 99, 100, 1000],
      [107, 108, 103, 104, 1200],
      [109, 110, 106, 107, 800]
    ]);
    const result = computeOrderFlow(klines);
    expect(result.score).toBeLessThan(0.3);
  });

  test('balanced flow scores around 0.5', () => {
    const klines = makeKlines([
      [100, 105, 99, 104, 1000],  // up
      [104, 105, 100, 101, 1000], // down
    ]);
    const result = computeOrderFlow(klines);
    expect(result.score).toBeCloseTo(0.5, 1);
  });

  test('returns raw buy/sell volumes', () => {
    const klines = makeKlines([[100, 105, 99, 104, 1000]]);
    const result = computeOrderFlow(klines);
    expect(result.raw).toHaveProperty('buyVolume');
    expect(result.raw).toHaveProperty('sellVolume');
    expect(result.raw).toHaveProperty('imbalance');
  });

  test('empty klines returns neutral 0.5', () => {
    const result = computeOrderFlow([]);
    expect(result.score).toBe(0.5);
  });
});
