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
