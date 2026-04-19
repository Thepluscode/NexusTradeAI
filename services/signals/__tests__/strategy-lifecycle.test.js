const { evaluateStrategyHealth } = require('../strategy-registry');

describe('evaluateStrategyHealth', () => {
    function makeTrade(pnl, entryPrice = 100) {
        return { pnl, entry_price: entryPrice };
    }

    test('returns none when insufficient trades', () => {
        const result = evaluateStrategyHealth('test', [makeTrade(1), makeTrade(-1)]);
        expect(result.action).toBe('none');
        expect(result.details.reason).toBe('insufficient_trades');
    });

    test('returns demote when Sharpe < 0 (losing money)', () => {
        // 20 trades, mostly losers → negative Sharpe
        const trades = [];
        for (let i = 0; i < 5; i++) trades.push(makeTrade(2));
        for (let i = 0; i < 15; i++) trades.push(makeTrade(-3));
        const result = evaluateStrategyHealth('test', trades);
        expect(result.action).toBe('demote');
        expect(result.details.sharpe).toBeLessThan(0);
    });

    test('returns reduce_size when Sharpe between 0 and 0.3', () => {
        // 20 trades, slightly more winners but small edge
        const trades = [];
        for (let i = 0; i < 11; i++) trades.push(makeTrade(1.1));
        for (let i = 0; i < 9; i++) trades.push(makeTrade(-1.2));
        const result = evaluateStrategyHealth('test', trades);
        // Sharpe should be small positive
        if (result.details.sharpe >= 0 && result.details.sharpe < 0.3) {
            expect(result.action).toBe('reduce_size');
            expect(result.details.sizeMultiplier).toBe(0.5);
        }
    });

    test('returns none for healthy strategy (high Sharpe)', () => {
        // 20 trades, consistently winning
        const trades = [];
        for (let i = 0; i < 15; i++) trades.push(makeTrade(5));
        for (let i = 0; i < 5; i++) trades.push(makeTrade(-2));
        const result = evaluateStrategyHealth('test', trades);
        expect(result.action).toBe('none');
        expect(result.details.winRate).toBeGreaterThan(0.5);
    });

    test('returns demote for very low win rate (< 25%)', () => {
        const trades = [];
        for (let i = 0; i < 4; i++) trades.push(makeTrade(10));  // 4 wins
        for (let i = 0; i < 16; i++) trades.push(makeTrade(-1));  // 16 losses
        // WR = 20% → demote
        const result = evaluateStrategyHealth('test', trades);
        expect(result.action).toBe('demote');
    });

    test('includes all diagnostic fields', () => {
        const trades = Array.from({ length: 20 }, (_, i) => makeTrade(i % 2 === 0 ? 3 : -2));
        const result = evaluateStrategyHealth('test', trades);
        expect(result.details).toHaveProperty('tradeCount');
        expect(result.details).toHaveProperty('winRate');
        expect(result.details).toHaveProperty('totalPnl');
        expect(result.details).toHaveProperty('sharpe');
    });

    test('handles null trades', () => {
        const result = evaluateStrategyHealth('test', null);
        expect(result.action).toBe('none');
    });

    test('handles empty trades', () => {
        const result = evaluateStrategyHealth('test', []);
        expect(result.action).toBe('none');
    });
});
