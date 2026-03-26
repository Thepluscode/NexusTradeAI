const { computeCommitteeScore, BOT_COMPONENTS } = require('../committee-scorer');

describe('computeCommitteeScore', () => {
  const signals = {
    momentum: { score: 0.8 },
    orderFlow: { score: 0.6 },
    displacement: { score: 1.0 },
    volumeProfile: { score: 0.4 },
    fvg: { score: 0.3 },
    volumeRatio: { score: 0.7 },
    mtfConfluence: { score: 0.5 }
  };

  test('computes weighted average confidence for crypto bot', () => {
    const result = computeCommitteeScore(signals, BOT_COMPONENTS.crypto);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.components).toHaveProperty('momentum');
  });

  test('forex bot uses trend+macd instead of momentum+volumeRatio', () => {
    const forexSignals = {
      trend: { score: 0.9 },
      orderFlow: { score: 0.6 },
      displacement: { score: 0.0 },
      volumeProfile: { score: 0.4 },
      fvg: { score: 0.0 },
      macd: { score: 0.7 },
      mtfConfluence: { score: 0.5 }
    };
    const result = computeCommitteeScore(forexSignals, BOT_COMPONENTS.forex);
    expect(result.components).toHaveProperty('trend');
    expect(result.components).toHaveProperty('macd');
    expect(result.components).not.toHaveProperty('momentum');
  });

  test('uses custom weights when provided via _customWeights', () => {
    const customWeights = { momentum: 1.0, orderFlow: 0, displacement: 0, volumeProfile: 0, fvg: 0, volumeRatio: 0, mtfConfluence: 0 };
    const config = { ...BOT_COMPONENTS.crypto, _customWeights: customWeights };
    const result = computeCommitteeScore(signals, config);
    expect(result.confidence).toBeCloseTo(0.8, 1);
  });

  test('regime-conditional weights override defaults', () => {
    const config = {
      ...BOT_COMPONENTS.crypto,
      regimeWeights: {
        trending: { momentum: 0.5, orderFlow: 0.1, displacement: 0.1, volumeProfile: 0.1, fvg: 0.1, volumeRatio: 0.1, mtfConfluence: 0 }
      }
    };
    const result = computeCommitteeScore(signals, config, 'trending');
    expect(result.confidence).toBeDefined();
  });

  test('missing signal scores use neutralDefault', () => {
    const partial = { momentum: { score: 0.8 } };
    const result = computeCommitteeScore(partial, BOT_COMPONENTS.crypto);
    expect(result.confidence).toBeGreaterThan(0);
  });
});
