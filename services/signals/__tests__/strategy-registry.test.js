// services/signals/__tests__/strategy-registry.test.js
const registry = require('../strategy-registry');

const validStrategy = {
    name: 'testStrategy',
    assetClass: 'stock',
    regimes: ['trending'],
    evaluate: (bars, context) => ({ killedBy: 'not_implemented' }),
};

beforeEach(() => {
    registry._reset(); // test-only helper
});

describe('registry.register', () => {
    test('accepts a valid strategy', () => {
        expect(() => registry.register(validStrategy)).not.toThrow();
        expect(registry._getAll().length).toBe(1);
    });

    test('throws on missing name', () => {
        const { name, ...rest } = validStrategy;
        expect(() => registry.register(rest)).toThrow(/name/);
    });

    test('throws on missing assetClass', () => {
        const { assetClass, ...rest } = validStrategy;
        expect(() => registry.register(rest)).toThrow(/assetClass/);
    });

    test('throws on missing evaluate', () => {
        const { evaluate, ...rest } = validStrategy;
        expect(() => registry.register(rest)).toThrow(/evaluate/);
    });

    test('throws on non-function evaluate', () => {
        expect(() => registry.register({ ...validStrategy, evaluate: 'not-a-func' })).toThrow(/evaluate/);
    });

    test('throws on duplicate name', () => {
        registry.register(validStrategy);
        expect(() => registry.register(validStrategy)).toThrow(/duplicate/i);
    });

    test('accepts a strategy with no regimes (defaults to ["any"])', () => {
        const { regimes, ...rest } = validStrategy;
        expect(() => registry.register(rest)).not.toThrow();
        expect(registry._getAll()[0].regimes).toEqual(['any']);
    });
});

describe('registry.runStrategies', () => {
    test('returns candidates from strategies that produce them', () => {
        const s1 = {
            name: 's1',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ candidate: { price: 100, score: 0.5 } }),
        };
        registry.register(s1);
        const { candidates } = registry.runStrategies([s1], 'AAPL', [], {});
        expect(candidates).toHaveLength(1);
        expect(candidates[0].strategy).toBe('s1');
        expect(candidates[0].price).toBe(100);
    });

    test('collects killedBy diagnostics for rejected strategies', () => {
        const s1 = {
            name: 's1',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ killedBy: 'no_breakout' }),
        };
        registry.register(s1);
        const { candidates, diagnostics } = registry.runStrategies([s1], 'AAPL', [], {});
        expect(candidates).toHaveLength(0);
        expect(diagnostics.s1.no_breakout).toBe(1);
    });

    test('isolates errors: one crashing strategy does not break others', () => {
        const crash = {
            name: 'crash',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => { throw new Error('boom'); },
        };
        const ok = {
            name: 'ok',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ candidate: { price: 100 } }),
        };
        registry.register(crash);
        registry.register(ok);
        const { candidates } = registry.runStrategies([crash, ok], 'AAPL', [], {});
        expect(candidates).toHaveLength(1);
        expect(candidates[0].strategy).toBe('ok');
    });

    test('records strategy errors in diagnostics', () => {
        const crash = {
            name: 'crash',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => { throw new Error('boom'); },
        };
        registry.register(crash);
        const { diagnostics } = registry.runStrategies([crash], 'AAPL', [], {});
        expect(diagnostics.crash).toBeDefined();
        expect(diagnostics.crash._error).toMatch(/boom/);
    });

    test('empty enabledStrategies returns empty candidates + empty diagnostics', () => {
        const { candidates, diagnostics } = registry.runStrategies([], 'AAPL', [], {});
        expect(candidates).toEqual([]);
        expect(diagnostics).toEqual({});
    });
});

describe('registry.getEnabledStrategies', () => {
    function makeStubPool(rows, shouldFail = false) {
        return {
            query: async (sql, params) => {
                if (shouldFail) throw new Error('db_down');
                return { rows };
            }
        };
    }

    beforeEach(() => {
        registry._reset();
        registry._resetEnabledCache();
        registry.register({
            name: 's1',
            assetClass: 'stock',
            regimes: ['trending'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
        registry.register({
            name: 's2',
            assetClass: 'stock',
            regimes: ['ranging'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
    });

    test('returns strategies matching assetClass and regime from DB', async () => {
        const pool = makeStubPool([
            { strategy_name: 's1', state: 'live' },
            { strategy_name: 's2', state: 'live' },
        ]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('s1');
    });

    test('uses "any" as wildcard regime', async () => {
        registry.register({
            name: 'sAny',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
        const pool = makeStubPool([
            { strategy_name: 'sAny', state: 'live' },
        ]);
        const enabled = await registry.getEnabledStrategies('stock', 'ranging', pool);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('sAny');
    });

    test('caches results for 60s — second call does not requery', async () => {
        let queryCount = 0;
        const pool = {
            query: async () => {
                queryCount++;
                return { rows: [{ strategy_name: 's1', state: 'live' }] };
            }
        };
        await registry.getEnabledStrategies('stock', 'trending', pool);
        await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(queryCount).toBe(1);
    });

    test('falls back to cached value when DB query fails', async () => {
        const okPool = makeStubPool([{ strategy_name: 's1', state: 'live' }]);
        await registry.getEnabledStrategies('stock', 'trending', okPool);
        registry._forceCacheExpiry();
        const badPool = makeStubPool([], true);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', badPool);
        expect(enabled).toHaveLength(1);
    });

    test('returns empty array on first-ever DB failure (safe default)', async () => {
        const badPool = makeStubPool([], true);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', badPool);
        expect(enabled).toEqual([]);
    });

    test('includes state field on returned strategies', async () => {
        const pool = makeStubPool([{ strategy_name: 's1', state: 'shadow' }]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled[0].state).toBe('shadow');
    });

    test('filters out strategies registered in code but not in DB', async () => {
        const pool = makeStubPool([]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toEqual([]);
    });

    test('filters out DB rows without a matching registered strategy', async () => {
        const pool = makeStubPool([{ strategy_name: 'ghostStrategy', state: 'live' }]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toEqual([]);
    });
});
