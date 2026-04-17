const { computeCommitteeScore, BOT_COMPONENTS, EXTRACTORS } = require('../committee-scorer');

// ── Backward-compatible API (pre-normalized signals + config object) ─────────

describe('computeCommitteeScore (backward-compat API)', () => {
  const signals = {
    momentum: { score: 0.8 },
    orderFlow: { score: 0.6 },
    displacement: { score: 1.0 },
    volumeProfile: { score: 0.4 },
    fvg: { score: 0.3 },
    volumeRatio: { score: 0.7 }
  };

  test('computes weighted average confidence for stock bot', () => {
    const result = computeCommitteeScore(signals, BOT_COMPONENTS.stock);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.components).toHaveProperty('momentum');
    expect(result.presentCount).toBe(6);
  });

  test('computes weighted average confidence for crypto bot', () => {
    const result = computeCommitteeScore(signals, BOT_COMPONENTS.crypto);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test('forex bot uses trend+macd instead of momentum+volumeRatio', () => {
    const forexSignals = {
      trend: { score: 0.9 },
      orderFlow: { score: 0.6 },
      displacement: { score: 0.0 },
      volumeProfile: { score: 0.4 },
      fvg: { score: 0.0 },
      macd: { score: 0.7 }
    };
    const result = computeCommitteeScore(forexSignals, BOT_COMPONENTS.forex);
    expect(result.components).toHaveProperty('trend');
    expect(result.components).toHaveProperty('macd');
    expect(result.components).not.toHaveProperty('momentum');
  });

  test('uses custom weights when provided via _customWeights', () => {
    const customWeights = { momentum: 1.0, orderFlow: 0, displacement: 0, volumeProfile: 0, fvg: 0, volumeRatio: 0 };
    const config = { ...BOT_COMPONENTS.crypto, _customWeights: customWeights };
    const result = computeCommitteeScore(signals, config);
    expect(result.confidence).toBeCloseTo(0.8, 1);
  });

  test('regime-conditional weights override defaults', () => {
    const config = {
      ...BOT_COMPONENTS.crypto,
      regimeWeights: {
        trending: { momentum: 0.5, orderFlow: 0.1, displacement: 0.1, volumeProfile: 0.1, fvg: 0.1, volumeRatio: 0.1 }
      }
    };
    const result = computeCommitteeScore(signals, config, 'trending');
    expect(result.confidence).toBeDefined();
    expect(result.regime).toBe('trending');
  });

  test('missing signals are skipped (v22.0 dynamic weight)', () => {
    const partial = { momentum: { score: 0.8 } };
    const result = computeCommitteeScore(partial, BOT_COMPONENTS.crypto);
    expect(result.presentCount).toBe(1);
    expect(result.confidence).toBeCloseTo(0.8, 1);
  });
});

// ── New bot API (raw signal + bot type string) ───────────────────────────────

describe('computeCommitteeScore (new bot API)', () => {
  describe('stock bot', () => {
    test('scores a full stock signal with all components present', () => {
      const signal = {
        percentChange: 2.5,
        orderFlowImbalance: 0.7,
        hasDisplacement: true,
        volumeProfile: { vah: 110, val: 100 },
        price: 102,
        fvgCount: 2,
        volumeRatio: 2.1
      };
      const result = computeCommitteeScore(signal, 'stock');
      expect(result.presentCount).toBe(6);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.components.momentum).toBeCloseTo(0.25, 1);
      expect(result.components.orderFlow).toBeCloseTo(0.7, 1);
      // v24.0: graded — hasDisplacement=true without strength → fallback 0.7
      expect(result.components.displacement).toBeCloseTo(0.7, 1);
      // v24.0: graded — fvgCount=2 → min(2/3, 1.0) = 0.667
      expect(result.components.fvg).toBeCloseTo(0.667, 1);
    });

    test('absent signals are skipped, not penalized', () => {
      const signal = {
        percentChange: 5.0,
        volumeRatio: 2.0,
        price: 100
      };
      const result = computeCommitteeScore(signal, 'stock');
      expect(result.presentCount).toBe(2);
      expect(result.confidence).toBeGreaterThan(0.3);
      expect(result.components.orderFlow).toBe(0);
      expect(result.components.displacement).toBe(0);
    });

    test('supports custom weights from auto-learning', () => {
      const signal = { percentChange: 5.0, volumeRatio: 1.0, price: 100 };
      const customWeights = { momentum: 0.50, orderFlow: 0.10, displacement: 0.10, volumeProfile: 0.10, fvg: 0.10, volumeRatio: 0.10 };
      const result = computeCommitteeScore(signal, 'stock', { weights: customWeights });
      expect(result.confidence).toBeGreaterThan(0.3);
    });
  });

  describe('forex bot', () => {
    test('scores direction-aware forex signal', () => {
      const signal = {
        direction: 'long',
        h1Trend: 'up',
        orderFlowImbalance: 0.3,
        hasDisplacement: true,
        volumeProfile: { vah: 1.1050, val: 1.1000 },
        entry: 1.1010,
        fvgCount: 1,
        macdHistogram: 0.00005
      };
      const result = computeCommitteeScore(signal, 'forex');
      expect(result.presentCount).toBe(6);
      expect(result.components.trend).toBe(1.0);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    test('misaligned trend scores 0', () => {
      const signal = { direction: 'long', h1Trend: 'down', price: 1.1 };
      const result = computeCommitteeScore(signal, 'forex');
      expect(result.components.trend).toBe(0);
    });

    test('short direction reverses flow and VP scoring', () => {
      const signal = {
        direction: 'short',
        h1Trend: 'down',
        orderFlowImbalance: -0.4,
        volumeProfile: { vah: 1.1050, val: 1.1000 },
        entry: 1.1045,
        macdHistogram: -0.00005
      };
      const result = computeCommitteeScore(signal, 'forex');
      expect(result.components.trend).toBe(1.0);
      expect(result.components.volumeProfile).toBeGreaterThan(0.8);
      expect(result.components.orderFlow).toBeGreaterThan(0.8);
    });
  });

  describe('crypto bot', () => {
    test('scores crypto signal with tier-aware momentum', () => {
      const signal = {
        momentum: 1.5,
        tier: 'tier1',
        orderFlowImbalance: 0.5,
        hasDisplacement: false,
        volumeProfileData: { vah: 45000, val: 42000 },
        price: 42500,
        fvgCount: 0,
        volumeRatio: 1.5
      };
      const result = computeCommitteeScore(signal, 'crypto');
      expect(result.presentCount).toBe(4);
      expect(result.components.momentum).toBeCloseTo(0.75, 1);
    });

    test('tier3 uses 15% momentum cap', () => {
      const signal = { momentum: 7.5, tier: 'tier3', volumeRatio: 1.0, price: 100 };
      const result = computeCommitteeScore(signal, 'crypto');
      expect(result.components.momentum).toBeCloseTo(0.5, 1);
    });
  });
});

// ── Extractors ───────────────────────────────────────────────────────────────

describe('EXTRACTORS', () => {
  test('stock extractor handles missing fields gracefully', () => {
    const result = EXTRACTORS.stock({});
    expect(result.momentum.present).toBe(true);
    expect(result.momentum.score).toBe(0);
    expect(result.orderFlow.present).toBe(false);
    expect(result.displacement.present).toBe(false);
    expect(result.volumeProfile.present).toBe(false);
    expect(result.fvg.present).toBe(false);
    expect(result.volumeRatio.present).toBe(true);
  });

  test('forex extractor handles missing direction gracefully', () => {
    const result = EXTRACTORS.forex({});
    expect(result.trend.score).toBe(0);
  });

  test('crypto extractor uses volumeProfileData not volumeProfile', () => {
    const signal = { volumeProfileData: { vah: 100, val: 90 }, price: 92, momentum: 0, volumeRatio: 1 };
    const result = EXTRACTORS.crypto(signal);
    expect(result.volumeProfile.present).toBe(true);
    expect(result.volumeProfile.score).toBeGreaterThan(0.7);
  });
});

// ── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  test('throws on unknown bot type', () => {
    expect(() => computeCommitteeScore({}, 'unknown')).toThrow('Unknown bot type');
  });

  test('all absent signals → confidence 0', () => {
    const signal = { price: 100 };
    const result = computeCommitteeScore(signal, 'stock');
    expect(result.presentCount).toBe(2);
    expect(result.confidence).toBeLessThan(0.2);
  });

  test('returns regime in output', () => {
    const signal = { percentChange: 1, volumeRatio: 1, price: 100 };
    const result = computeCommitteeScore(signal, 'stock', { regime: 'high' });
    expect(result.regime).toBe('high');
  });
});
