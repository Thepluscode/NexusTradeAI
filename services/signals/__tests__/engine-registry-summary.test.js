/**
 * engine-registry-summary — registry rollup + operational-status derivation.
 */
const { summarizeRegistry, operationalStatus, listEngineCredentials } = require('../engine-registry-summary');

const NOW = 1_000_000_000_000;
const eng = (o) => ({ isRunning: false, demoMode: false, credentialsValid: null, ...o });
const reg = (arr) => new Map(arr.map((e, i) => [i, e]));

describe('summarizeRegistry', () => {
  it('empty / null registry → all zeros, null scan age', () => {
    expect(summarizeRegistry(null, NOW)).toMatchObject({ total: 0, running: 0, lastScanAgeSec: null });
    expect(summarizeRegistry(new Map(), NOW)).toMatchObject({ total: 0, lastScanAt: null });
  });

  it('counts total / running / validCreds / demo independently', () => {
    const s = summarizeRegistry(reg([
      eng({ isRunning: true,  credentialsValid: true }),
      eng({ isRunning: true,  demoMode: true }),
      eng({ isRunning: false, credentialsValid: true }),
    ]), NOW);
    expect(s).toMatchObject({ total: 3, running: 2, validCreds: 2, demo: 1 });
  });

  it('counts running via botRunning too (stock/forex engines have no isRunning)', () => {
    const s = summarizeRegistry(reg([
      { botRunning: true, positions: new Map() },   // forex/stock-style
      { isRunning: true, positions: new Map() },     // crypto-style
      { botRunning: false },
    ]), NOW);
    expect(s.running).toBe(2);
    expect(s.total).toBe(3);
  });

  it('aggregates open positions from each engine.positions.size', () => {
    const s = summarizeRegistry(reg([
      eng({ positions: new Map([['BTC', {}], ['ETH', {}]]) }),
      eng({ positions: new Map([['SOL', {}]]) }),
    ]), NOW);
    expect(s.openPositions).toBe(3);
  });

  it('takes the most-recent lastScanAt and computes age', () => {
    const s = summarizeRegistry(reg([
      eng({ lastScanAt: NOW - 120_000 }),
      eng({ lastScanAt: NOW - 30_000 }),  // newest
      eng({ lastScanAt: 0 }),             // ignored
    ]), NOW);
    expect(s.lastScanAt).toBe(NOW - 30_000);
    expect(s.lastScanAgeSec).toBe(30);
  });

  it('ignores null engines and non-finite scan timestamps', () => {
    const s = summarizeRegistry(reg([null, eng({ lastScanAt: NaN }), eng({ lastScanAt: undefined })]), NOW);
    expect(s.total).toBe(2);
    expect(s.lastScanAt).toBeNull();
  });
});

describe('listEngineCredentials', () => {
  it('returns per-engine cred state keyed by registry userId, never secret values', () => {
    const registry = new Map([
      [42, { isRunning: true, demoMode: true, credentialsValid: false, credentialsError: 'Kraken credentials invalid or expired', apiKey: 'SECRET', apiSecret: 'SECRET' }],
      [7, { botRunning: true, credentialsValid: true, credentialsError: null }],
    ]);
    const list = listEngineCredentials(registry);
    expect(list).toEqual([
      { userId: 42, running: true, demo: true, credentialsValid: false, credentialsError: 'Kraken credentials invalid or expired' },
      { userId: 7, running: true, demo: false, credentialsValid: true, credentialsError: null },
    ]);
    // no secret leakage
    expect(JSON.stringify(list)).not.toContain('SECRET');
  });

  it('empty / null registry → empty array; skips null engines', () => {
    expect(listEngineCredentials(null)).toEqual([]);
    expect(listEngineCredentials(new Map([[1, null]]))).toEqual([]);
  });
});

describe('operationalStatus', () => {
  const ue = (o) => ({ total: 0, running: 0, lastScanAgeSec: null, ...o });

  it('per-user engines running + scanning recently → ok', () => {
    expect(operationalStatus({ userEngines: ue({ total: 2, running: 2, lastScanAgeSec: 30 }) })).toBe('ok');
  });
  it('per-user engines exist but none running → idle', () => {
    expect(operationalStatus({ userEngines: ue({ total: 2, running: 0 }) })).toBe('idle');
  });
  it('per-user engine running but no scan yet → starting', () => {
    expect(operationalStatus({ userEngines: ue({ total: 1, running: 1, lastScanAgeSec: null }) })).toBe('starting');
  });
  it('per-user engine running but scan is stale → scan-stalled', () => {
    expect(operationalStatus({ userEngines: ue({ total: 1, running: 1, lastScanAgeSec: 9999 }) }, { scanThresholdSec: 600 })).toBe('scan-stalled');
  });
  it('no per-user engines + global demo → demo-idle (expected, not an alarm)', () => {
    expect(operationalStatus({ demoMode: true, userEngines: ue({}) })).toBe('demo-idle');
  });
  it('no per-user engines + global scan unhealthy → scan-stalled', () => {
    expect(operationalStatus({ demoMode: false, scanHealthy: false, userEngines: ue({}) })).toBe('scan-stalled');
  });
  it('no per-user engines + global healthy → ok', () => {
    expect(operationalStatus({ demoMode: false, scanHealthy: true, userEngines: ue({}) })).toBe('ok');
  });
});
