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

    test('filters live strategies that fail evidence when evidence gate is enforced', async () => {
        const pool = makeEvidencePool({
            enabledRows: [{ strategy_name: 's1', asset_class: 'stock', state: 'live' }],
            backtest: { strategy_name: 's1', trade_count: 35, win_rate: 0.48, profit_factor: 1.4, passed_gate_a: true, passed_walk_forward: true },
            walkForward: { run_id: 'wf-1', fold_count: 3, total_oos_trades: 35, median_oos_sharpe: 0.7, worst_fold_sharpe: 0.1, passed_gate_b: true },
            livePaper: { trade_count: 4, win_rate: 0.5, profit_factor: 1.2, total_pnl: 5 },
        });

        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool, { enforceEvidence: true, bot: 'stock' });
        expect(enabled).toEqual([]);
    });

    test('keeps live strategies that pass all evidence gates', async () => {
        const pool = makeEvidencePool({
            enabledRows: [{ strategy_name: 's1', asset_class: 'stock', state: 'live' }],
            backtest: { strategy_name: 's1', trade_count: 35, win_rate: 0.48, profit_factor: 1.4, passed_gate_a: true, passed_walk_forward: true },
            walkForward: { run_id: 'wf-1', fold_count: 3, total_oos_trades: 35, median_oos_sharpe: 0.7, worst_fold_sharpe: 0.1, passed_gate_b: true },
            livePaper: { trade_count: 32, win_rate: 0.44, profit_factor: 1.2, total_pnl: 12 },
        });

        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool, { enforceEvidence: true, bot: 'stock' });
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('s1');
        expect(enabled[0].evidence.allowed).toBe(true);
    });
});

describe('registry.getStrategyEvidenceSummaries', () => {
    beforeEach(() => {
        registry._reset();
        registry._resetEnabledCache();
        registry.register({
            name: 's1',
            assetClass: 'stock',
            regimes: ['trending'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
    });

    test('returns disabled evidence reason for operator surfaces', async () => {
        const pool = makeEvidencePool({
            enabledRows: [{ strategy_name: 's1', asset_class: 'stock', state: 'live' }],
            backtest: { strategy_name: 's1', trade_count: 35, win_rate: 0.48, profit_factor: 1.4, passed_gate_a: true, passed_walk_forward: true },
            walkForward: { run_id: 'wf-1', fold_count: 3, total_oos_trades: 35, median_oos_sharpe: 0.7, worst_fold_sharpe: 0.1, passed_gate_b: true },
            livePaper: { trade_count: 4, win_rate: 0.5, profit_factor: 1.2, total_pnl: 5 },
        });

        const summaries = await registry.getStrategyEvidenceSummaries('stock', pool, { bot: 'stock' });
        expect(summaries).toHaveLength(1);
        expect(summaries[0].enabled).toBe(false);
        expect(summaries[0].reason).toBe('live_paper_insufficient_trades (4 < 30)');
    });
});

function makeEvidencePool({ enabledRows, backtest, walkForward, livePaper }) {
    return {
        query: async (sql) => {
            if (sql.includes('FROM strategy_enabled')) return { rows: enabledRows };
            if (sql.includes('FROM backtest_results')) return { rows: backtest ? [backtest] : [] };
            if (sql.includes('FROM walk_forward_results')) return { rows: walkForward ? [walkForward] : [] };
            if (sql.includes('FROM trades')) return { rows: livePaper ? [livePaper] : [] };
            return { rows: [] };
        },
    };
}
