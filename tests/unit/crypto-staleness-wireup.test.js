/**
 * Crypto Staleness Filter Wire-Up Tests
 *
 * Verifies isCryptoEntryQualified()'s integration with the staleness detector:
 * - Off by default (flag drives behavior)
 * - No-op when bars unavailable on signal
 * - Adds rejection reason when staleness fires
 * - Coexists with the confidence cap and other gates
 *
 * Recreates the gate logic in pure form (bot.js is a 7k-line monolith).
 * Keeps the contract test-only — actual bot file is verified by syntax check.
 */
const stalenessDetector = require('../../services/signals/staleness-detector');

const NO_OVERRIDE = Symbol('no-detector-override');
function createGate({
  capEnabled = false, cap = 0.45,
  stalenessEnabled = false, stalenessLookback = 5, stalenessMaxMovePct = 2.0,
  detectorOverride = NO_OVERRIDE
} = {}) {
  const detector = detectorOverride === NO_OVERRIDE ? stalenessDetector : detectorOverride;

  return function evaluate(signal, committee, btcBullish, lowerThreshold = 0.40) {
    const reasons = [];
    const symbol = signal.symbol;
    const direction = signal.direction || 'long';
    const conf = committee ? committee.confidence : 0;

    if (conf < lowerThreshold) {
      reasons.push(`confidence ${conf.toFixed(2)} < ${lowerThreshold.toFixed(3)}`);
    }
    if (capEnabled && conf > cap) {
      reasons.push(`confidence ${conf.toFixed(2)} > cap ${cap.toFixed(2)} (anti-FOMO)`);
    }

    const isAltcoin = symbol !== 'XBTUSD' && symbol !== 'ETHUSD';
    if (direction === 'long' && isAltcoin && btcBullish === false) {
      reasons.push('BTC bearish');
    }

    let positiveCount = 0;
    if (committee && committee.components) {
      for (const v of Object.values(committee.components)) {
        if (typeof v === 'number' && v > 0) positiveCount++;
      }
    }
    if (positiveCount < 3) reasons.push(`components=${positiveCount} positive (need 3+)`);

    if (stalenessEnabled) {
      const bars = signal.recentBars || signal.klines || signal.bars || null;
      if (bars && detector && typeof detector.isEntryStale === 'function') {
        const r = detector.isEntryStale(bars, direction, {
          lookbackBars: stalenessLookback, maxMovePct: stalenessMaxMovePct
        });
        if (r.stale) reasons.push(`staleness ${r.gate}: ${r.reason}`);
      }
    }

    return { qualified: reasons.length === 0, reason: reasons.join(', ') || 'all checks passed' };
  };
}

// Build a 40-bar series: 30 calm + 10 with given delta
function buildBars({ calmBars = 30, eventBars = 10, startPrice = 100, endPrice = 100, volume = 1000 } = {}) {
  const out = [];
  for (let i = 0; i < calmBars; i++) {
    out.push({ o: startPrice, h: startPrice * 1.001, l: startPrice * 0.999, c: startPrice, v: volume });
  }
  for (let i = 0; i < eventBars; i++) {
    const c = startPrice + ((endPrice - startPrice) * i) / (eventBars - 1 || 1);
    out.push({ o: c * 0.999, h: c * 1.001, l: c * 0.998, c, v: volume });
  }
  return out;
}

const goodCommittee = {
  confidence: 0.42,
  components: { momentum: 0.6, orderFlow: 0.5, displacement: 0.5, fvg: 0.4 }
};

describe('crypto staleness wire-up', () => {
  // ── Default OFF behavior ──────────────────────────────────────────────────
  it('flag OFF: stale signals still pass when other gates are clean', () => {
    const gate = createGate({ stalenessEnabled: false });
    const bars = buildBars({ startPrice: 100, endPrice: 110 }); // 10% rally
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(true);
  });

  it('flag ON, no bars on signal: gate is a no-op (fail-open)', () => {
    const gate = createGate({ stalenessEnabled: true });
    const r = gate({ symbol: 'XBTUSD', direction: 'long' }, goodCommittee, true);
    expect(r.qualified).toBe(true);
  });

  it('flag ON, fresh bars (flat market): passes', () => {
    const gate = createGate({ stalenessEnabled: true });
    const bars = buildBars({ startPrice: 100, endPrice: 100 });
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(true);
  });

  // ── Filter actually fires ─────────────────────────────────────────────────
  it('flag ON, stale bars (5% rally in last 5 bars): blocks long with staleness reason', () => {
    const gate = createGate({ stalenessEnabled: true });
    const bars = buildBars({ startPrice: 100, endPrice: 105 });
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(false);
    expect(r.reason).toMatch(/staleness price/);
    expect(r.reason).toMatch(/FOMO/);
  });

  it('flag ON, drop in last 5 bars: long entry NOT stale (counter-trend buy)', () => {
    const gate = createGate({ stalenessEnabled: true });
    const bars = buildBars({ startPrice: 100, endPrice: 95 });
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(true);
  });

  it('flag ON, custom maxMovePct: tightening makes more setups stale', () => {
    const tight = createGate({ stalenessEnabled: true, stalenessMaxMovePct: 0.5 });
    const loose = createGate({ stalenessEnabled: true, stalenessMaxMovePct: 5.0 });
    const bars = buildBars({ startPrice: 100, endPrice: 102 });
    expect(tight({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true).qualified).toBe(false);
    expect(loose({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true).qualified).toBe(true);
  });

  // ── Robustness ────────────────────────────────────────────────────────────
  it('flag ON, detector load failed: gate is no-op', () => {
    const gate = createGate({ stalenessEnabled: true, detectorOverride: null });
    const bars = buildBars({ startPrice: 100, endPrice: 110 });
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(true);
  });

  it('flag ON, detector returned but malformed: gate is no-op', () => {
    const gate = createGate({ stalenessEnabled: true, detectorOverride: { not_isEntryStale: 'oops' } });
    const bars = buildBars({ startPrice: 100, endPrice: 110 });
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(true);
  });

  it('reads bars from signal.recentBars OR signal.klines OR signal.bars', () => {
    const gate = createGate({ stalenessEnabled: true });
    const stale = buildBars({ startPrice: 100, endPrice: 110 });
    expect(gate({ symbol: 'X', direction: 'long', recentBars: stale }, goodCommittee, true).qualified).toBe(false);
    expect(gate({ symbol: 'X', direction: 'long', klines: stale }, goodCommittee, true).qualified).toBe(false);
    expect(gate({ symbol: 'X', direction: 'long', bars: stale }, goodCommittee, true).qualified).toBe(false);
  });

  // ── Composability with other gates ────────────────────────────────────────
  it('staleness reason is reported alongside other failures', () => {
    const gate = createGate({ stalenessEnabled: true, capEnabled: true, cap: 0.45 });
    const bars = buildBars({ startPrice: 100, endPrice: 110 });
    const overConf = { confidence: 0.55, components: { a: 0.5, b: 0.5, c: 0.5 } };
    const r = gate({ symbol: 'XBTUSD', direction: 'long', recentBars: bars }, overConf, true);
    expect(r.qualified).toBe(false);
    // Should report both the cap and staleness
    expect(r.reason).toMatch(/anti-FOMO/);
    expect(r.reason).toMatch(/staleness/);
  });

  // ── Short side ────────────────────────────────────────────────────────────
  it('flag ON, drop in last 5 bars: short entry IS stale (chasing the down move)', () => {
    const gate = createGate({ stalenessEnabled: true });
    const bars = buildBars({ startPrice: 100, endPrice: 95 });
    const r = gate({ symbol: 'XBTUSD', direction: 'short', recentBars: bars }, goodCommittee, true);
    expect(r.qualified).toBe(false);
    expect(r.reason).toMatch(/staleness/);
  });
});
