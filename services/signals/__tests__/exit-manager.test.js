const {
  evaluateExit,
  computeRatchetStop,
  detectMomentumFade,
  detectReversalCandle,
} = require('../exit-manager');

// Helper: generate bars with controllable trend
function makeBars(count, { base = 100, trend = 0, atrSize = 1, volumeBase = 1000, volumeTrend = 0, bodyRatio = 0.5 } = {}) {
  const bars = [];
  for (let i = 0; i < count; i++) {
    const mid = base + trend * i;
    const range = atrSize;
    const body = range * bodyRatio;
    const isUp = trend >= 0;
    const open = isUp ? mid - body / 2 : mid + body / 2;
    const close = isUp ? mid + body / 2 : mid - body / 2;
    bars.push({
      open,
      high: mid + range / 2,
      low: mid - range / 2,
      close,
      volume: volumeBase + volumeTrend * i,
    });
  }
  return bars;
}

describe('computeRatchetStop', () => {
  test('does not ratchet below 1R profit', () => {
    // Entry 100, ATR 2, current 101 → 0.5R, below threshold
    const stop = computeRatchetStop(100, 98, 101, 2, 'long');
    expect(stop).toBe(98); // unchanged
  });

  test('ratchets to breakeven area at 1R', () => {
    // Entry 100, ATR 2, current 102 → 1R
    const stop = computeRatchetStop(100, 98, 102, 2, 'long');
    expect(stop).toBeGreaterThan(99.5); // near breakeven
    expect(stop).toBeLessThanOrEqual(101); // not too aggressive
  });

  test('ratchets higher at 2R', () => {
    // Entry 100, ATR 2, current 104 → 2R
    const stop2R = computeRatchetStop(100, 98, 104, 2, 'long');
    const stop1R = computeRatchetStop(100, 98, 102, 2, 'long');
    expect(stop2R).toBeGreaterThan(stop1R);
  });

  test('never lowers the stop', () => {
    // Existing stop is already high
    const stop = computeRatchetStop(100, 103, 104, 2, 'long');
    expect(stop).toBe(103);
  });

  test('works for short direction', () => {
    // Entry 100, ATR 2, current 98 → 1R short profit
    const stop = computeRatchetStop(100, 102, 98, 2, 'short');
    expect(stop).toBeLessThan(101); // tightened down
    expect(stop).toBeGreaterThan(98); // above current price
  });
});

describe('detectMomentumFade', () => {
  test('no fade in strong uptrend', () => {
    const bars = makeBars(25, { trend: 0.5, volumeBase: 1000 });
    const result = detectMomentumFade(bars, 'long', 10);
    expect(result.fading).toBe(false);
    expect(result.strength).toBeGreaterThan(0.5);
  });

  test('detects fade when volume drops and candles shrink', () => {
    // 15 bars with strong volume, then 10 with weak volume and small bodies
    const strong = makeBars(15, { base: 100, trend: 0.5, volumeBase: 2000, bodyRatio: 0.7 });
    const weak = makeBars(10, { base: 107, trend: 0.05, volumeBase: 600, bodyRatio: 0.15 });
    const bars = [...strong, ...weak];
    const result = detectMomentumFade(bars, 'long', 10);
    expect(result.fading).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });

  test('detects consecutive candles against position', () => {
    // Uptrend then 4 down candles
    const up = makeBars(20, { base: 100, trend: 0.5 });
    for (let i = 0; i < 4; i++) {
      up.push({ open: 110 - i, high: 110.5 - i, low: 109 - i, close: 109.2 - i, volume: 1000 });
    }
    const result = detectMomentumFade(up, 'long', 10);
    expect(result.fadeSignals).toBeGreaterThanOrEqual(1);
  });

  test('returns neutral with insufficient data', () => {
    const result = detectMomentumFade(makeBars(5), 'long', 10);
    expect(result.fading).toBe(false);
    expect(result.strength).toBe(1.0);
  });
});

describe('detectReversalCandle', () => {
  test('detects strong bearish reversal on long position', () => {
    const atr = 2;
    const bars = [
      { open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { open: 101, high: 101.2, low: 100.5, close: 100.8, volume: 1000 },
      // Big bearish candle: range 4 (2x ATR), body 3.5 (87% of range)
      { open: 103, high: 103.5, low: 99.5, close: 99.8, volume: 2000 },
    ];
    const result = detectReversalCandle(bars, atr, 'long');
    expect(result.reversal).toBe(true);
    expect(result.severity).toBe('major');
  });

  test('no reversal when candle is in position direction', () => {
    const atr = 2;
    const bars = [
      { open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
      { open: 100.5, high: 101, low: 100, close: 100.8, volume: 1000 },
      // Big bullish candle — same direction as long
      { open: 99, high: 103.5, low: 98.5, close: 103, volume: 2000 },
    ];
    const result = detectReversalCandle(bars, atr, 'long');
    expect(result.reversal).toBe(false);
  });

  test('detects engulfing pattern', () => {
    const atr = 1.5;
    const bars = [
      { open: 100, high: 101, low: 99, close: 100, volume: 1000 },
      // Small bullish candle
      { open: 100, high: 100.5, low: 99.8, close: 100.3, volume: 800 },
      // Bearish engulfing: body bigger than prev, range > ATR
      { open: 101, high: 101.2, low: 99, close: 99.2, volume: 1500 },
    ];
    const result = detectReversalCandle(bars, atr, 'long');
    expect(result.reversal).toBe(true);
    expect(result.type).toBe('engulfing');
  });

  test('detects upper rejection (pin bar)', () => {
    const atr = 1;
    const bars = [
      { open: 100, high: 101, low: 99.5, close: 100.5, volume: 1000 },
      { open: 100.5, high: 101, low: 100, close: 100.5, volume: 1000 },
      // Pin bar: long upper wick, tiny body, range > ATR (range=2.2, body=0.15, upper wick=1.35)
      { open: 100.5, high: 102.5, low: 100.3, close: 100.65, volume: 1000 },
    ];
    const result = detectReversalCandle(bars, atr, 'long');
    expect(result.reversal).toBe(true);
    expect(result.type).toBe('upper_rejection');
    expect(result.severity).toBe('minor');
  });
});

describe('evaluateExit', () => {
  const trendingBars = makeBars(30, { base: 95, trend: 0.5, atrSize: 1.5, volumeBase: 1000 });

  test('holds when trade is profitable and momentum strong', () => {
    const result = evaluateExit({
      entryPrice: 100,
      currentPrice: 103,
      currentStop: 97,
      direction: 'long',
      klines: trendingBars,
    });
    // Should hold, tighten, or partial_exit (partial exit at 1R+ is expected)
    expect(['hold', 'tighten', 'partial_exit']).toContain(result.action);
    expect(result.action).not.toBe('exit');
  });

  test('exits when momentum fades and trade is profitable', () => {
    // Build bars that show clear momentum fade
    const strong = makeBars(20, { base: 95, trend: 0.5, volumeBase: 2000, bodyRatio: 0.7 });
    const fading = makeBars(15, { base: 105, trend: 0.01, volumeBase: 500, bodyRatio: 0.12 });
    // Add consecutive down candles
    for (let i = 0; i < 3; i++) {
      fading.push({ open: 105.2 - i * 0.1, high: 105.3 - i * 0.1, low: 104.8 - i * 0.1, close: 104.9 - i * 0.1, volume: 400 });
    }
    const bars = [...strong, ...fading];

    const result = evaluateExit({
      entryPrice: 100,
      currentPrice: 104.5,
      currentStop: 97,
      direction: 'long',
      klines: bars,
    });
    expect(result.action).toBe('exit');
    expect(result.reason).toContain('Momentum fade');
  });

  test('exits on major reversal candle while profitable', () => {
    const bars = makeBars(28, { base: 95, trend: 0.3, atrSize: 1.0 });
    // Add a huge bearish candle at the end
    bars.push({
      open: 106, high: 106.5, low: 102, close: 102.5, volume: 3000,
    });

    const result = evaluateExit({
      entryPrice: 100,
      currentPrice: 102.5,
      currentStop: 97,
      direction: 'long',
      klines: bars,
    });
    expect(result.action).toBe('exit');
    expect(result.reason).toContain('reversal');
  });

  test('tightens stop on minor reversal', () => {
    const bars = makeBars(28, { base: 95, trend: 0.3, atrSize: 1.0 });
    // Pin bar with long upper wick
    bars.push({
      open: 104, high: 106, low: 103.8, close: 104.1, volume: 1500,
    });

    const result = evaluateExit({
      entryPrice: 100,
      currentPrice: 104.1,
      currentStop: 97,
      direction: 'long',
      klines: bars,
    });
    // Should tighten, not exit
    expect(result.action).toBe('tighten');
    expect(result.newStop).toBeGreaterThan(97);
  });

  test('does not exit losing trade on momentum fade', () => {
    const fading = makeBars(30, { base: 100, trend: -0.1, volumeBase: 500, bodyRatio: 0.2 });
    const result = evaluateExit({
      entryPrice: 100,
      currentPrice: 98,
      currentStop: 95,
      direction: 'long',
      klines: fading,
    });
    // Should NOT exit — trade is losing, fade exit only for profitable trades
    expect(result.action).not.toBe('exit');
  });
});
