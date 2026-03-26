const { Analytics } = require('../analytics');

// Generate 120 fake trades with known signal-to-noise pattern
const trades = [];
for (let i = 0; i < 120; i++) {
  const momentum = Math.random();
  const noise = Math.random(); // fvg is random noise
  const pnl = momentum * 2 - 1 + (Math.random() - 0.5) * 0.5; // momentum predicts pnl
  trades.push({
    netPnlPct: pnl,
    components: {
      momentum, orderFlow: Math.random() * 0.5 + 0.25,
      displacement: Math.random() > 0.5 ? 1.0 : 0.3,
      volumeProfile: Math.random(), fvg: noise,
      volumeRatio: momentum * 0.8 + Math.random() * 0.2, // correlated with momentum
      mtfConfluence: Math.random()
    },
    regime: ['trending', 'ranging', 'volatile'][i % 3],
    committeeScore: 0.5
  });
}

describe('Analytics', () => {
  const analytics = new Analytics();

  test('computeIC returns IC with significance', () => {
    const result = analytics.computeIC(trades, 'momentum');
    expect(result).toHaveProperty('ic');
    expect(result).toHaveProperty('pValue');
    expect(result).toHaveProperty('significant');
    expect(result).toHaveProperty('classification');
    expect(result).toHaveProperty('n');
    expect(result.n).toBe(120);
    // momentum should have positive IC since it predicts pnl
    expect(result.ic).toBeGreaterThan(0);
  });

  test('noise component has IC near zero', () => {
    const result = analytics.computeIC(trades, 'fvg');
    expect(Math.abs(result.ic)).toBeLessThan(0.15);
  });

  test('correlationMatrix detects momentum-volumeRatio correlation', () => {
    const result = analytics.correlationMatrix(trades);
    expect(result.matrix).toBeDefined();
    expect(result.redundantPairs.length).toBeGreaterThan(0);
    const pair = result.redundantPairs.find(p =>
      (p.a === 'momentum' && p.b === 'volumeRatio') ||
      (p.a === 'volumeRatio' && p.b === 'momentum')
    );
    expect(pair).toBeDefined();
  });

  test('regimeConditionalIC returns per-regime breakdown', () => {
    const result = analytics.regimeConditionalIC(trades);
    expect(result.matrix).toHaveProperty('momentum');
    expect(result.matrix.momentum).toHaveProperty('trending');
    expect(result.matrix.momentum).toHaveProperty('ranging');
    expect(result.matrix.momentum).toHaveProperty('volatile');
  });

  test('estimateDecay returns decay data', () => {
    const result = analytics.estimateDecay(trades, 'momentum', 40);
    expect(result).toHaveProperty('windows');
    expect(result).toHaveProperty('halfLife');
    expect(result).toHaveProperty('stable');
  });

  test('generateNoiseReport produces full report', () => {
    const report = analytics.generateNoiseReport(trades, ['momentum', 'orderFlow', 'displacement', 'volumeProfile', 'fvg', 'volumeRatio', 'mtfConfluence']);
    expect(report).toHaveProperty('componentRankings');
    expect(report).toHaveProperty('redundantPairs');
    expect(report).toHaveProperty('regimeMatrix');
    expect(report).toHaveProperty('decayEstimates');
    expect(report).toHaveProperty('recommendations');
    expect(report.componentRankings.length).toBe(7);
    // momentum should rank higher than fvg
    const momentumRank = report.componentRankings.findIndex(c => c.name === 'momentum');
    const fvgRank = report.componentRankings.findIndex(c => c.name === 'fvg');
    expect(momentumRank).toBeLessThan(fvgRank);
  });
});
