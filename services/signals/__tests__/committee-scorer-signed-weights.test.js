/**
 * Committee Scorer — Signed Weights (v26.0, 2026-04-30)
 *
 * Tests negative-weight handling: when a component has negative weight, its
 * contribution is inverted ((1 - score) * |weight|). Used when the auto-learner
 * detects an anti-predictive component and wants to flip its contribution.
 *
 * Math invariant: confidence stays in [0, 1] regardless of sign mix.
 */
const { computeCommitteeScore, BOT_COMPONENTS } = require('../committee-scorer');

describe('committee-scorer — signed weights (v26.0)', () => {
  // Backward-compat path: pre-normalized signals + config object
  const signals = {
    momentum:      { score: 0.8 },
    orderFlow:     { score: 0.6 },
    displacement:  { score: 1.0 },
    volumeProfile: { score: 0.4 },
    fvg:           { score: 0.3 },
    volumeRatio:   { score: 0.7 }
  };

  // ── Equivalence: positive weights produce same result as before ───────────
  it('positive-only weights produce identical math to legacy behavior', () => {
    const config = {
      ...BOT_COMPONENTS.crypto,
      _customWeights: {
        momentum: 0.20, orderFlow: 0.16, displacement: 0.12,
        volumeProfile: 0.13, fvg: 0.10, volumeRatio: 0.05,
        sentiment: 0.07, crossAsset: 0.07, mlScore: 0.10
      }
    };
    const result = computeCommitteeScore(signals, config);
    // Manual: weighted sum of present components / sum of present weights
    // Present = momentum, orderFlow, displacement, volumeProfile, fvg, volumeRatio
    // ws = 0.8*0.20 + 0.6*0.16 + 1.0*0.12 + 0.4*0.13 + 0.3*0.10 + 0.7*0.05
    //    = 0.16 + 0.096 + 0.12 + 0.052 + 0.03 + 0.035 = 0.493
    // tw = 0.20+0.16+0.12+0.13+0.10+0.05 = 0.76
    // confidence = 0.493 / 0.76 ≈ 0.6487
    expect(result.confidence).toBeCloseTo(0.649, 2);
  });

  // ── Inversion math: single negative-weighted component ────────────────────
  it('a single negative-weighted component inverts its contribution', () => {
    // Two-component artificial scorer: momentum positive, orderFlow inverted
    const config = {
      components: ['momentum', 'orderFlow'],
      _customWeights: { momentum: 0.5, orderFlow: -0.5 } // |total| = 1.0
    };
    const sigs = { momentum: { score: 0.8 }, orderFlow: { score: 0.6 } };
    // Math:
    //   momentum:   0.8 * 0.5 = 0.40
    //   orderFlow:  (1 - 0.6) * 0.5 = 0.20  (inverted: high score → low contribution)
    //   weightedSum = 0.60
    //   totalWeight = 0.5 + 0.5 = 1.0
    //   confidence = 0.60 / 1.0 = 0.60
    const r = computeCommitteeScore(sigs, config);
    expect(r.confidence).toBeCloseTo(0.60, 3);
  });

  it('inverted component with score=1.0 contributes 0 (max anti-evidence)', () => {
    const config = {
      components: ['momentum', 'orderFlow'],
      _customWeights: { momentum: 0.5, orderFlow: -0.5 }
    };
    const sigs = { momentum: { score: 1.0 }, orderFlow: { score: 1.0 } };
    // momentum: 1.0 * 0.5 = 0.5
    // orderFlow inverted: (1 - 1.0) * 0.5 = 0
    // confidence = 0.5 / 1.0 = 0.5
    const r = computeCommitteeScore(sigs, config);
    expect(r.confidence).toBeCloseTo(0.5, 3);
  });

  it('inverted component with score=0 contributes its full magnitude', () => {
    const config = {
      components: ['momentum', 'orderFlow'],
      _customWeights: { momentum: 0.5, orderFlow: -0.5 }
    };
    const sigs = { momentum: { score: 0 }, orderFlow: { score: 0 } };
    // momentum: 0 * 0.5 = 0
    // orderFlow inverted: (1 - 0) * 0.5 = 0.5
    // confidence = 0.5 / 1.0 = 0.5
    const r = computeCommitteeScore(sigs, config);
    expect(r.confidence).toBeCloseTo(0.5, 3);
  });

  // ── Three anti-predictive components (matches empirical crypto data) ─────
  it('with all 3 anti-predictive components inverted, confidence drops when they fire', () => {
    // Based on actual crypto data: orderFlow, displacement, fvg are anti-predictive
    const baseConfig = {
      components: ['momentum', 'orderFlow', 'displacement', 'fvg'],
      _customWeights: { momentum: 0.4, orderFlow: -0.2, displacement: -0.2, fvg: -0.2 }
    };

    // Scenario A: all 3 anti-predictive components fire HIGH (FOMO entry)
    const fomoSignals = {
      momentum: { score: 0.5 },
      orderFlow: { score: 1.0 },
      displacement: { score: 1.0 },
      fvg: { score: 1.0 }
    };
    // momentum: 0.5 * 0.4 = 0.20
    // orderFlow inv: 0 * 0.2 = 0
    // displacement inv: 0 * 0.2 = 0
    // fvg inv: 0 * 0.2 = 0
    // confidence = 0.20 / 1.0 = 0.20  (LOW — correctly identifies FOMO as bad)
    const fomo = computeCommitteeScore(fomoSignals, baseConfig);
    expect(fomo.confidence).toBeCloseTo(0.20, 3);

    // Scenario B: anti-predictive components are quiet (clean setup)
    const cleanSignals = {
      momentum: { score: 0.5 },
      orderFlow: { score: 0.0 },
      displacement: { score: 0.0 },
      fvg: { score: 0.0 }
    };
    // momentum: 0.5 * 0.4 = 0.20
    // orderFlow inv: 1 * 0.2 = 0.20
    // displacement inv: 1 * 0.2 = 0.20
    // fvg inv: 1 * 0.2 = 0.20
    // confidence = 0.80 / 1.0 = 0.80  (HIGH — correctly identifies clean setup)
    const clean = computeCommitteeScore(cleanSignals, baseConfig);
    expect(clean.confidence).toBeCloseTo(0.80, 3);

    // Inversion has done its job: clean setup scores higher than FOMO setup
    expect(clean.confidence).toBeGreaterThan(fomo.confidence);
  });

  // ── Boundary: confidence stays in [0, 1] ──────────────────────────────────
  it('confidence is bounded in [0, 1] for any score × sign combination', () => {
    const config = {
      components: ['a', 'b', 'c'],
      _customWeights: { a: 0.3, b: -0.3, c: 0.4 }
    };
    for (const aScore of [0, 0.5, 1.0]) {
      for (const bScore of [0, 0.5, 1.0]) {
        for (const cScore of [0, 0.5, 1.0]) {
          const r = computeCommitteeScore(
            { a: { score: aScore }, b: { score: bScore }, c: { score: cScore } },
            config
          );
          expect(r.confidence).toBeGreaterThanOrEqual(0);
          expect(r.confidence).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  // ── Adversarial: all-zero weights ────────────────────────────────────────
  it('handles all-zero weights gracefully (returns 0 confidence)', () => {
    const config = {
      components: ['momentum', 'orderFlow'],
      _customWeights: { momentum: 0, orderFlow: 0 }
    };
    const r = computeCommitteeScore(
      { momentum: { score: 0.8 }, orderFlow: { score: 0.6 } },
      config
    );
    expect(r.confidence).toBe(0);
  });

  it('handles all-negative weights — components still contribute via inversion', () => {
    const config = {
      components: ['a', 'b'],
      _customWeights: { a: -0.5, b: -0.5 }
    };
    // Both inverted, both score 1.0 → both contribute (1-1)*0.5 = 0
    const r1 = computeCommitteeScore({ a: { score: 1.0 }, b: { score: 1.0 } }, config);
    expect(r1.confidence).toBeCloseTo(0, 3);
    // Both inverted, both score 0 → both contribute (1-0)*0.5 = 0.5
    const r2 = computeCommitteeScore({ a: { score: 0 }, b: { score: 0 } }, config);
    expect(r2.confidence).toBeCloseTo(1, 3);
  });

  // ── Regression: mlScore + crossAsset still skip when not present ─────────
  it('absent components are skipped regardless of weight sign', () => {
    const config = {
      components: ['momentum', 'orderFlow', 'mlScore'],
      _customWeights: { momentum: 0.4, orderFlow: -0.4, mlScore: -0.2 }
    };
    // Backward-compat extractor only marks `present: true` when score is a number.
    // For this test, mlScore key absent from sigs → present: false → skipped
    const sigs = { momentum: { score: 0.5 }, orderFlow: { score: 0.5 } };
    const r = computeCommitteeScore(sigs, config);
    expect(r.presentCount).toBe(2);
    // momentum: 0.5 * 0.4 = 0.20
    // orderFlow inv: 0.5 * 0.4 = 0.20
    // total weight = 0.4 + 0.4 = 0.8 (mlScore skipped)
    // confidence = 0.40 / 0.80 = 0.50
    expect(r.confidence).toBeCloseTo(0.5, 3);
  });
});
