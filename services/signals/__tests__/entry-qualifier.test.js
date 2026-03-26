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
});
