/**
 * qualifier-backtest — verifies the FP/FN classification + P&L accounting logic
 * against the REAL qualifyEntry module on synthetic, controlled trades.
 */
const { backtestQualifier } = require('../backtest/qualifier-backtest');

// Helper to build a trade row in the shape /api/trades returns.
function trade({ id, conf, components, pnl_usd, pnl_pct = 0, t = '2026-01-01T00:00:00Z', symbol = 'X' }) {
  return {
    id, symbol, status: 'closed', pnl_usd, pnl_pct, entry_time: t,
    entry_context: { committeeConfidence: conf, committeeComponents: components },
  };
}
const GOOD = { momentum: 0.8, orderFlow: 0.7, displacement: 0.6, volumeProfile: 0.6 }; // 4 positive
const THIN = { momentum: 0.8, orderFlow: 0.2, displacement: 0.1, volumeProfile: 0.1 }; // 1 positive

describe('qualifier-backtest', () => {
  it('blocks below-threshold trades and attributes them to the threshold gate', () => {
    const r = backtestQualifier([trade({ id: 1, conf: 0.30, components: GOOD, pnl_usd: -5 })]);
    expect(r.blocked).toBe(1);
    expect(r.gateCounts.threshold).toBe(1);
  });

  it('counts a blocked loser as a true positive and reports P&L improvement', () => {
    const r = backtestQualifier([trade({ id: 1, conf: 0.30, components: GOOD, pnl_usd: -5 })]);
    expect(r.truePositives).toBe(1);
    expect(r.falsePositives).toBe(0);
    expect(r.pnl.improvement).toBe(5); // removing a -$5 trade improves total by +$5
    expect(r.blockPrecisionPct).toBe(100);
  });

  it('counts a blocked winner as a false positive (negative improvement)', () => {
    const r = backtestQualifier([trade({ id: 1, conf: 0.30, components: GOOD, pnl_usd: 4 })]);
    expect(r.falsePositives).toBe(1);
    expect(r.truePositives).toBe(0);
    expect(r.pnl.improvement).toBe(-4); // removing a +$4 trade hurts total by $4
    expect(r.blockPrecisionPct).toBe(0);
  });

  it('blocks on too-few-positive-components even when confidence is high', () => {
    // High conf passes threshold + EV, but THIN has only 1 component > 0.5.
    const r = backtestQualifier([trade({ id: 1, conf: 0.90, components: THIN, pnl_usd: -3 })]);
    expect(r.blocked).toBe(1);
    expect(r.gateCounts.components).toBe(1);
  });

  it('keeps a strong, high-confidence, multi-component trade', () => {
    const r = backtestQualifier([trade({ id: 1, conf: 0.90, components: GOOD, pnl_usd: 10 })]);
    expect(r.kept).toBe(1);
    expect(r.blocked).toBe(0);
  });

  it('ignores trades without committee data (cannot replay the gate)', () => {
    const r = backtestQualifier([
      { id: 1, status: 'closed', pnl_usd: -5, entry_time: '2026-01-01', entry_context: {} },
      trade({ id: 2, conf: 0.90, components: GOOD, pnl_usd: 10 }),
    ]);
    expect(r.evaluated).toBe(1);
  });

  it('aggregates a mixed book: blocked vs kept P&L split is consistent', () => {
    const r = backtestQualifier([
      trade({ id: 1, conf: 0.30, components: GOOD, pnl_usd: -5, t: '2026-01-01T00:00:00Z' }), // blocked loser
      trade({ id: 2, conf: 0.20, components: GOOD, pnl_usd: 2,  t: '2026-01-02T00:00:00Z' }), // blocked winner
      trade({ id: 3, conf: 0.90, components: GOOD, pnl_usd: 10, t: '2026-01-03T00:00:00Z' }), // kept winner
    ]);
    expect(r.evaluated).toBe(3);
    expect(r.blocked).toBe(2);
    expect(r.kept).toBe(1);
    expect(r.pnl.total).toBe(7);     // -5 + 2 + 10
    expect(r.pnl.blocked).toBe(-3);  // -5 + 2
    expect(r.pnl.kept).toBe(10);
    expect(r.pnl.improvement).toBe(3); // enabling removes -$3 of net P&L → +$3
  });

  it('is deterministic — identical input yields identical output', () => {
    const input = [trade({ id: 1, conf: 0.5, components: GOOD, pnl_usd: 1, pnl_pct: 0.01 })];
    expect(backtestQualifier(input)).toEqual(backtestQualifier(input));
  });
});
