const { qualifyEntry } = require('../entry-qualifier');

describe('qualifyEntry', () => {
  test('qualifies when confidence above threshold and positive EV', () => {
    const committee = { confidence: 0.55, calibrated: 0.55 };
    const result = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 2 }, { costPct: 0.1 });
    expect(result.qualified).toBe(true);
    expect(result.ev).toBeGreaterThan(0);
  });

  test('rejects when confidence below threshold', () => {
    const committee = { confidence: 0.3, calibrated: 0.3 };
    const result = qualifyEntry(committee, { threshold: 0.45 }, { costPct: 0.1 });
    expect(result.qualified).toBe(false);
    expect(result.reason).toContain('threshold');
  });

  test('rejects when EV is negative after costs', () => {
    const committee = { confidence: 0.46, calibrated: 0.46 };
    const result = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 0.5, avgLossPct: 2 }, { costPct: 0.5 });
    expect(result.qualified).toBe(false);
    expect(result.reason).toContain('EV');
  });

  test('rejects when too few positive components', () => {
    const committee = { confidence: 0.6, calibrated: 0.6, components: { a: 0.8, b: 0.2, c: 0.1 } };
    const result = qualifyEntry(committee, { threshold: 0.45, minPositiveComponents: 2 });
    expect(result.qualified).toBe(false);
    expect(result.reason).toContain('components');
  });

  test('allocationFactor scales with confidence', () => {
    const low = qualifyEntry({ confidence: 0.5 }, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1 });
    const high = qualifyEntry({ confidence: 0.8 }, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1 });
    expect(high.allocationFactor).toBeGreaterThan(low.allocationFactor);
  });

  // ── Phase 4: ML integration tests ──

  test('ML win probability blends into EV calculation', () => {
    const committee = { confidence: 0.55, calibrated: 0.55 };
    // Without ML
    const noMl = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 2 });
    // With high ML win probability — should increase EV
    const withMl = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 2, mlWinProbability: 0.7 });
    expect(withMl.ev).toBeGreaterThan(noMl.ev);
    expect(withMl.effectiveWinRate).toBeGreaterThan(0.55);
  });

  test('low ML win probability reduces allocation', () => {
    const committee = { confidence: 0.55, calibrated: 0.55 };
    const normal = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1 });
    const lowMl = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1, mlWinProbability: 0.2 });
    expect(lowMl.allocationFactor).toBeLessThan(normal.allocationFactor);
  });

  test('regime confidence reduces allocation when transitioning', () => {
    const committee = { confidence: 0.6, calibrated: 0.6 };
    const confident = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1, regimeConfidence: 0.9 });
    const transitioning = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1, regimeConfidence: 0.3 });
    expect(transitioning.allocationFactor).toBeLessThan(confident.allocationFactor);
  });

  test('regime size multiplier directly scales allocation', () => {
    const committee = { confidence: 0.6, calibrated: 0.6 };
    const normal = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1 });
    const crisis = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1, regimeSizeMultiplier: 0.3 });
    expect(crisis.allocationFactor).toBeCloseTo(normal.allocationFactor * 0.3, 1);
  });

  test('allocation never drops below 0.1 (10% floor)', () => {
    const committee = { confidence: 0.5, calibrated: 0.5 };
    const result = qualifyEntry(committee, {
      threshold: 0.45, avgWinPct: 3, avgLossPct: 1,
      regimeConfidence: 0.1,
      regimeSizeMultiplier: 0.3,
      mlWinProbability: 0.1,
    });
    expect(result.allocationFactor).toBeGreaterThanOrEqual(0.1);
  });

  test('ML and regime params are optional — works without them', () => {
    const committee = { confidence: 0.6, calibrated: 0.6 };
    const result = qualifyEntry(committee, { threshold: 0.45, avgWinPct: 3, avgLossPct: 1 });
    expect(result.qualified).toBe(true);
    // effectiveWinRate should not be present or should equal confidence when no ML
  });
});
