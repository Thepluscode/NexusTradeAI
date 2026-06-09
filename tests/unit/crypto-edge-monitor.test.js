const { bucketKey, summarize, tradeTime, tradesArray } = require('../../scripts/crypto-edge-monitor');

describe('crypto-edge-monitor helpers', () => {
    it('uses exit_time first so closed-after-cutoff trades are monitored', () => {
        const trade = {
            entry_time: '2026-06-09T10:00:00Z',
            exit_time: '2026-06-09T13:00:00Z',
            created_at: '2026-06-09T09:00:00Z',
        };

        expect(tradeTime(trade)).toBe(new Date('2026-06-09T13:00:00Z').getTime());
    });

    it('falls back to entry_time for open trades without exit_time', () => {
        expect(tradeTime({ entry_time: '2026-06-09T10:00:00Z' })).toBe(new Date('2026-06-09T10:00:00Z').getTime());
    });

    it('uses persisted market_regime before legacy entry_context labels', () => {
        expect(bucketKey({
            strategy: 'momentum',
            market_regime: 'MEAN_REVERTING',
            entry_context: { marketRegime: 'low' },
        })).toBe('momentum|MEAN_REVERTING');
    });

    it('normalizes supported trades payload shapes', () => {
        expect(tradesArray([{ id: 1 }])).toEqual([{ id: 1 }]);
        expect(tradesArray({ trades: [{ id: 2 }] })).toEqual([{ id: 2 }]);
        expect(tradesArray({ data: [{ id: 3 }] })).toEqual([{ id: 3 }]);
    });

    it('summarizes closed non-orphan trades only', () => {
        const stats = summarize([
            { status: 'closed', pnl_usd: '2' },
            { status: 'closed', pnl_usd: '-1' },
            { status: 'closed', close_reason: 'orphaned_restart', pnl_usd: '100' },
            { status: 'open', pnl_usd: '100' },
        ]);

        expect(stats.n).toBe(2);
        expect(stats.total).toBe(1);
        expect(stats.winRate).toBe(0.5);
        expect(stats.profitFactor).toBe(2);
        expect(stats.expectancy).toBe(0.5);
    });
});
