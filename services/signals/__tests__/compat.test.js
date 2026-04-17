const {
  calculateOrderFlowImbalance,
  isDisplacementCandle,
  calculateVolumeProfile,
  detectFairValueGaps,
} = require('../compat');

describe('compat: calculateOrderFlowImbalance', () => {
  test('returns a number between -1 and 1 (crypto format)', () => {
    const klines = [
      [0, '100', '105', '99', '104', '500'],  // up candle
      [1, '104', '110', '103', '108', '600'],  // up candle
      [2, '108', '109', '100', '101', '400'],  // down candle
    ];
    const result = calculateOrderFlowImbalance(klines, 3, 'crypto');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('returns 0 for empty input', () => {
    expect(calculateOrderFlowImbalance([], 20, 'crypto')).toBe(0);
    expect(calculateOrderFlowImbalance(null, 20, 'crypto')).toBe(0);
  });

  test('forex mode uses conviction weighting (no volume)', () => {
    const candles = [
      { mid: { o: '1.0800', h: '1.0850', l: '1.0790', c: '1.0840' } },
      { mid: { o: '1.0840', h: '1.0860', l: '1.0810', c: '1.0820' } },
    ];
    const result = calculateOrderFlowImbalance(candles, 2, 'forex');
    expect(typeof result).toBe('number');
    expect(result).toBeGreaterThanOrEqual(-1);
    expect(result).toBeLessThanOrEqual(1);
  });

  test('stock format works', () => {
    const bars = [
      { o: 100, h: 105, l: 99, c: 104, v: 500 },
      { o: 104, h: 110, l: 103, c: 108, v: 600 },
    ];
    const result = calculateOrderFlowImbalance(bars, 2, 'stock');
    expect(typeof result).toBe('number');
  });
});

describe('compat: isDisplacementCandle', () => {
  test('returns boolean (crypto format)', () => {
    const klines = [
      [0, '100', '110', '99', '109', '1000'],  // big body, big range
    ];
    const result = isDisplacementCandle(klines, 5, 1, 'crypto');
    expect(typeof result).toBe('boolean');
  });

  test('returns false for empty input', () => {
    expect(isDisplacementCandle([], 5, 1, 'crypto')).toBe(false);
    expect(isDisplacementCandle(null, 5, 1, 'crypto')).toBe(false);
  });

  test('detects displacement when body > 70% range and range > 1.5x ATR', () => {
    // body = |109 - 100| = 9, range = 110 - 99 = 11, body/range = 0.818 > 0.7
    // range = 11 > 1.5 * 5 = 7.5 ✓
    const klines = [[0, '100', '110', '99', '109', '1000']];
    expect(isDisplacementCandle(klines, 5, 1, 'crypto')).toBe(true);
  });

  test('returns false when range < 1.5x ATR', () => {
    // range = 102 - 99 = 3, ATR = 5, 3 < 7.5
    const klines = [[0, '100', '102', '99', '101', '1000']];
    expect(isDisplacementCandle(klines, 5, 1, 'crypto')).toBe(false);
  });
});

describe('compat: calculateVolumeProfile', () => {
  test('returns {vah, val, poc, lowVolumeNodes, bucketSize} for sufficient data', () => {
    const klines = [];
    for (let i = 0; i < 25; i++) {
      klines.push([i, String(100 + i), String(105 + i), String(98 + i), String(103 + i), '1000']);
    }
    const result = calculateVolumeProfile(klines, 50, 'crypto');
    expect(result).not.toBeNull();
    expect(result).toHaveProperty('vah');
    expect(result).toHaveProperty('val');
    expect(result).toHaveProperty('poc');
    expect(result).toHaveProperty('lowVolumeNodes');
    expect(result).toHaveProperty('bucketSize');
    expect(Array.isArray(result.lowVolumeNodes)).toBe(true);
    expect(typeof result.vah).toBe('number');
    expect(typeof result.bucketSize).toBe('number');
    expect(result.bucketSize).toBeGreaterThan(0);
  });

  test('returns null for insufficient data (< 20 bars)', () => {
    const klines = [];
    for (let i = 0; i < 10; i++) {
      klines.push([i, String(100 + i), String(105 + i), String(98 + i), String(103 + i), '1000']);
    }
    expect(calculateVolumeProfile(klines, 50, 'crypto')).toBeNull();
  });

  test('returns null for empty input', () => {
    expect(calculateVolumeProfile([], 50, 'crypto')).toBeNull();
    expect(calculateVolumeProfile(null, 50, 'crypto')).toBeNull();
  });

  test('lowVolumeNodes contain expected shape', () => {
    const klines = [];
    for (let i = 0; i < 30; i++) {
      klines.push([i, String(100 + i * 2), String(105 + i * 2), String(98 + i * 2), String(103 + i * 2), '1000']);
    }
    const result = calculateVolumeProfile(klines, 50, 'crypto');
    if (result && result.lowVolumeNodes.length > 0) {
      const node = result.lowVolumeNodes[0];
      expect(node).toHaveProperty('priceLow');
      expect(node).toHaveProperty('priceHigh');
      expect(node).toHaveProperty('priceMid');
      expect(node).toHaveProperty('volumeRatio');
    }
  });
});

describe('compat: detectFairValueGaps', () => {
  test('returns {bullish: [...], bearish: [...]} arrays', () => {
    // Create bars with a bullish FVG: bar[2].low > bar[0].high and bar[1] closed up
    const klines = [
      [0, '100', '102', '99', '101', '1000'],   // prev: high=102
      [1, '103', '108', '102', '107', '2000'],   // curr: closed up (107 > 103)
      [2, '109', '112', '108', '111', '1500'],   // next: low=108 > prev.high=102 → bullish FVG
      [3, '111', '115', '110', '114', '1000'],
      [4, '114', '118', '113', '117', '1000'],
    ];
    const result = detectFairValueGaps(klines, 5, 'crypto');
    expect(result).toHaveProperty('bullish');
    expect(result).toHaveProperty('bearish');
    expect(Array.isArray(result.bullish)).toBe(true);
    expect(Array.isArray(result.bearish)).toBe(true);
    expect(result.bullish.length).toBeGreaterThan(0);
    expect(result.bullish[0]).toHaveProperty('gapLow');
    expect(result.bullish[0]).toHaveProperty('gapHigh');
  });

  test('returns empty arrays for input with no gaps', () => {
    const result = detectFairValueGaps([], 5, 'crypto');
    expect(result).toEqual({ bullish: [], bearish: [], score: 0 });
  });

  test('returns empty arrays for null input', () => {
    const result = detectFairValueGaps(null, 5, 'crypto');
    expect(result).toEqual({ bullish: [], bearish: [], score: 0 });
  });

  test('stock format works', () => {
    const bars = [
      { o: 100, h: 102, l: 99, c: 101, v: 1000 },
      { o: 103, h: 108, l: 102, c: 107, v: 2000 },
      { o: 109, h: 112, l: 108, c: 111, v: 1500 },
    ];
    const result = detectFairValueGaps(bars, 3, 'stock');
    expect(Array.isArray(result.bullish)).toBe(true);
    expect(Array.isArray(result.bearish)).toBe(true);
  });
});
