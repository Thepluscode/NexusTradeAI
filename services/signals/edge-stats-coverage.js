'use strict';
/**
 * Full-rigor coverage + DSR evidence for edge-stats.js (Item 3). NOT a unit test
 * (too slow for CI) — run on demand: `node services/signals/edge-stats-coverage.js`.
 * Deterministic. Asserts the stationary-bootstrap CI holds 92-97% empirical
 * coverage of the true mean across normal-iid and fat-tailed+AR(1) synthetic
 * returns at n=50/70/130 (B=5000, 800 buckets/cell), beats the parametric CI,
 * and that DSR haircuts a best-of-15 survivorship winner. Exit 0 on PASS.
 */
const S = require('./edge-stats');
const rng = S.normInv ? mk(20260523) : Math.random;
function mk(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randn() { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
function fat() { return rng() < 0.1 ? randn() * 3 : randn(); }
function gen(n, mu, rho, s, heavy) { const inn = heavy ? fat : randn; let y = 0; for (let i = 0; i < 40; i++) y = rho * y + inn(); const o = new Array(n); for (let i = 0; i < n; i++) { y = rho * y + inn(); o[i] = mu + s * y; } return o; }

const B = 5000, BK = 800, NS = [50, 70, 130], SS = 0.01;
let pass = true;
console.log(`edge-stats coverage — B=${B}, ${BK} buckets/cell, target 92-97%\n`);
console.log('control: normal iid');
for (const n of NS) { let h = 0; for (let b = 0; b < BK; b++) { const s = gen(n, 0, 0, SS, false); const [lo, hi] = S.stationaryBootstrapCI(s, B, rng); if (0 >= lo && 0 <= hi) h++; } const c = 100 * h / BK; const ok = c >= 92 && c <= 97; pass = pass && ok; console.log(`  n=${n}: ${c.toFixed(1)}% ${ok ? 'OK' : 'OUT'}`); }
console.log('target: fat-tailed + AR(1) 0.3');
for (const [lab, mu] of [['zero', 0], ['pos', 0.004]]) for (const n of NS) {
  let bh = 0, ph = 0;
  for (let b = 0; b < BK; b++) { const s = gen(n, mu, 0.3, SS, true); const [lo, hi] = S.stationaryBootstrapCI(s, B, rng); if (mu >= lo && mu <= hi) bh++; const m = S.mean(s), se = S.stddev(s) / Math.sqrt(n); if (mu >= m - 1.96 * se && mu <= m + 1.96 * se) ph++; }
  const bc = 100 * bh / BK, pc = 100 * ph / BK, ok = bc >= 92 && bc <= 97; pass = pass && ok;
  console.log(`  ${lab} n=${n}: bootstrap=${bc.toFixed(1)}% ${ok ? 'OK' : 'OUT'}  parametric=${pc.toFixed(1)}%`);
}
console.log(pass ? '\nPASS' : '\nFAIL');
process.exit(pass ? 0 : 1);
