const signals = require('../index');

describe('Signal Pipeline Integration', () => {
  // 60 bars of fake market data
  const klines = [];
  for (let i = 0; i < 60; i++) {
    const base = 100 + Math.sin(i / 5) * 5;
    klines.push({
      open: base, high: base + 2, low: base - 2,
      close: base + (i % 2 === 0 ? 1 : -1),
      volume: 1000 + Math.random() * 500
    });
  }

  test('exports all components', () => {
    expect(signals.computeMomentum).toBeDefined();
    expect(signals.computeOrderFlow).toBeDefined();
    expect(signals.computeDisplacement).toBeDefined();
    expect(signals.computeVolumeProfile).toBeDefined();
    expect(signals.computeFVG).toBeDefined();
    expect(signals.computeVolumeRatio).toBeDefined();
    expect(signals.computeTrend).toBeDefined();
    expect(signals.computeMACD).toBeDefined();
    expect(signals.computeMTFScore).toBeDefined();
    expect(signals.detectRegime).toBeDefined();
    expect(signals.computeCommitteeScore).toBeDefined();
    expect(signals.qualifyEntry).toBeDefined();
    expect(signals.computeStops).toBeDefined();
    expect(signals.BOT_COMPONENTS).toBeDefined();
  });

  test('full pipeline: compute all signals → committee → qualify', () => {
    const regime = signals.detectRegime(klines);
    const atr = signals.computeATR(klines, 14);
    const price = klines[klines.length - 1].close;

    const signalScores = {
      momentum: signals.computeMomentum({ momentum: 3.5 }),
      orderFlow: signals.computeOrderFlow(klines),
      displacement: signals.computeDisplacement(klines, atr, 3, { neutralDefault: 0.3 }),
      volumeProfile: signals.computeVolumeProfile(klines, { currentPrice: price }),
      fvg: signals.computeFVG(klines, { neutralDefault: 0.3 }),
      volumeRatio: signals.computeVolumeRatio(klines),
      mtfConfluence: { score: 0.5 } // placeholder
    };

    const committee = signals.computeCommitteeScore(signalScores, signals.BOT_COMPONENTS.crypto, regime.regime);
    expect(committee.confidence).toBeGreaterThan(0);
    expect(committee.confidence).toBeLessThanOrEqual(1);

    const costs = signals.getRoundTripCost('crypto', price);
    const entry = signals.qualifyEntry(committee, { threshold: 0.3 }, costs);
    expect(entry).toHaveProperty('qualified');
    expect(entry).toHaveProperty('ev');

    const stops = signals.computeStops(klines, regime.regime, 'long', price);
    expect(stops.stopLoss).toBeLessThan(price);
    expect(stops.profitTarget).toBeGreaterThan(price);
  });
});
