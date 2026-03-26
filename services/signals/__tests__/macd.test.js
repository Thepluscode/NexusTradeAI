const { computeMACD } = require('../macd');

describe('computeMACD', () => {
  test('positive histogram scores high for long', () => {
    // Steadily rising prices produce positive MACD histogram
    const klines = [];
    for (let i = 0; i < 40; i++) {
      klines.push({ open: 100 + i * 0.5, high: 101 + i * 0.5, low: 99 + i * 0.5, close: 100.5 + i * 0.5, volume: 1000 });
    }
    const result = computeMACD(klines, 'long');
    expect(result.score).toBeGreaterThan(0.5);
    expect(result.raw).toHaveProperty('macdLine');
    expect(result.raw).toHaveProperty('signalLine');
    expect(result.raw).toHaveProperty('histogram');
  });

  test('insufficient data returns neutral', () => {
    const result = computeMACD([], 'long');
    expect(result.score).toBe(0.5);
  });
});
