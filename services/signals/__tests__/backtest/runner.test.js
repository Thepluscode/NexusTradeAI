const { simulateTrades } = require('../../backtest/runner');

// Strategy that buys everything and holds for 3 bars
const alwaysBuyStrategy = {
    name: 'alwaysBuy',
    assetClass: 'stock',
    regimes: ['any'],
    evaluate(bars, context) {
        if (!context || !context.currentPrice) return { killedBy: 'no_context' };
        return {
            candidate: {
                price: context.currentPrice,
                stopLoss: context.currentPrice * 0.97,  // 3% stop
                takeProfit: context.currentPrice * 1.06, // 6% target
                strategy: 'alwaysBuy',
                tier: 'tier1',
                score: 0.8,
            }
        };
    }
};

// Strategy that never produces signals
const neverBuyStrategy = {
    name: 'neverBuy',
    assetClass: 'stock',
    regimes: ['any'],
    evaluate() { return { killedBy: 'always_reject' }; }
};

function makeRisingBars(count, startPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = startPrice + i * 0.5;
        bars.push({ t: `2026-04-01T09:${30 + i}:00Z`, o: price, h: price + 0.3, l: price - 0.1, c: price + 0.2, v: 100000 });
    }
    return bars;
}

function makeFallingBars(count, startPrice = 100) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = startPrice - i * 0.5;
        bars.push({ t: `2026-04-01T09:${30 + i}:00Z`, o: price, h: price + 0.1, l: price - 0.3, c: price - 0.2, v: 100000 });
    }
    return bars;
}

describe('simulateTrades', () => {
    test('produces trades for a strategy that always signals', () => {
        const bars = makeRisingBars(60);
        const result = simulateTrades(alwaysBuyStrategy, bars, { lookback: 30 });
        expect(result.trades.length).toBeGreaterThan(0);
    });

    test('produces zero trades for a strategy that never signals', () => {
        const bars = makeRisingBars(60);
        const result = simulateTrades(neverBuyStrategy, bars, { lookback: 30 });
        expect(result.trades).toEqual([]);
    });

    test('each trade has entry_price, exit_price, pnl, exit_reason', () => {
        const bars = makeRisingBars(60);
        const result = simulateTrades(alwaysBuyStrategy, bars, { lookback: 30 });
        for (const trade of result.trades) {
            expect(trade).toHaveProperty('entry_price');
            expect(trade).toHaveProperty('exit_price');
            expect(trade).toHaveProperty('pnl');
            expect(trade).toHaveProperty('exit_reason');
            expect(typeof trade.pnl).toBe('number');
        }
    });

    test('stop loss triggers on falling bars', () => {
        const bars = [...makeRisingBars(35, 100), ...makeFallingBars(30, 100)];
        const result = simulateTrades(alwaysBuyStrategy, bars, { lookback: 30 });
        const stopLossTrades = result.trades.filter(t => t.exit_reason === 'stop_loss');
        expect(stopLossTrades.length).toBeGreaterThan(0);
        for (const t of stopLossTrades) {
            expect(t.pnl).toBeLessThan(0);
        }
    });

    test('take profit triggers on rising bars', () => {
        const bars = makeRisingBars(100);
        const result = simulateTrades(alwaysBuyStrategy, bars, { lookback: 30 });
        const tpTrades = result.trades.filter(t => t.exit_reason === 'take_profit');
        expect(tpTrades.length).toBeGreaterThan(0);
        for (const t of tpTrades) {
            expect(t.pnl).toBeGreaterThan(0);
        }
    });

    test('returns aggregate stats: winRate, profitFactor', () => {
        const bars = makeRisingBars(100);
        const result = simulateTrades(alwaysBuyStrategy, bars, { lookback: 30 });
        expect(result).toHaveProperty('winRate');
        expect(result).toHaveProperty('profitFactor');
        expect(typeof result.winRate).toBe('number');
    });

    test('handles empty bars gracefully', () => {
        const result = simulateTrades(alwaysBuyStrategy, [], { lookback: 30 });
        expect(result.trades).toEqual([]);
    });

    test('respects lookback parameter — no trades before enough bars', () => {
        const bars = makeRisingBars(40);
        const result = simulateTrades(alwaysBuyStrategy, bars, { lookback: 30 });
        for (const trade of result.trades) {
            expect(trade.entry_bar_index).toBeGreaterThanOrEqual(30);
        }
    });
});
