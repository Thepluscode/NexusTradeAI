const { normalizeCryptoBars, normalizeForexBars, normalizeStockBars } = require('../normalizers');

describe('normalizeCryptoBars', () => {
  test('converts [time,o,h,l,c,v] arrays to {open,high,low,close,volume}', () => {
    const raw = [
      [1700000000, '100.5', '105.0', '99.0', '103.2', '50000'],
      [1700000060, '103.2', '107.0', '102.0', '106.5', '60000']
    ];
    const result = normalizeCryptoBars(raw);
    expect(result).toEqual([
      { open: 100.5, high: 105.0, low: 99.0, close: 103.2, volume: 50000 },
      { open: 103.2, high: 107.0, low: 102.0, close: 106.5, volume: 60000 }
    ]);
  });

  test('returns empty array for null/undefined input', () => {
    expect(normalizeCryptoBars(null)).toEqual([]);
    expect(normalizeCryptoBars(undefined)).toEqual([]);
    expect(normalizeCryptoBars([])).toEqual([]);
  });

  test('handles numeric values (not just strings)', () => {
    const raw = [[1700000000, 100, 105, 99, 103, 50000]];
    const result = normalizeCryptoBars(raw);
    expect(result[0].open).toBe(100);
  });
});

describe('normalizeForexBars', () => {
  test('converts OANDA {mid:{o,h,l,c}} to {open,high,low,close,volume}', () => {
    const raw = [
      { mid: { o: '1.0850', h: '1.0900', l: '1.0820', c: '1.0875' }, volume: 1200 },
      { mid: { o: '1.0875', h: '1.0910', l: '1.0860', c: '1.0890' }, volume: 1500 }
    ];
    const result = normalizeForexBars(raw);
    expect(result).toEqual([
      { open: 1.0850, high: 1.0900, low: 1.0820, close: 1.0875, volume: 1200 },
      { open: 1.0875, high: 1.0910, low: 1.0860, close: 1.0890, volume: 1500 }
    ]);
  });

  test('defaults volume to 0 when missing', () => {
    const raw = [{ mid: { o: '1.0850', h: '1.0900', l: '1.0820', c: '1.0875' } }];
    const result = normalizeForexBars(raw);
    expect(result[0].volume).toBe(0);
  });

  test('returns empty array for null/undefined input', () => {
    expect(normalizeForexBars(null)).toEqual([]);
    expect(normalizeForexBars(undefined)).toEqual([]);
  });
});

describe('normalizeStockBars', () => {
  test('converts Alpaca bars {o,h,l,c,v} to {open,high,low,close,volume}', () => {
    const raw = [
      { o: 150.25, h: 152.00, l: 149.50, c: 151.75, v: 1000000 },
      { o: 151.75, h: 153.50, l: 151.00, c: 153.00, v: 1200000 }
    ];
    const result = normalizeStockBars(raw);
    expect(result).toEqual([
      { open: 150.25, high: 152.00, low: 149.50, close: 151.75, volume: 1000000 },
      { open: 151.75, high: 153.50, low: 151.00, close: 153.00, volume: 1200000 }
    ]);
  });

  test('handles already-normalized bars (passthrough)', () => {
    const raw = [{ open: 100, high: 105, low: 99, close: 103, volume: 50000 }];
    const result = normalizeStockBars(raw);
    expect(result[0].open).toBe(100);
  });

  test('returns empty array for null/undefined input', () => {
    expect(normalizeStockBars(null)).toEqual([]);
  });
});
