/**
 * edge-stats — Item 3 statistics (stationary-bootstrap CI, n_eff, DSR).
 *
 * Synthetic, self-contained, DETERMINISTIC (seeded RNG → reproducible, no DB).
 * Guards the property that motivated Item 3: the parametric CI undercovers the
 * mean of fat-tailed + serially-correlated trade P&L, while the edge-corrected
 * stationary bootstrap holds ~95% nominal coverage. A regression to the naive
 * percentile/parametric method drops coverage to ~83-88% and fails these tests.
 */
const S = require('../edge-stats');

// deterministic RNG (mulberry32) + Box-Muller normal
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(20260523);
function randn() { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function fat() { return rng() < 0.1 ? randn() * 3 : randn(); } // kurtosis ~8
function gen(n, mu, rho, s, heavy) { const inn = heavy ? fat : randn; let y = 0; for (let i = 0; i < 40; i++) y = rho * y + inn(); const o = new Array(n); for (let i = 0; i < n; i++) { y = rho * y + inn(); o[i] = mu + s * y; } return o; }

// Lean regression smoke (deterministic). Jest imposes a large slowdown on tight
// numeric loops, so the unit test runs a SMALL Monte Carlo just big enough to
// separate the corrected method (~94%) from a regression to the naive method
// (~85%). Full-rigor 92-97% certification (B=5000, 800 buckets/cell across the
// n=50/70/130 grid) is the standalone evidence script, run on demand:
//   node services/signals/edge-stats-coverage.js
const B = 600, BK = 80, SS = 0.01;
function coverage(n, mu, rho, heavy) {
  let boot = 0, param = 0;
  for (let b = 0; b < BK; b++) {
    const ser = gen(n, mu, rho, SS, heavy);
    const [lo, hi] = S.stationaryBootstrapCI(ser, B, rng);
    if (mu >= lo && mu <= hi) boot++;
    const m = S.mean(ser), se = S.stddev(ser) / Math.sqrt(n);
    if (mu >= m - 1.96 * se && mu <= m + 1.96 * se) param++;
  }
  return { boot: 100 * boot / BK, param: 100 * param / BK };
}

describe('edge-stats 3a — stationary-bootstrap CI coverage', () => {
  it('brackets the mean and widens vs parametric on autocorrelated heavy data (fixed sample)', () => {
    const ser = gen(80, 0, 0.3, SS, true);
    const m = S.mean(ser);
    const [lo, hi] = S.stationaryBootstrapCI(ser, 3000, mulberry32(1));
    expect(lo).toBeLessThan(m); expect(hi).toBeGreaterThan(m);     // CI brackets the sample mean
    const se = S.stddev(ser) / Math.sqrt(ser.length);
    expect(hi - lo).toBeGreaterThan(2 * 1.96 * se * 0.95);          // bootstrap not narrower than parametric
  });

  it('coverage smoke: ~95% on fat-tailed + AR(1), beating parametric (small MC)', () => {
    const { boot, param } = coverage(50, 0, 0.3, true);
    expect(boot).toBeGreaterThanOrEqual(88);   // a regression to the naive method reads ~83-88
    expect(boot).toBeLessThanOrEqual(99);
    expect(boot).toBeGreaterThanOrEqual(param); // bootstrap covers at least as well as parametric
  });
});

describe('edge-stats 3b — effective sample size', () => {
  it('shrinks n under positive autocorrelation and equals n when independent', () => {
    let acc = 0; for (let i = 0; i < 100; i++) acc += S.effectiveN(gen(70, 0, 0.3, SS, true));
    expect(acc / 100).toBeLessThan(70);
    expect(S.effectiveN([1, 2])).toBe(2);          // n < 3 guard
  });
});

describe('edge-stats 3d — Deflated Sharpe Ratio', () => {
  it('haircuts a best-of-15 survivorship winner below its naive Sharpe', () => {
    const T = 60, TRIALS = 15, sh = [], ser = [];
    for (let t = 0; t < TRIALS; t++) { const s = gen(T, 0, 0.3, SS, true); ser.push(s); sh.push(S.sharpe(s)); }
    let w = 0; for (let t = 1; t < TRIALS; t++) if (sh[t] > sh[w]) w = t;
    const mSh = S.mean(sh), varSR = sh.reduce((a, x) => a + (x - mSh) * (x - mSh), 0) / (sh.length - 1);
    const d = S.deflatedSharpe(ser[w], TRIALS, varSR);
    expect(d.sr0).toBeGreaterThan(0);              // multiple-testing benchmark is positive
    expect(d.sharpe - d.sr0).toBeLessThan(d.sharpe); // haircut applied
    expect(d.dsr).toBeLessThan(S.normCdf(d.sharpe * Math.sqrt(T - 1))); // DSR < naive significance
  });

  it('lets a genuinely strong single strategy survive deflation', () => {
    const strong = gen(60, 0.012, 0.3, SS, true);
    const d = S.deflatedSharpe(strong, 15, 0.05);
    expect(d.dsr).toBeGreaterThan(0.5);
  });
});
