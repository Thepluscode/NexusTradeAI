// Tests for order-intent.js (Rule 2: normal, boundary, malformed, adversarial).
'use strict';

const { computeOrderIntentId, DEFAULT_BUCKET_MS } = require('../order-intent');

const BASE = { bot: 'stock', action: 'entry', symbol: 'AAPL', side: 'buy', qty: 10, now: 1_780_000_000_000 };

describe('order-intent: determinism and uniqueness', () => {
    test('identical intent in the same bucket -> identical id (the dedupe property)', () => {
        const a = computeOrderIntentId(BASE);
        const b = computeOrderIntentId({ ...BASE, now: BASE.now + DEFAULT_BUCKET_MS - 1 - (BASE.now % DEFAULT_BUCKET_MS) });
        expect(a).toBe(computeOrderIntentId({ ...BASE }));
        expect(a).toBe(b); // same bucket end
        expect(a).toMatch(/^ntai-[0-9a-f]{16}$/);
    });

    test('next bucket -> different id (post-cooldown re-entry is never blocked)', () => {
        const a = computeOrderIntentId(BASE);
        const b = computeOrderIntentId({ ...BASE, now: BASE.now + DEFAULT_BUCKET_MS });
        expect(a).not.toBe(b);
    });

    test('every intent component changes the id', () => {
        const ids = new Set([computeOrderIntentId(BASE)]);
        for (const delta of [{ symbol: 'TSLA' }, { side: 'sell' }, { qty: 11 },
            { action: 'close' }, { bot: 'forex' }]) {
            ids.add(computeOrderIntentId({ ...BASE, ...delta }));
        }
        expect(ids.size).toBe(6);
    });

    test('units is accepted as the qty field (forex)', () => {
        const a = computeOrderIntentId({ bot: 'forex', action: 'entry', symbol: 'EUR_USD', units: -5000, now: BASE.now });
        const b = computeOrderIntentId({ bot: 'forex', action: 'entry', symbol: 'EUR_USD', qty: -5000, now: BASE.now });
        expect(a).toBe(b); // qty and units feed the same slot
    });
});

describe('order-intent: boundary + malformed + adversarial', () => {
    test('missing required fields -> null (callers spread-omit; never throws)', () => {
        expect(computeOrderIntentId(null)).toBeNull();
        expect(computeOrderIntentId({})).toBeNull();
        expect(computeOrderIntentId({ bot: 'stock', action: 'entry' })).toBeNull();
    });

    test('length cap respected (Alpaca 48 default, custom caps honored)', () => {
        expect(computeOrderIntentId(BASE).length).toBeLessThanOrEqual(48);
        expect(computeOrderIntentId({ ...BASE, maxLen: 12 }).length).toBe(12);
    });

    test('qty 0 and numeric-string qty are distinct from absent qty', () => {
        const zero = computeOrderIntentId({ ...BASE, qty: 0 });
        const absent = computeOrderIntentId({ bot: BASE.bot, action: BASE.action, symbol: BASE.symbol, side: BASE.side, now: BASE.now });
        expect(zero).not.toBe(absent);
        expect(computeOrderIntentId({ ...BASE, qty: '10' })).toBe(computeOrderIntentId({ ...BASE, qty: 10 }));
    });

    test('adversarial symbol content cannot break the format', () => {
        const id = computeOrderIntentId({ ...BASE, symbol: 'A|B|niceTry../../' });
        expect(id).toMatch(/^ntai-[0-9a-f]{16}$/);
    });
});
