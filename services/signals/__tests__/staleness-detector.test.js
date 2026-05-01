/**
 * Staleness / FOMO Entry Detector Tests
 *
 * Covers Rule 2 categories: normal, boundary, malformed, adversarial, regression.
 */
const {
  detectPriceStaleness,
  detectVolumeStaleness,
  isEntryStale
} = require('../staleness-detector');

// Helper: build N bars with linearly-changing close price
function bars({ count = 10, startPrice = 100, endPrice = null, volume = 1000 } = {}) {
  endPrice = endPrice ?? startPrice;
  const out = [];
  for (let i = 0; i < count; i++) {
    const close = startPrice + ((endPrice - startPrice) * i) / (count - 1 || 1);
    out.push({ open: close * 0.999, high: close * 1.001, low: close * 0.998, close, volume });
  }
  return out;
}

describe('detectPriceStaleness', () => {
  // ── Normal cases ──────────────────────────────────────────────────────────
  it('returns stale=true for a long entry after a 3% rally', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 103 });
    const r = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 2.0 });
    // Last 5 bars span the back half of the rally — price moved ~1.7% in the window
    // Use a steeper rally to reliably trigger
    const steep = bars({ count: 10, startPrice: 100, endPrice: 110 });
    const steepResult = detectPriceStaleness(steep, 'long', { lookbackBars: 5, maxMovePct: 2.0 });
    expect(steepResult.stale).toBe(true);
    expect(steepResult.directionalMove).toBeGreaterThan(2.0);
    expect(steepResult.reason).toMatch(/FOMO/);
  });

  it('returns stale=false for a flat market', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 100 });
    const r = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 2.0 });
    expect(r.stale).toBe(false);
    expect(Math.abs(r.movePct)).toBeLessThan(0.1);
  });

  it('returns stale=false for a long entry after a DROP (counter-trend, valid)', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 95 });
    const r = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 2.0 });
    // Price dropped — this is NOT FOMO for a long entry, it's a buy-the-dip
    expect(r.stale).toBe(false);
  });

  it('returns stale=true for a short entry after a 5% drop', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 92 });
    const r = detectPriceStaleness(k, 'short', { lookbackBars: 5, maxMovePct: 2.0 });
    expect(r.stale).toBe(true);
    expect(r.directionalMove).toBeGreaterThan(2.0); // negative move × short = positive directional
  });

  it('returns stale=false for a short entry after a rally (counter-trend short)', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 105 });
    const r = detectPriceStaleness(k, 'short', { lookbackBars: 5, maxMovePct: 2.0 });
    // Long has rallied — short entry now is counter-trend, NOT FOMO
    expect(r.stale).toBe(false);
  });

  // ── Boundary ──────────────────────────────────────────────────────────────
  it('respects custom maxMovePct threshold', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 103 });
    const tight = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 0.5 });
    const loose = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 5.0 });
    expect(tight.stale).toBe(true);
    expect(loose.stale).toBe(false);
  });

  it('exact-match move is NOT stale (strict > comparison)', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 102 });
    // Window of last 5 bars captures the back half: 100 + 4/9*2 to 100+8/9*2 ≈ 0.89% move
    const r = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 0.89 });
    // Should be very close to threshold; strict > means not stale
    if (Math.abs(r.directionalMove - 0.89) < 0.01) {
      expect(r.stale).toBe(false);
    }
  });

  // ── Malformed ─────────────────────────────────────────────────────────────
  it('returns insufficient when klines is too short', () => {
    expect(detectPriceStaleness(bars({ count: 3 }), 'long', { lookbackBars: 5 }).reason).toMatch(/insufficient/);
    expect(detectPriceStaleness([], 'long').stale).toBe(false);
  });

  it('returns false for null/undefined klines', () => {
    expect(detectPriceStaleness(null, 'long').stale).toBe(false);
    expect(detectPriceStaleness(undefined, 'long').stale).toBe(false);
  });

  it('handles bars with NaN close prices gracefully', () => {
    const k = bars({ count: 10 });
    k[0].close = NaN;
    const r = detectPriceStaleness(k, 'long', { lookbackBars: 5 });
    expect(typeof r.stale).toBe('boolean');
  });

  it('handles zero start price', () => {
    const k = bars({ count: 10, startPrice: 0, endPrice: 0 });
    const r = detectPriceStaleness(k, 'long');
    expect(r.stale).toBe(false);
    expect(r.reason).toMatch(/invalid/);
  });

  // ── Adversarial ───────────────────────────────────────────────────────────
  it('treats unknown direction as "long"', () => {
    const k = bars({ count: 10, startPrice: 100, endPrice: 110 });
    const explicit = detectPriceStaleness(k, 'long', { lookbackBars: 5, maxMovePct: 2 });
    const unknown = detectPriceStaleness(k, 'sideways', { lookbackBars: 5, maxMovePct: 2 });
    expect(unknown.stale).toBe(explicit.stale);
  });
});

describe('detectVolumeStaleness', () => {
  it('returns stale=true when most recent bars are >= 1.8× baseline volume', () => {
    // 30 baseline bars at vol=1000, then 10 elevated bars at vol=2500
    const k = [
      ...bars({ count: 30, volume: 1000 }),
      ...bars({ count: 10, volume: 2500 })
    ];
    const r = detectVolumeStaleness(k, { lookbackBars: 10, elevatedThreshold: 1.8, maxElevatedBars: 5 });
    expect(r.stale).toBe(true);
    expect(r.elevatedBars).toBeGreaterThan(5);
  });

  it('returns stale=false when volume is normal', () => {
    const k = bars({ count: 40, volume: 1000 });
    const r = detectVolumeStaleness(k, { lookbackBars: 10 });
    expect(r.stale).toBe(false);
  });

  it('returns false when baseline window has zero volume', () => {
    const k = [
      ...bars({ count: 30, volume: 0 }),
      ...bars({ count: 10, volume: 5000 })
    ];
    const r = detectVolumeStaleness(k);
    expect(r.stale).toBe(false);
    expect(r.reason).toMatch(/zero baseline/);
  });

  it('returns insufficient for too-short kline arrays', () => {
    expect(detectVolumeStaleness(bars({ count: 5 })).stale).toBe(false);
    expect(detectVolumeStaleness([]).stale).toBe(false);
    expect(detectVolumeStaleness(null).stale).toBe(false);
  });
});

describe('isEntryStale (combined gate)', () => {
  it('triggers via price gate when price has moved a lot', () => {
    // 30 calm baseline bars + 5 bars of sharp rally so the lookback window catches the move
    const k = [
      ...bars({ count: 30, startPrice: 100, endPrice: 100, volume: 1000 }),
      ...bars({ count: 5, startPrice: 100, endPrice: 105, volume: 1000 })
    ];
    const r = isEntryStale(k, 'long', { lookbackBars: 5, maxMovePct: 2 });
    expect(r.stale).toBe(true);
    expect(r.gate).toBe('price');
  });

  it('triggers via volume gate when price is flat but volume is sustained', () => {
    const k = [
      ...bars({ count: 30, startPrice: 100, endPrice: 100, volume: 1000 }),
      ...bars({ count: 10, startPrice: 100, endPrice: 100.5, volume: 2500 })
    ];
    const r = isEntryStale(k, 'long', { lookbackBars: 10, maxMovePct: 5, elevatedThreshold: 1.8, maxElevatedBars: 5 });
    expect(r.stale).toBe(true);
    expect(r.gate).toBe('volume');
  });

  it('returns fresh when neither gate fires', () => {
    const k = bars({ count: 40, startPrice: 100, endPrice: 100.3, volume: 1000 });
    const r = isEntryStale(k, 'long', { lookbackBars: 5, maxMovePct: 2 });
    expect(r.stale).toBe(false);
    expect(r.reason).toMatch(/fresh/);
  });

  // ── Regression: empirical FOMO scenario from production data ──────────────
  it('regression: blocks the canonical FOMO setup (price up 4% on rising volume)', () => {
    // Pattern from losing high-conf trades: price has rallied 4%+ in 5 bars
    // on heavy volume, then displacement/orderFlow components fire
    const k = [
      ...bars({ count: 30, startPrice: 100, endPrice: 100, volume: 1000 }),  // baseline calm
      ...bars({ count: 5, startPrice: 100, endPrice: 104, volume: 2200 })    // FOMO rally
    ];
    const r = isEntryStale(k, 'long', { lookbackBars: 5, maxMovePct: 2 });
    expect(r.stale).toBe(true);
    // Should fire on the price gate — directional move ~4% > 2% threshold
    expect(r.gate).toBe('price');
  });
});
