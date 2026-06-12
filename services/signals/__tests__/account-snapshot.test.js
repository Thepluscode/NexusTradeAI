// Tests for account-snapshot.js (Rule 2: normal, boundary, malformed).
'use strict';

const { buildAccountSnapshot } = require('../account-snapshot');

describe('account-snapshot', () => {
    test('Map of positions -> count, symbols, summed abs exposure', () => {
        const m = new Map([
            ['ETHUSD', { symbol: 'ETHUSD', positionSizeUSD: 120.5 }],
            ['SOLUSD', { symbol: 'SOLUSD', quantity: 10, entry: 5.25 }],
        ]);
        const s = buildAccountSnapshot(m);
        expect(s.openPositions).toBe(2);
        expect(s.symbols).toEqual(['ETHUSD', 'SOLUSD']);
        expect(s.exposureUsd).toBe(173);
        expect(typeof s.ts).toBe('string');
    });

    test('array input and snake_case field accepted', () => {
        const s = buildAccountSnapshot([{ symbol: 'XBTUSD', position_size_usd: '50' }]);
        expect(s.exposureUsd).toBe(50);
    });

    test('empty Map -> honest zero snapshot (not null)', () => {
        const s = buildAccountSnapshot(new Map());
        expect(s).toMatchObject({ openPositions: 0, symbols: [], exposureUsd: 0 });
    });

    test('negative quantity (short) contributes absolute exposure', () => {
        const s = buildAccountSnapshot([{ instrument: 'EUR_USD', quantity: -5000, entry: 1.1 }]);
        expect(s.exposureUsd).toBe(5500);
        expect(s.symbols).toEqual(['EUR_USD']);
    });

    test('malformed inputs -> null, never throws', () => {
        for (const bad of [null, undefined, 42, 'x', {}]) {
            expect(buildAccountSnapshot(bad)).toBeNull();
        }
    });

    test('garbage records are counted with zero exposure, not dropped silently', () => {
        const s = buildAccountSnapshot([{ symbol: 'A', positionSizeUSD: 'NaN-ish' }, null, { symbol: 'B', positionSizeUSD: 10 }]);
        expect(s.openPositions).toBe(2); // null skipped, 'A' kept with 0
        expect(s.exposureUsd).toBe(10);
    });
});
