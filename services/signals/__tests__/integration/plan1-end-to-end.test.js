const { computeContext } = require('../../strategy-context');
const registry = require('../../strategy-registry');
const { loadAllStrategies } = require('../../strategies');

function makeBars(count = 30) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = 100 + i * 0.5;
        bars.push({
            t: new Date(2026, 3, 10, 9, 30 + i).toISOString(),
            o: price, h: price + 0.1, l: price - 0.1, c: price, v: 100000
        });
    }
    return bars;
}

function mockDbPool(rows) {
    return { query: async () => ({ rows }) };
}

describe('Plan 1 — end-to-end integration', () => {
    beforeEach(() => {
        registry._reset();
        registry._resetEnabledCache();
    });

    test('stub strategy loads, context computes, runStrategies dispatches', async () => {
        const loaded = loadAllStrategies();
        expect(loaded.length).toBeGreaterThan(0);
        expect(loaded.some(s => s.name === '_stub')).toBe(true);

        const bars = makeBars(30);
        const context = computeContext(bars, 'trending');
        expect(context).not.toBeNull();
        expect(context.vwap).not.toBeNull();

        const pool = mockDbPool([{ strategy_name: '_stub', state: 'shadow' }]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('_stub');

        const { candidates, diagnostics } = registry.runStrategies(enabled, 'AAPL', bars, context);
        expect(candidates).toEqual([]);
        expect(diagnostics._stub.stub_never_produces_candidates).toBe(1);
    });

    test('entire pipeline handles empty bars gracefully', async () => {
        loadAllStrategies();
        const context = computeContext([], 'trending');
        expect(context).toBeNull();
        const enabled = [];
        const { candidates } = registry.runStrategies(enabled, 'AAPL', [], context);
        expect(candidates).toEqual([]);
    });

    test('DB down falls through to empty list without crash', async () => {
        loadAllStrategies();
        const badPool = { query: async () => { throw new Error('db_down'); } };
        const enabled = await registry.getEnabledStrategies('stock', 'trending', badPool);
        expect(enabled).toEqual([]);
    });
});
