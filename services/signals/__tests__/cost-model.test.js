const { getRoundTripCost, COST_MODELS } = require('../cost-model');

describe('getRoundTripCost', () => {
  // ── Normal cases ──────────────────────────────────────────────────────────
  test('stock round-trip cost ~0.10%', () => {
    const cost = getRoundTripCost('stock', 100);
    expect(cost.costPct).toBeCloseTo(0.10, 1);
  });

  test('crypto round-trip cost ~0.72% (Kraken tier-0 taker 0.26% × 2 + slippage 0.10% × 2)', () => {
    const cost = getRoundTripCost('crypto', 50000);
    expect(cost.costPct).toBeCloseTo(0.72, 2);
  });

  test('forex returns pip-based cost', () => {
    const cost = getRoundTripCost('forex', 1.1000);
    expect(cost.costPips).toBeGreaterThan(0);
  });

  // ── Boundary / numerical sanity ───────────────────────────────────────────
  test('crypto costUsd scales linearly with price', () => {
    const cheap = getRoundTripCost('crypto', 1);
    const expensive = getRoundTripCost('crypto', 100000);
    expect(expensive.costUsd).toBeCloseTo(cheap.costUsd * 100000, 2);
  });

  test('forex JPY pair (price > 10) uses 0.01 pip value', () => {
    const usdJpy = getRoundTripCost('forex', 150);
    // (1.5 + 0.5) * 2 pips = 4 pips, pipValue=0.01, costPct = 4 * 0.01 / 150 * 100 ≈ 0.0267
    expect(usdJpy.costPct).toBeCloseTo(0.0267, 3);
  });

  test('forex non-JPY pair (price <= 10) uses 0.0001 pip value', () => {
    const eurUsd = getRoundTripCost('forex', 1.10);
    // 4 pips * 0.0001 / 1.10 * 100 ≈ 0.0364
    expect(eurUsd.costPct).toBeCloseTo(0.0364, 3);
  });

  // ── Malformed / adversarial cases ─────────────────────────────────────────
  test('throws on unknown bot type', () => {
    expect(() => getRoundTripCost('options', 100)).toThrow(/Unknown bot type/);
  });

  test('throws on zero price', () => {
    expect(() => getRoundTripCost('crypto', 0)).toThrow(/Invalid price/);
  });

  test('throws on negative price', () => {
    expect(() => getRoundTripCost('crypto', -50)).toThrow(/Invalid price/);
  });

  test('throws on NaN price', () => {
    expect(() => getRoundTripCost('crypto', NaN)).toThrow(/Invalid price/);
  });

  test('throws on Infinity price', () => {
    expect(() => getRoundTripCost('crypto', Infinity)).toThrow(/Invalid price/);
  });

  // ── Regression: EV calc compatibility ─────────────────────────────────────
  test('crypto cost in same units as avgWinPct (entry-qualifier compat)', () => {
    // entry-qualifier subtracts costPct from EV where avgWinPct is in % units.
    // Round-trip cost should be a small fraction of typical 2% win — not larger.
    const cost = getRoundTripCost('crypto', 50000);
    expect(cost.costPct).toBeLessThan(2.0);
    expect(cost.costPct).toBeGreaterThan(0.1);
  });

  test('cost model is exposed for inspection', () => {
    expect(COST_MODELS.crypto).toHaveProperty('takerFeePct');
    expect(COST_MODELS.stock).toHaveProperty('spreadPct');
    expect(COST_MODELS.forex).toHaveProperty('spreadPips');
  });
});
