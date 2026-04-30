/**
 * Crypto Confidence Cap (Anti-FOMO) Tests
 *
 * Tests the upper-bound on committee confidence in isCryptoEntryQualified.
 *
 * Background: scripts/analyze-committee-threshold.js (run 2026-04-30 over 58
 * trades) showed confidence > 0.45 lost ~100% of the time at ~-5%/trade,
 * while 0.40-0.45 won 57.7% at +0.45%. The three committee components
 * (orderFlow, displacement, fvgCount) anti-predict outcomes — they fire
 * AFTER moves are exhausted, making high confidence a FOMO signal.
 *
 * Covers Rule 2 categories: normal, boundary, malformed, adversarial, regression.
 */

// Recreate the cap logic in testable form (bot.js is a monolith, not importable)
function createConfidenceGate(config = {}) {
  const enabled = config.enabled === true;
  const rawCap = config.cap;
  const cap = (Number.isFinite(rawCap) && rawCap > 0 && rawCap < 1) ? rawCap : 0.45;

  function evaluate(conf, lowerThreshold = 0.40) {
    const reasons = [];
    if (conf < lowerThreshold) {
      reasons.push(`confidence ${conf.toFixed(2)} < ${lowerThreshold.toFixed(3)} (delta -${(lowerThreshold - conf).toFixed(3)})`);
    }
    if (enabled && conf > cap) {
      reasons.push(`confidence ${conf.toFixed(2)} > cap ${cap.toFixed(2)} (delta +${(conf - cap).toFixed(3)}, anti-FOMO)`);
    }
    return { passed: reasons.length === 0, reasons, capUsed: cap, capEnabled: enabled };
  }

  return { evaluate, cap, enabled };
}

describe('Crypto Confidence Cap (Anti-FOMO)', () => {
  // ── Normal cases ──────────────────────────────────────────────────────────
  describe('normal cases', () => {
    it('passes when cap is disabled, even at very high confidence', () => {
      const gate = createConfidenceGate({ enabled: false });
      const r = gate.evaluate(0.85);
      expect(r.passed).toBe(true);
      expect(r.reasons).toEqual([]);
    });

    it('passes when cap is enabled and conf is in the sweet spot', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.42);
      expect(r.passed).toBe(true);
      expect(r.reasons).toEqual([]);
    });

    it('rejects when cap is enabled and conf is above cap', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.55);
      expect(r.passed).toBe(false);
      expect(r.reasons).toHaveLength(1);
      expect(r.reasons[0]).toMatch(/anti-FOMO/);
      expect(r.reasons[0]).toMatch(/0\.55/);
      expect(r.reasons[0]).toMatch(/cap 0\.45/);
    });
  });

  // ── Boundary cases ────────────────────────────────────────────────────────
  describe('boundary cases', () => {
    it('passes at exactly the cap (cap is exclusive >, not >=)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.45);
      expect(r.passed).toBe(true);
    });

    it('rejects just above the cap (0.451)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.451);
      expect(r.passed).toBe(false);
      expect(r.reasons[0]).toMatch(/anti-FOMO/);
    });

    it('passes just below the cap (0.449)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.449);
      expect(r.passed).toBe(true);
    });

    it('reports both lower-threshold and cap when conf fails both (impossible but proves logic is independent)', () => {
      // This shouldn't happen in practice (lower=0.40, cap=0.45, conf can't be < 0.40 AND > 0.45)
      // But: if the operator misconfigures lower=0.50 and cap=0.45, both reasons should fire for conf=0.47
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.47, 0.50);
      expect(r.passed).toBe(false);
      expect(r.reasons).toHaveLength(2);
      expect(r.reasons[0]).toMatch(/< 0\.500/);
      expect(r.reasons[1]).toMatch(/cap 0\.45/);
    });
  });

  // ── Custom cap values ─────────────────────────────────────────────────────
  describe('custom cap values', () => {
    it('respects a custom cap of 0.50', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.50 });
      expect(gate.evaluate(0.48).passed).toBe(true);
      expect(gate.evaluate(0.51).passed).toBe(false);
    });

    it('respects a tight custom cap of 0.42', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.42 });
      expect(gate.evaluate(0.41).passed).toBe(true);
      expect(gate.evaluate(0.43).passed).toBe(false);
    });
  });

  // ── Malformed cases ──────────────────────────────────────────────────────
  describe('malformed cases — env-var parse failures', () => {
    it('falls back to 0.45 when cap is NaN (e.g. CRYPTO_CONFIDENCE_CAP_VALUE=abc)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: NaN });
      expect(gate.cap).toBe(0.45);
      expect(gate.evaluate(0.50).passed).toBe(false);
    });

    it('falls back to 0.45 when cap is undefined (env var missing)', () => {
      const gate = createConfidenceGate({ enabled: true });
      expect(gate.cap).toBe(0.45);
    });

    it('falls back to 0.45 when cap is 0 (parseFloat of empty string)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0 });
      expect(gate.cap).toBe(0.45);
    });

    it('falls back to 0.45 when cap is negative', () => {
      const gate = createConfidenceGate({ enabled: true, cap: -0.5 });
      expect(gate.cap).toBe(0.45);
    });

    it('falls back to 0.45 when cap is >= 1 (would block everything)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 1.5 });
      expect(gate.cap).toBe(0.45);
    });
  });

  // ── Adversarial cases ────────────────────────────────────────────────────
  describe('adversarial cases', () => {
    it('handles conf=0 (committee returned no signal)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0);
      expect(r.passed).toBe(false);
      expect(r.reasons[0]).toMatch(/< 0\.400/);
    });

    it('handles conf=1.0 (perfect agreement — should still be rejected by cap)', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(1.0);
      expect(r.passed).toBe(false);
      expect(r.reasons[0]).toMatch(/anti-FOMO/);
    });

    it('flag-disabled mode never blocks even at conf=1.0', () => {
      const gate = createConfidenceGate({ enabled: false, cap: 0.45 });
      expect(gate.evaluate(1.0).passed).toBe(true);
    });
  });

  // ── Regression cases ─────────────────────────────────────────────────────
  describe('regression: empirical loss-zone trades', () => {
    // From scripts/analyze-committee-threshold.js bucket data
    const lossZoneTrades = [
      { conf: 0.467, label: 'median historical' },
      { conf: 0.481, label: 'mean historical' },
      { conf: 0.50,  label: 'tier 0.50-0.55 entry (0% WR)' },
      { conf: 0.55,  label: 'tier 0.55-0.60 entry (28.6% WR)' },
      { conf: 0.60,  label: 'tier ≥0.60 entry (0% WR, 2 samples)' },
      { conf: 0.652, label: 'historical max' }
    ];
    const profitableZoneTrades = [
      { conf: 0.401, label: 'just above floor' },
      { conf: 0.42,  label: 'sweet spot mid' },
      { conf: 0.449, label: 'top of profitable bucket' }
    ];

    it.each(lossZoneTrades)('blocks $label (conf=$conf) when cap enabled', ({ conf }) => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      expect(gate.evaluate(conf).passed).toBe(false);
    });

    it.each(profitableZoneTrades)('allows $label (conf=$conf) when cap enabled', ({ conf }) => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      expect(gate.evaluate(conf).passed).toBe(true);
    });
  });

  // ── Observability (Rule 8: rejected signals must log how close they were) ─
  describe('observability — Rule 8 compliance', () => {
    it('reports delta-from-cap in rejection reason for ops to triage', () => {
      const gate = createConfidenceGate({ enabled: true, cap: 0.45 });
      const r = gate.evaluate(0.52);
      expect(r.reasons[0]).toMatch(/delta \+0\.070/);
    });

    it('reports delta-from-floor in lower-bound rejection reason', () => {
      const gate = createConfidenceGate({ enabled: false });
      const r = gate.evaluate(0.32, 0.40);
      expect(r.reasons[0]).toMatch(/delta -0\.080/);
    });
  });
});
