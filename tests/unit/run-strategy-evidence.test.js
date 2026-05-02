/**
 * Tests for the pure helpers in scripts/run-strategy-evidence.js
 *
 * Don't test the full main() flow — that requires broker API credentials
 * and a Postgres connection. These tests cover the deterministic, side-
 * effect-free pieces: arg parsing, bar normalization, run-id derivation,
 * and the SQL row payload builders.
 */

const path = require('path');
const helpers = require(path.join(__dirname, '..', '..', 'scripts', 'run-strategy-evidence.js'));
const { parseArgs, normalizeBars, buildRunId, buildBacktestRow, buildWalkForwardRows } = helpers;

describe('parseArgs', () => {
  it('parses --key value pairs', () => {
    const a = parseArgs(['--strategy', 'stockOrb', '--symbol', 'AAPL']);
    expect(a.strategy).toBe('stockOrb');
    expect(a.symbol).toBe('AAPL');
  });

  it('treats lone --flag as boolean true', () => {
    const a = parseArgs(['--dry-run', '--verbose']);
    expect(a['dry-run']).toBe(true);
    expect(a.verbose).toBe(true);
  });

  it('does not consume next flag as value', () => {
    const a = parseArgs(['--dry-run', '--symbol', 'AAPL']);
    expect(a['dry-run']).toBe(true);
    expect(a.symbol).toBe('AAPL');
  });

  it('captures positional args', () => {
    const a = parseArgs(['extra', '--symbol', 'AAPL']);
    expect(a._).toEqual(['extra']);
  });
});

describe('normalizeBars', () => {
  it('maps DataLoader full-name shape to harness one-letter shape', () => {
    const raw = [
      { time: 't1', open: 100, high: 101, low: 99, close: 100.5, volume: 5000 },
      { time: 't2', open: 100.5, high: 102, low: 100, close: 101, volume: 6000 }
    ];
    const norm = normalizeBars(raw);
    expect(norm).toHaveLength(2);
    expect(norm[0]).toEqual({ t: 't1', o: 100, h: 101, l: 99, c: 100.5, v: 5000 });
  });

  it('passes through bars already in one-letter shape', () => {
    const raw = [{ t: 't', o: 1, h: 2, l: 0.5, c: 1.5, v: 100 }];
    expect(normalizeBars(raw)[0]).toEqual({ t: 't', o: 1, h: 2, l: 0.5, c: 1.5, v: 100 });
  });

  it('drops bars with non-finite OHLC', () => {
    const raw = [
      { open: 1, high: 2, low: 0.5, close: 1.5 },
      { open: NaN, high: 2, low: 0.5, close: 1.5 },
      { open: 1, high: 'oops', low: 0.5, close: 1.5 },
      { open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }
    ];
    expect(normalizeBars(raw)).toHaveLength(2);
  });

  it('returns empty array for non-array input', () => {
    expect(normalizeBars(null)).toEqual([]);
    expect(normalizeBars(undefined)).toEqual([]);
    expect(normalizeBars('not bars')).toEqual([]);
  });

  it('defaults volume to 0 when missing', () => {
    const norm = normalizeBars([{ open: 1, high: 2, low: 0.5, close: 1.5 }]);
    expect(norm[0].v).toBe(0);
  });
});

describe('buildRunId', () => {
  it('produces a deterministic id with date suffix', () => {
    const id = buildRunId('stockOrb', 'AAPL', '5m');
    // Format: stockOrb_AAPL_5m_YYYY-MM-DD
    expect(id).toMatch(/^stockOrb_AAPL_5m_\d{4}-\d{2}-\d{2}$/);
  });

  it('different symbols produce different ids', () => {
    const a = buildRunId('stockOrb', 'AAPL', '5m');
    const b = buildRunId('stockOrb', 'TSLA', '5m');
    expect(a).not.toBe(b);
  });
});

// ── buildBacktestRow ─────────────────────────────────────────────────────────
const sampleHarness = {
  gateA: { passed: true },
  gateB: { passed: false },
  folds: [
    { foldIndex: 0, inSample: { sharpe: 1.2 }, outOfSample: { sharpe: 0.8, winRate: 0.55, profitFactor: 1.4, tradeCount: 12, totalPnl: 25.5, maxDrawdownPct: 4.2 } },
    { foldIndex: 1, inSample: { sharpe: 1.0 }, outOfSample: { sharpe: 0.4, winRate: 0.45, profitFactor: 1.1, tradeCount: 10, totalPnl: 8.0, maxDrawdownPct: 6.0 } }
  ],
  allTrades: [
    { pnl: 5 }, { pnl: -3 }, { pnl: 8 }, { pnl: -2 }, { pnl: 1 }, { pnl: -4 },
    { pnl: 7 }, { pnl: -1 }, { pnl: 3 }, { pnl: -2 }, { pnl: 6 }, { pnl: -3 },
    { pnl: 4 }, { pnl: -2 }, { pnl: 5 }, { pnl: -1 }, { pnl: 2 }, { pnl: -3 },
    { pnl: 6 }, { pnl: -2 }, { pnl: 3 }, { pnl: -1 }
  ],
  summary: {
    foldCount: 2,
    totalOOSTrades: 22,
    oosWinRate: 0.5,
    oosSharpe: 0.6,
    oosMaxDrawdown: 6.0,
    oosTotalPnl: 33.5,
    passedGateA: true,
    passedGateB: false
  }
};

describe('buildBacktestRow', () => {
  it('produces a row with all schema-required fields', () => {
    const row = buildBacktestRow({
      strategy: 'stockOrb', assetClass: 'stock', harnessResult: sampleHarness,
      dateRangeStart: '2026-04-01', dateRangeEnd: '2026-05-01', coverage: 0.9
    });
    expect(row).toMatchObject({
      strategy_name: 'stockOrb',
      asset_class: 'stock',
      date_range_start: '2026-04-01',
      date_range_end: '2026-05-01',
      coverage: 0.9,
      passed_gate_a: true,
      passed_walk_forward: false
    });
    expect(row.trade_count).toBe(22);
    expect(row.win_rate).toBeCloseTo(0.5, 2);
    expect(row.profit_factor).toBeGreaterThan(0);
  });

  it('caps trades_sample at 20 entries to keep payload bounded', () => {
    const row = buildBacktestRow({
      strategy: 'stockOrb', assetClass: 'stock', harnessResult: sampleHarness,
      dateRangeStart: '2026-04-01', dateRangeEnd: '2026-05-01', coverage: 0.9
    });
    expect(row.trades_sample.length).toBeLessThanOrEqual(20);
  });

  it('computes profit_factor when summary omits it', () => {
    const row = buildBacktestRow({
      strategy: 's', assetClass: 'stock', harnessResult: sampleHarness,
      dateRangeStart: '2026-04-01', dateRangeEnd: '2026-05-01', coverage: 1
    });
    // Wins sum = 5+8+1+7+3+6+4+5+2+6+3 = 50; Losses = |3+2+4+1+2+3+2+1+3+2+1| = 24; PF ~2.08
    expect(row.profit_factor).toBeCloseTo(2.08, 1);
  });

  it('handles empty harness gracefully', () => {
    const row = buildBacktestRow({
      strategy: 's', assetClass: 'stock',
      harnessResult: { gateA: { passed: false }, gateB: { passed: false }, folds: [], allTrades: [], summary: {} },
      dateRangeStart: '2026-04-01', dateRangeEnd: '2026-05-01', coverage: 0
    });
    expect(row.trade_count).toBe(0);
    expect(row.passed_gate_a).toBe(false);
    expect(row.passed_walk_forward).toBe(false);
  });
});

describe('buildWalkForwardRows', () => {
  it('produces one row per fold with all schema fields', () => {
    const rows = buildWalkForwardRows({
      strategy: 'stockOrb', assetClass: 'stock', harnessResult: sampleHarness, runId: 'run123'
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      strategy_name: 'stockOrb',
      asset_class: 'stock',
      fold_index: 0,
      run_id: 'run123'
    });
    // Sharpe decay = train - test
    expect(rows[0].sharpe_decay).toBeCloseTo(0.4, 2); // 1.2 - 0.8
    expect(rows[1].sharpe_decay).toBeCloseTo(0.6, 2); // 1.0 - 0.4
  });

  it('returns empty array when no folds', () => {
    const rows = buildWalkForwardRows({
      strategy: 's', assetClass: 'stock',
      harnessResult: { folds: [] }, runId: 'r'
    });
    expect(rows).toEqual([]);
  });
});
