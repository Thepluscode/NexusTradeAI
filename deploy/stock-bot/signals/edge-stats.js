'use strict';
/**
 * edge-stats.js — robust statistics for /api/edge-attribution (Item 3).
 *
 * Replaces the parametric CI (mean ± 1.96·σ/√n) with a stationary bootstrap
 * (Politis & Romano 1994) that holds nominal coverage under the fat tails and
 * serial correlation of real trade P&L, plus effective-n, regime coverage, and
 * the Deflated Sharpe Ratio (Bailey & López de Prado 2014).
 *
 * Why not the textbook percentile bootstrap: the block/stationary bootstrap's
 * variance of the mean is biased LOW by the finite-sample edge effect
 * (end observations appear in fewer blocks; empirically ≈ 1 − 1/√n), and the
 * raw percentile interval undercovers the mean under fat tails. We therefore
 * take the edge-corrected bootstrap long-run SE of the mean (which captures
 * serial dependence via the blocks) and scale it by a Student-t quantile on the
 * EFFECTIVE sample size. Calibrated to ~95% coverage across normal-iid and
 * fat-tailed+AR(1) synthetic data at n=50/70/130 — see __tests__/edge-stats.test.js.
 *
 * Pure functions, no side effects, no DB. Safe to require from a bot or a test.
 */

const EDGE_K = 1.5; // finite-sample edge-bias coefficient in (1 - k/√n); calibrated

// ---------- moments ----------
function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
function stddev(a) {
  const n = a.length; if (n < 2) return 0; const m = mean(a);
  let v = 0; for (let i = 0; i < n; i++) { const d = a[i] - m; v += d * d; }
  return Math.sqrt(v / (n - 1));
}
function skewness(a) {
  const n = a.length, s = stddev(a); if (n < 3 || s === 0) return 0; const m = mean(a);
  let acc = 0; for (let i = 0; i < n; i++) acc += Math.pow((a[i] - m) / s, 3);
  return acc / n;
}
function kurtosis(a) {
  const n = a.length, s = stddev(a); if (n < 4 || s === 0) return 3; const m = mean(a);
  let acc = 0; for (let i = 0; i < n; i++) acc += Math.pow((a[i] - m) / s, 4);
  return acc / n; // non-excess (normal = 3)
}
function lag1Autocorr(a) {
  const n = a.length; if (n < 2) return 0; const m = mean(a);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) den += (a[i] - m) * (a[i] - m);
  for (let i = 1; i < n; i++) num += (a[i] - m) * (a[i - 1] - m);
  return den === 0 ? 0 : num / den;
}

// ---------- normal / t ----------
function normCdf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}
function normInv(p) {
  if (p <= 0) return -Infinity; if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl; let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p <= ph) { q = p - 0.5; r = q * q; return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}
function tQuantile975(df) {
  const z = 1.959963985; // normInv(0.975)
  if (!Number.isFinite(df) || df > 1e6) return z;
  const z3 = z * z * z, z5 = z3 * z * z;
  return z + (z3 + z) / (4 * df) + (5 * z5 + 16 * z3 + 3 * z) / (96 * df * df)
    + (3 * z5 * z * z + 19 * z5 + 17 * z3 - 15 * z) / (384 * df * df * df);
}
function quantileSorted(sorted, q) {
  const pos = (sorted.length - 1) * q, base = Math.floor(pos), rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

// ---------- 3b: effective sample size under AR(1) ----------
function effectiveN(series) {
  const n = series.length;
  if (n < 3) return n;
  let rho = lag1Autocorr(series);
  rho = Math.max(0, Math.min(0.99, rho));
  return n * (1 - rho) / (1 + rho);
}

/**
 * 3a: 95% CI for the mean of `series` via the edge-corrected stationary bootstrap.
 * @param {number[]} series per-trade pnl_pct
 * @param {number} B resamples (default 5000)
 * @param {() => number} rng uniform [0,1) generator (default Math.random)
 * @returns {[number, number]} [ci_low, ci_high]
 */
function stationaryBootstrapCI(series, B, rng) {
  B = B || 5000; rng = rng || Math.random;
  const n = series.length;
  if (n < 2) return [series[0] ?? null, series[0] ?? null];
  const expBlock = Math.max(2, Math.round(Math.sqrt(n)));
  const p = 1 / expBlock;
  let m = 0; for (let i = 0; i < n; i++) m += series[i]; m /= n;
  const means = new Float64Array(B);
  for (let b = 0; b < B; b++) {
    let sum = 0, idx = (rng() * n) | 0;
    for (let i = 0; i < n; i++) {
      sum += series[idx];
      if (rng() < p) idx = (rng() * n) | 0; else { idx++; if (idx >= n) idx = 0; }
    }
    means[b] = sum / n;
  }
  let mb = 0; for (let i = 0; i < B; i++) mb += means[i]; mb /= B;
  let v = 0; for (let i = 0; i < B; i++) { const dd = means[i] - mb; v += dd * dd; } v /= (B - 1);
  const seLR = Math.sqrt(v) / (1 - EDGE_K / Math.sqrt(n)); // edge-corrected long-run SE
  const df = Math.max(1, effectiveN(series) - 1);
  const t = tQuantile975(df);
  return [m - t * seLR, m + t * seLR];
}

// ---------- 3d: Sharpe + Deflated Sharpe Ratio ----------
function sharpe(returns) { const s = stddev(returns); return s === 0 ? 0 : mean(returns) / s; }
/**
 * Deflated Sharpe Ratio (Bailey & López de Prado 2014).
 * @param {number[]} returns daily-bucketed pnl_pct
 * @param {number} nTrials number of strategies tested (multiple-testing correction)
 * @param {number} varSRacrossTrials variance of the Sharpe estimates across trials
 */
function deflatedSharpe(returns, nTrials, varSRacrossTrials) {
  const T = returns.length;
  if (T < 3) return { sharpe: 0, sr0: 0, dsr: null, dsr_pvalue: null };
  const sr = sharpe(returns);
  const g = skewness(returns), k = kurtosis(returns);
  const EM = 0.5772156649015329; // Euler-Mascheroni
  const N = Math.max(2, nTrials);
  const sr0 = Math.sqrt(Math.max(varSRacrossTrials, 1e-12)) *
    ((1 - EM) * normInv(1 - 1 / N) + EM * normInv(1 - 1 / (N * Math.E)));
  const denom = Math.sqrt(Math.max(1 - g * sr + ((k - 1) / 4) * sr * sr, 1e-9));
  const dsr = normCdf((sr - sr0) * Math.sqrt(Math.max(T - 1, 1)) / denom);
  return { sharpe: sr, sr0, dsr, dsr_pvalue: 1 - dsr };
}

module.exports = {
  EDGE_K, mean, stddev, skewness, kurtosis, lag1Autocorr,
  normCdf, normInv, tQuantile975, quantileSorted,
  effectiveN, stationaryBootstrapCI, sharpe, deflatedSharpe,
};
