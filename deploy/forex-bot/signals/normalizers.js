/**
 * Bar normalizers — convert exchange-specific OHLCV formats to the
 * shared {open, high, low, close, volume} shape used by all signal modules.
 *
 * Crypto (Binance/Kraken): [timestamp, open, high, low, close, volume]
 * Forex (OANDA):           {mid: {o, h, l, c}, volume}
 * Stock (Alpaca):          {o, h, l, c, v} or already normalized
 */

function normalizeCryptoBars(klines) {
  if (!klines || !klines.length) return [];
  return klines.map(k => ({
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]) || 0
  }));
}

function normalizeForexBars(candles) {
  if (!candles || !candles.length) return [];
  return candles.map(c => ({
    open:   parseFloat(c.mid.o),
    high:   parseFloat(c.mid.h),
    low:    parseFloat(c.mid.l),
    close:  parseFloat(c.mid.c),
    volume: c.volume || 0
  }));
}

function normalizeStockBars(bars) {
  if (!bars || !bars.length) return [];
  return bars.map(b => ({
    open:   b.open ?? b.o,
    high:   b.high ?? b.h,
    low:    b.low  ?? b.l,
    close:  b.close ?? b.c,
    volume: b.volume ?? b.v ?? 0
  }));
}

module.exports = { normalizeCryptoBars, normalizeForexBars, normalizeStockBars };
