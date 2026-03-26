const { getRoundTripCost, COST_MODELS } = require('../cost-model');

describe('getRoundTripCost', () => {
  test('stock round-trip cost ~0.10%', () => {
    const cost = getRoundTripCost('stock', 100);
    expect(cost.costPct).toBeCloseTo(0.10, 1);
  });

  test('crypto round-trip cost ~0.30%', () => {
    const cost = getRoundTripCost('crypto', 50000);
    expect(cost.costPct).toBeCloseTo(0.30, 1);
  });

  test('forex returns pip-based cost', () => {
    const cost = getRoundTripCost('forex', 1.1000);
    expect(cost.costPips).toBeGreaterThan(0);
  });
});
