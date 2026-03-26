const { DataLoader } = require('../data-loader');

describe('DataLoader', () => {
  test('constructs with API credentials from env', () => {
    const loader = new DataLoader();
    expect(loader).toBeDefined();
  });

  test('getCacheKey returns deterministic key', () => {
    const loader = new DataLoader();
    const key = loader.getCacheKey('crypto', 'BTC_USD', '5m', 60);
    expect(key).toContain('crypto');
    expect(key).toContain('BTC_USD');
    expect(key).toContain('5m');
  });

  test('loadFromCache returns null when no cache', () => {
    const loader = new DataLoader({ cacheDir: '/tmp/nexus-test-cache-' + Date.now() });
    const result = loader.loadFromCache('nonexistent-key');
    expect(result).toBeNull();
  });

  test('saveToCache and loadFromCache roundtrip', () => {
    const cacheDir = '/tmp/nexus-test-cache-' + Date.now();
    const loader = new DataLoader({ cacheDir });
    const bars = [{ time: '2026-01-01', open: 100, high: 105, low: 95, close: 102, volume: 1000 }];
    loader.saveToCache('test-key', bars);
    const loaded = loader.loadFromCache('test-key');
    expect(loaded).toEqual(bars);
  });

  test('aggregateBars builds higher timeframes from lower', () => {
    const loader = new DataLoader();
    // 12 x 5min bars = 1 hour
    const bars5m = [];
    for (let i = 0; i < 12; i++) {
      const t = new Date('2026-01-01T09:00:00Z').getTime() + i * 5 * 60000;
      bars5m.push({
        time: new Date(t).toISOString(),
        open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 100
      });
    }
    const bars1h = loader.aggregateBars(bars5m, '1h');
    expect(bars1h.length).toBe(1);
    expect(bars1h[0].open).toBe(100);
    expect(bars1h[0].close).toBe(112);
    expect(bars1h[0].high).toBe(113);
    expect(bars1h[0].low).toBe(99);
    expect(bars1h[0].volume).toBe(1200);
  });
});
