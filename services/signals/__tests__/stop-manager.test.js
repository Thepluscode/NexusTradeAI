const { computeStops } = require('../stop-manager');

describe('computeStops', () => {
  const klines = [];
  for (let i = 0; i < 20; i++) {
    klines.push({ open: 100, high: 102, low: 98, close: 101, volume: 1000 });
  }

  test('long stop is below entry', () => {
    const result = computeStops(klines, 'trending', 'long', 100);
    expect(result.stopLoss).toBeLessThan(100);
    expect(result.profitTarget).toBeGreaterThan(100);
  });

  test('short stop is above entry', () => {
    const result = computeStops(klines, 'trending', 'short', 100);
    expect(result.stopLoss).toBeGreaterThan(100);
    expect(result.profitTarget).toBeLessThan(100);
  });

  test('volatile regime has wider stops than ranging', () => {
    const volatileStops = computeStops(klines, 'volatile', 'long', 100);
    const rangingStops = computeStops(klines, 'ranging', 'long', 100);
    const volatileWidth = 100 - volatileStops.stopLoss;
    const rangingWidth = 100 - rangingStops.stopLoss;
    expect(volatileWidth).toBeGreaterThan(rangingWidth);
  });

  test('returns ATR value', () => {
    const result = computeStops(klines, 'trending', 'long', 100);
    expect(result.atr).toBeGreaterThan(0);
  });
});
