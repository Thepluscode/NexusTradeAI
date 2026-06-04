/**
 * kill-switch-oos — verifies the CI statistic and the zero-look-ahead walk-forward
 * classification on synthetic, controlled trades.
 */
const { backtestKillSwitchOOS, ciUpper, sampleStd } = require('../backtest/kill-switch-oos');

describe('statistics', () => {
  it('sampleStd uses n-1 (matches Postgres STDDEV)', () => {
    // values [1,2,3]: mean 2, variance (1+0+1)/2 = 1 → std 1
    expect(sampleStd([1, 2, 3], 2)).toBeCloseTo(1, 9);
  });
  it('ciUpper = mean + 1.96*sd/sqrt(n); all-negative sample stays < 0', () => {
    const xs = [-0.01, -0.012, -0.009, -0.011, -0.01];
    const u = ciUpper(xs);
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    expect(u).toBeCloseTo(mean + 1.96 * sampleStd(xs, mean) / Math.sqrt(xs.length), 9);
    expect(u).toBeLessThan(0); // tight, clearly-losing bucket
  });
  it('a wide-variance losing-mean sample has CI upper > 0 (not confidently losing)', () => {
    expect(ciUpper([-0.5, 0.48, -0.49, 0.47, -0.46])).toBeGreaterThan(0);
  });
});

// Build a trade with explicit entry/exit so the walk-forward window is deterministic.
function tr({ id, strat, regime, pnl_usd, pnl_pct, day, symbol = 'X' }) {
  const entry = `2026-03-${String(day).padStart(2, '0')}T12:00:00Z`;
  return {
    id, symbol, status: 'closed', strategy: strat, market_regime: regime,
    pnl_usd, pnl_pct, entry_time: entry, exit_time: entry,
  };
}

describe('walk-forward classification', () => {
  it('does not block until the trailing bucket reaches minN (no look-ahead)', () => {
    // 5 prior losers in bucket A, then a 6th A trade. minN=5 → 6th should be blocked,
    // earlier ones cannot be (bucket had < 5 priors at their moment).
    const trades = [];
    for (let d = 1; d <= 6; d++) trades.push(tr({ id: d, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: d }));
    const r = backtestKillSwitchOOS(trades, { windowDays: 30, minN: 5 });
    expect(r.blocked).toBe(1);          // only the 6th
    expect(r.blockedSample[0].id).toBe(6);
    expect(r.blockedSample[0].n).toBe(5); // judged on the 5 priors
  });

  it('only blocks the flagged bucket; a healthy bucket keeps trading', () => {
    const trades = [];
    // Bucket A: 6 losers (will flag). Bucket B: 6 winners (won't flag).
    for (let d = 1; d <= 6; d++) trades.push(tr({ id: 100 + d, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: d }));
    for (let d = 1; d <= 6; d++) trades.push(tr({ id: 200 + d, strat: 'B', regime: 'R', pnl_usd: 3, pnl_pct: 0.01, day: d }));
    const r = backtestKillSwitchOOS(trades, { windowDays: 30, minN: 5 });
    expect(r.blocked).toBe(1);                 // only the 6th A
    expect(r.blockedSample[0].bucket).toBe('A|R');
    expect(r.pnl.kept).toBeGreaterThan(0);     // the winning B bucket survives
  });

  it('respects the trailing window — old losers age out and stop flagging', () => {
    const trades = [];
    for (let d = 1; d <= 5; d++) trades.push(tr({ id: d, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: d }));
    // A trade 40 days later: the 5 priors are outside a 30-day window → not enough recent samples.
    trades.push(tr({ id: 99, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: 1, symbol: 'late' }));
    trades[trades.length - 1].entry_time = '2026-04-20T12:00:00Z';
    trades[trades.length - 1].exit_time = '2026-04-20T12:00:00Z';
    const r = backtestKillSwitchOOS(trades, { windowDays: 30, minN: 5 });
    expect(r.blocked).toBe(0); // window emptied → no flag
  });

  it('reports FP/FN and P&L improvement consistently', () => {
    const trades = [];
    for (let d = 1; d <= 5; d++) trades.push(tr({ id: d, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: d }));
    trades.push(tr({ id: 6, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: 6 })); // blocked loser (TP)
    trades.push(tr({ id: 7, strat: 'A', regime: 'R', pnl_usd: 1, pnl_pct: 0.01, day: 7 }));  // blocked winner (FP)
    const r = backtestKillSwitchOOS(trades, { windowDays: 30, minN: 5 });
    expect(r.blocked).toBe(2);
    expect(r.truePositives).toBe(1);
    expect(r.falsePositives).toBe(1);
    expect(r.blockPrecisionPct).toBe(50);
    expect(r.pnl.blocked).toBe(-1);       // -2 + 1
    expect(r.pnl.improvement).toBe(1);    // enforcing removes -$1 net → +$1
  });

  it('is deterministic', () => {
    const trades = [tr({ id: 1, strat: 'A', regime: 'R', pnl_usd: -2, pnl_pct: -0.01, day: 1 })];
    expect(backtestKillSwitchOOS(trades)).toEqual(backtestKillSwitchOOS(trades));
  });
});
