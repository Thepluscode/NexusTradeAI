const { detectRegime, computeATR, REGIME_MAP, REGIME_REVERSE } = require('../regime-detector');

describe('computeATR', () => {
  test('calculates ATR from bars', () => {
    const klines = [];
    for (let i = 0; i < 20; i++) {
      klines.push({ open: 100, high: 103, low: 97, close: 101, volume: 1000 });
    }
    const atr = computeATR(klines, 14);
    expect(atr).toBeCloseTo(6, 0); // range = 6
  });
});

describe('detectRegime', () => {
  test('low volatility → ranging', () => {
    const klines = [];
    for (let i = 0; i < 20; i++) {
      klines.push({ open: 100, high: 100.2, low: 99.8, close: 100.1, volume: 1000 });
    }
    const result = detectRegime(klines, { lowThreshold: 0.5, highThreshold: 1.5 });
    expect(result.regime).toBe('ranging');
  });

  test('high volatility → volatile', () => {
    const klines = [];
    for (let i = 0; i < 20; i++) {
      klines.push({ open: 100, high: 105, low: 95, close: 102, volume: 1000 });
    }
    const result = detectRegime(klines, { lowThreshold: 0.5, highThreshold: 1.5 });
    expect(result.regime).toBe('volatile');
  });

  test('returns ATR value and regime adjustments', () => {
    const klines = [];
    for (let i = 0; i < 20; i++) {
      klines.push({ open: 100, high: 101, low: 99, close: 100, volume: 1000 });
    }
    const result = detectRegime(klines);
    expect(result).toHaveProperty('regime');
    expect(result).toHaveProperty('atr');
    expect(result).toHaveProperty('atrPercent');
  });
});

describe('REGIME_MAP', () => {
  test('maps old labels to new', () => {
    expect(REGIME_MAP.low).toBe('ranging');
    expect(REGIME_MAP.medium).toBe('trending');
    expect(REGIME_MAP.high).toBe('volatile');
  });

  test('reverse maps new labels to old', () => {
    expect(REGIME_REVERSE.ranging).toBe('low');
    expect(REGIME_REVERSE.trending).toBe('medium');
    expect(REGIME_REVERSE.volatile).toBe('high');
  });
});
