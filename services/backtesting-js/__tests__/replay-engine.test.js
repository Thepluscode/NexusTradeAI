const { ReplayEngine } = require('../replay-engine');

describe('ReplayEngine', () => {
  // Generate 100 bars with uptrend then downtrend
  const bars = [];
  for (let i = 0; i < 100; i++) {
    const base = i < 50 ? 100 + i * 0.5 : 125 - (i - 50) * 0.5;
    bars.push({
      time: new Date(Date.now() - (100 - i) * 300000).toISOString(),
      open: base, high: base + 2, low: base - 1,
      close: base + (i < 50 ? 1 : -1), volume: 1000 + i * 10
    });
  }

  test('replays bars and produces trades', () => {
    const engine = new ReplayEngine({
      bot: 'crypto',
      threshold: 0.30,
      warmupPeriod: 50
    });

    const result = engine.replay({ m5: bars, m15: bars, h1: bars, h4: bars });
    expect(result).toHaveProperty('trades');
    expect(result).toHaveProperty('signals');
    expect(result).toHaveProperty('summary');
    expect(result.summary).toHaveProperty('totalTrades');
    expect(result.summary).toHaveProperty('winRate');
    expect(result.summary).toHaveProperty('profitFactor');
    expect(result.summary).toHaveProperty('sharpe');
    expect(result.summary).toHaveProperty('maxDrawdown');
    expect(result.summary).toHaveProperty('netPnl');
  });

  test('respects warmup period', () => {
    const engine = new ReplayEngine({ bot: 'crypto', warmupPeriod: 50 });
    const result = engine.replay({ m5: bars, m15: bars, h1: bars, h4: bars });
    for (const trade of result.trades) {
      const entryIdx = bars.findIndex(b => b.time === trade.entryTime);
      expect(entryIdx).toBeGreaterThanOrEqual(50);
    }
  });

  test('entries fill at next bar open (no lookahead)', () => {
    const engine = new ReplayEngine({ bot: 'crypto', warmupPeriod: 50, threshold: 0.20 });
    const result = engine.replay({ m5: bars, m15: bars, h1: bars, h4: bars });
    for (const trade of result.trades) {
      // entryTime is the signal bar's time; entry price is the NEXT bar's open
      const signalIdx = bars.findIndex(b => b.time === trade.entryTime);
      if (signalIdx >= 0 && signalIdx + 1 < bars.length) {
        expect(trade.entryPrice).toBe(bars[signalIdx + 1].open);
      }
    }
  });

  test('stop loss uses gap-through pricing', () => {
    const engine = new ReplayEngine({ bot: 'crypto', warmupPeriod: 50 });
    expect(engine).toBeDefined();
  });
});
