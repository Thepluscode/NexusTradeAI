const { computeFVG } = require('../fvg-detector');

describe('computeFVG', () => {
  test('detects bullish FVG (gap up)', () => {
    const klines = [
      { open: 100, high: 103, low: 99, close: 102, volume: 500 },
      { open: 102, high: 108, low: 101, close: 107, volume: 800 }, // big up candle
      { open: 107, high: 110, low: 106, close: 109, volume: 600 }, // low > prev high (103)
    ];
    const result = computeFVG(klines);
    expect(result.raw.bullishCount).toBeGreaterThan(0);
  });

  test('detects bearish FVG (gap down)', () => {
    const klines = [
      { open: 110, high: 112, low: 108, close: 109, volume: 500 },
      { open: 109, high: 110, low: 102, close: 103, volume: 800 }, // big down
      { open: 103, high: 105, low: 100, close: 101, volume: 600 }, // high < prev low (108)
    ];
    const result = computeFVG(klines);
    expect(result.raw.bearishCount).toBeGreaterThan(0);
  });

  test('no FVG when bars overlap normally', () => {
    const klines = [
      { open: 100, high: 103, low: 99, close: 102, volume: 500 },
      { open: 102, high: 104, low: 101, close: 103, volume: 600 },
      { open: 103, high: 105, low: 102, close: 104, volume: 500 },
    ];
    const result = computeFVG(klines);
    expect(result.raw.bullishCount).toBe(0);
    expect(result.raw.bearishCount).toBe(0);
  });

  test('scores 1.0 when FVGs present, neutralDefault when absent', () => {
    const noGap = [
      { open: 100, high: 102, low: 99, close: 101, volume: 500 },
      { open: 101, high: 103, low: 100, close: 102, volume: 600 },
      { open: 102, high: 104, low: 101, close: 103, volume: 500 },
    ];
    expect(computeFVG(noGap, { neutralDefault: 0.3 }).score).toBe(0.3);
    expect(computeFVG(noGap, { neutralDefault: 0.0 }).score).toBe(0.0);
  });

  test('empty klines returns neutral', () => {
    expect(computeFVG([], { neutralDefault: 0.3 }).score).toBe(0.3);
  });
});
