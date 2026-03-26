const { calibrateConfidence, fitPlattScaling } = require('../confidence-calibrator');

describe('calibrateConfidence', () => {
  test('returns raw score when not calibrated', () => {
    const result = calibrateConfidence(0.6, null);
    expect(result).toBe(0.6);
  });

  test('applies Platt scaling when params provided', () => {
    const params = { A: -2.0, B: 1.0, calibrated: true };
    const result = calibrateConfidence(0.6, params);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
    expect(result).not.toBe(0.6);
  });
});

describe('fitPlattScaling', () => {
  test('returns null with insufficient data', () => {
    const result = fitPlattScaling([]);
    expect(result).toBeNull();
  });

  test('fits parameters from evaluation data', () => {
    const evals = [];
    for (let i = 0; i < 30; i++) {
      evals.push({
        signals: { committeeConfidence: 0.3 + Math.random() * 0.4 },
        pnl: Math.random() > 0.5 ? 1 : -1
      });
    }
    const result = fitPlattScaling(evals);
    expect(result).toHaveProperty('A');
    expect(result).toHaveProperty('B');
    expect(result.calibrated).toBe(true);
  });
});
