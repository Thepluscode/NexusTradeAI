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
