const { computeMomentum } = require('../momentum');

describe('computeMomentum', () => {
  test('scores 5% move as 1.0 (capped)', () => {
    const result = computeMomentum({ momentum: 5.0 });
    expect(result.score).toBe(1.0);
  });

  test('scores 2.5% move as 0.5', () => {
    const result = computeMomentum({ momentum: 2.5 });
    expect(result.score).toBe(0.5);
  });

  test('scores negative momentum using absolute value', () => {
    const result = computeMomentum({ momentum: -3.0 });
    expect(result.score).toBeCloseTo(0.6);
  });

  test('scores 0% move as 0', () => {
    const result = computeMomentum({ momentum: 0 });
    expect(result.score).toBe(0);
  });

  test('caps at 1.0 for extreme moves', () => {
    const result = computeMomentum({ momentum: 15.0 });
    expect(result.score).toBe(1.0);
  });

  test('returns raw momentum value', () => {
    const result = computeMomentum({ momentum: 3.5 });
    expect(result.raw.momentum).toBe(3.5);
  });
});
