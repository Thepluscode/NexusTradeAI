const stub = require('../../strategies/_stub');

describe('_stub strategy', () => {
    test('has required interface fields', () => {
        expect(stub.name).toBe('_stub');
        expect(stub.assetClass).toBe('stock');
        expect(Array.isArray(stub.regimes)).toBe(true);
        expect(typeof stub.evaluate).toBe('function');
    });

    test('evaluate always returns a killedBy result (never a candidate)', () => {
        const result = stub.evaluate([], {});
        expect(result.candidate).toBeUndefined();
        expect(result.killedBy).toBe('stub_never_produces_candidates');
    });

    test('evaluate is a pure function', () => {
        const r1 = stub.evaluate([], {});
        const r2 = stub.evaluate([], {});
        expect(r1).toEqual(r2);
    });
});
