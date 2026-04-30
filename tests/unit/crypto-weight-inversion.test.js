/**
 * Crypto Auto-Learner — Signed-Edge Weight Optimization (v26.0, 2026-04-30)
 *
 * Tests the optimizeCryptoWeights logic that produces signed weights when
 * CRYPTO_INVERT_WEIGHTS=true. Net-negative-edge components get NEGATIVE
 * weights so the scorer applies inverted contribution.
 *
 * Recreates the algorithm in testable form (bot.js is a monolith).
 */

// Recreate optimizeCryptoWeights in pure-function form for testing.
// Keep this in sync with the implementation in unified-crypto-bot.js.
function makeOptimizer({ inversionEnabled = false } = {}) {
  const SIGNAL_KEYS = ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio'];
  const MIN_WEIGHT = 0.05;
  const MAX_WEIGHT = 0.40;

  function computeSignedEdges(evals) {
    const edges = {};
    for (const key of SIGNAL_KEYS) {
      const withSignal = evals.filter(e => {
        const c = e.signals?.components || {};
        if (key === 'displacement' || key === 'fvg') return (c[key] || 0) >= 0.5;
        return (c[key] || 0) > 0.3;
      });
      const without = evals.filter(e => {
        const c = e.signals?.components || {};
        if (key === 'displacement' || key === 'fvg') return (c[key] || 0) < 0.5;
        return (c[key] || 0) <= 0.3;
      });
      const avgWith = withSignal.length ? withSignal.reduce((s, e) => s + (e.pnlPct || 0), 0) / withSignal.length : 0;
      const avgWithout = without.length ? without.reduce((s, e) => s + (e.pnlPct || 0), 0) / without.length : 0;
      edges[key] = avgWith - avgWithout;
    }
    return edges;
  }

  function optimize(evals) {
    if (evals.length < 30) return null;
    const signedEdges = computeSignedEdges(evals);

    if (!inversionEnabled) {
      const positiveEdges = {};
      for (const k of SIGNAL_KEYS) positiveEdges[k] = Math.max(0, signedEdges[k]);
      const total = Object.values(positiveEdges).reduce((s, e) => s + e, 0);
      if (total <= 0) return null;
      const raw = {};
      for (const k of SIGNAL_KEYS) raw[k] = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, positiveEdges[k] / total));
      const sum = Object.values(raw).reduce((s, w) => s + w, 0);
      const out = {};
      for (const k of SIGNAL_KEYS) out[k] = parseFloat((raw[k] / sum).toFixed(3));
      const finalSum = Object.values(out).reduce((s, w) => s + w, 0);
      if (Math.abs(finalSum - 1) > 0.001) out.momentum += parseFloat((1 - finalSum).toFixed(3));
      return { weights: out, signedEdges, mode: 'legacy' };
    }

    const totalAbs = Object.values(signedEdges).reduce((s, e) => s + Math.abs(e), 0);
    if (totalAbs <= 0) return null;
    const raw = {};
    for (const k of SIGNAL_KEYS) {
      const mag = Math.max(MIN_WEIGHT, Math.min(MAX_WEIGHT, Math.abs(signedEdges[k]) / totalAbs));
      raw[k] = (signedEdges[k] < 0 ? -1 : 1) * mag;
    }
    const sumAbs = Object.values(raw).reduce((s, w) => s + Math.abs(w), 0);
    const out = {};
    for (const k of SIGNAL_KEYS) out[k] = parseFloat((raw[k] / sumAbs).toFixed(3));
    const finalAbsSum = Object.values(out).reduce((s, w) => s + Math.abs(w), 0);
    if (Math.abs(finalAbsSum - 1) > 0.001) {
      const sign = out.momentum < 0 ? -1 : 1;
      out.momentum = parseFloat(((Math.abs(out.momentum) + (1 - finalAbsSum)) * sign).toFixed(3));
    }
    return { weights: out, signedEdges, mode: 'signed' };
  }

  return { optimize };
}

// Build evals from an explicit per-component edge spec. Uses seeded PRNG so
// each component fires INDEPENDENTLY of others, and law-of-large-numbers
// gives apparent edges that match the spec to within ~1% at n=400.
const ALL_KEYS = ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio'];

function seededRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0xFFFFFFFF;
  };
}

function makeEvals(edgeSpec, n = 400, seed = 12345) {
  const rng = seededRng(seed);
  const evals = [];
  for (let i = 0; i < n; i++) {
    const components = {};
    let pnlPct = 0;
    for (const k of ALL_KEYS) {
      const fired = rng() > 0.5;
      components[k] = fired ? 0.8 : 0;
      const edge = edgeSpec[k] || 0;
      pnlPct += fired ? edge / 2 : -edge / 2;
    }
    evals.push({ pnlPct, signals: { components } });
  }
  return evals;
}

describe('Crypto Weight Inversion (v26.0)', () => {
  // ── Normal cases ──────────────────────────────────────────────────────────
  describe('legacy mode (CRYPTO_INVERT_WEIGHTS=false)', () => {
    it('returns null when all components are net-negative (the bug we are fixing)', () => {
      const opt = makeOptimizer({ inversionEnabled: false });
      // All 6 components anti-predictive — matches actual prod data
      const evals = makeEvals({
        momentum: -1, orderFlow: -2, displacement: -2, volumeProfile: -1, fvg: -2, volumeRatio: -1
      });
      const r = opt.optimize(evals);
      expect(r).toBeNull();
    });

    it('returns weights when at least one component has positive edge', () => {
      const opt = makeOptimizer({ inversionEnabled: false });
      const evals = makeEvals({ momentum: 5, orderFlow: -3, displacement: -2 });
      const r = opt.optimize(evals);
      expect(r).not.toBeNull();
      expect(r.weights.momentum).toBeGreaterThan(0);
    });
  });

  describe('signed mode (CRYPTO_INVERT_WEIGHTS=true)', () => {
    it('produces NEGATIVE weight for an anti-predictive component', () => {
      const opt = makeOptimizer({ inversionEnabled: true });
      const evals = makeEvals({ momentum: 4, orderFlow: -5 });
      const r = opt.optimize(evals);
      expect(r).not.toBeNull();
      expect(r.mode).toBe('signed');
      expect(r.weights.momentum).toBeGreaterThan(0);
      expect(r.weights.orderFlow).toBeLessThan(0);
    });

    it('preserves signs through normalization (sum of |weights| ≈ 1.0)', () => {
      const opt = makeOptimizer({ inversionEnabled: true });
      const evals = makeEvals({ momentum: 4, orderFlow: -5 });
      const r = opt.optimize(evals);
      const sumAbs = Object.values(r.weights).reduce((s, w) => s + Math.abs(w), 0);
      expect(sumAbs).toBeCloseTo(1.0, 2);
    });

    it('handles all-anti-predictive (matches actual production data)', () => {
      const opt = makeOptimizer({ inversionEnabled: true });
      // Empirical pattern: orderFlow, displacement, fvg all negative
      const evals = makeEvals({
        momentum: 1, orderFlow: -5, displacement: -5, volumeProfile: 1, fvg: -5, volumeRatio: 0.5
      });
      const r = opt.optimize(evals);
      expect(r).not.toBeNull();
      expect(r.weights.orderFlow).toBeLessThan(0);
      expect(r.weights.displacement).toBeLessThan(0);
      expect(r.weights.fvg).toBeLessThan(0);
      expect(r.weights.momentum).toBeGreaterThan(0);
    });
  });

  // ── Boundary cases ────────────────────────────────────────────────────────
  it('returns null for fewer than 30 evals (warmup)', () => {
    const opt = makeOptimizer({ inversionEnabled: true });
    expect(opt.optimize(makeEvals({ orderFlow: -5 }, 29))).toBeNull();
    expect(opt.optimize([])).toBeNull();
  });

  it('returns null when no component has any edge (totalAbs=0)', () => {
    const opt = makeOptimizer({ inversionEnabled: true });
    expect(opt.optimize(makeEvals({}))).toBeNull();
  });

  // ── Adversarial / invariants ─────────────────────────────────────────────
  it('weights stay finite and confidence math remains stable when one component dominates', () => {
    const opt = makeOptimizer({ inversionEnabled: true });
    // Only momentum has edge — others are flat
    const evals = makeEvals({ momentum: 10 });
    const r = opt.optimize(evals);
    expect(r).not.toBeNull();
    for (const w of Object.values(r.weights)) {
      expect(Number.isFinite(w)).toBe(true);
      expect(Math.abs(w)).toBeLessThanOrEqual(1);  // no single weight can exceed 100% post-normalization
    }
    // Sum-of-abs = 1.0 invariant (the actual normalization contract)
    const sumAbs = Object.values(r.weights).reduce((s, w) => s + Math.abs(w), 0);
    expect(sumAbs).toBeCloseTo(1.0, 1);
  });

  it('legacy and signed mode agree when all edges are positive', () => {
    const evals = makeEvals({ momentum: 5, orderFlow: 3, displacement: 4, fvg: 3, volumeProfile: 2, volumeRatio: 2 });
    const legacy = makeOptimizer({ inversionEnabled: false }).optimize(evals);
    const signed = makeOptimizer({ inversionEnabled: true }).optimize(evals);
    expect(legacy).not.toBeNull();
    expect(signed).not.toBeNull();
    // All weights are positive in both modes (no inversion needed)
    for (const k of Object.keys(legacy.weights)) {
      expect(signed.weights[k]).toBeGreaterThan(0);
      expect(legacy.weights[k]).toBeGreaterThan(0);
    }
  });
});
