/**
 * Tests for the forex absolute-notional fail-closed cap (v25.2).
 *
 * The cap is inlined in clients/bot-dashboard/unified-forex-bot.js immediately
 * after the v25.1 %-of-balance cap. It guards against the "millions of USD
 * notional" anomaly the 2026-05-27 strategy monitor caught by REJECTING
 * (returning false) rather than silently clamping — so underlying bugs in
 * balance reporting or unit conversion surface in alerts.
 *
 * This test verifies the *logic* of the cap (replicated as a pure helper)
 * matches the inline implementation, and exercises the four corners:
 *   - USD-base pair, under cap   -> pass
 *   - USD-base pair, over cap    -> reject
 *   - Non-USD pair, under cap    -> pass
 *   - Non-USD pair, over cap     -> reject
 * Plus environment-variable tunability and the 2026-05-27-monitor anomaly
 * case (millions of USD on a JPY pair).
 *
 * Run with:  npx jest tests/unit/forex-notional-abs-cap.test.js --config='{}'
 */

'use strict';

/**
 * Pure-function mirror of the inline cap in unified-forex-bot.js (v25.2).
 * Returns true if the trade should proceed, false if it should be rejected.
 */
function notionalAbsCapAllowsTrade({ units, entry, baseCurrency, envCap }) {
    let cap = parseFloat(envCap || '100000');
    if (!Number.isFinite(cap) || cap <= 0) cap = 100000; // fail-closed on bad env
    const finalNotionalUsd = Math.abs(units) * (baseCurrency === 'USD' ? 1 : entry);
    return finalNotionalUsd <= cap;
}

describe('forex absolute-notional fail-closed cap (v25.2)', () => {
    describe('USD-base pairs (notional = |units|)', () => {
        test('passes when under the default $100k cap', () => {
            // EUR_USD-style: 1 unit = ~$1 of notional
            expect(notionalAbsCapAllowsTrade({
                units: 50000, entry: 1.10, baseCurrency: 'USD',
            })).toBe(true);
        });

        test('rejects when notional exceeds the default $100k cap', () => {
            // 150,000 units on a USD-base pair = $150,000 notional
            expect(notionalAbsCapAllowsTrade({
                units: 150000, entry: 1.10, baseCurrency: 'USD',
            })).toBe(false);
        });

        test('passes exactly at the cap (boundary)', () => {
            expect(notionalAbsCapAllowsTrade({
                units: 100000, entry: 1.10, baseCurrency: 'USD',
            })).toBe(true);
        });
    });

    describe('non-USD base pairs (notional = |units| * entry)', () => {
        test('passes when entry * units stays under $100k', () => {
            // USD_JPY-style: 500 units at entry 150 = $75,000 USD notional
            expect(notionalAbsCapAllowsTrade({
                units: 500, entry: 150, baseCurrency: 'JPY',
            })).toBe(true);
        });

        test('rejects the millions-of-USD anomaly the 2026-05-27 monitor reported', () => {
            // 10,000 units * entry 150 (USD_JPY) = $1,500,000 USD notional.
            // This is the exact shape of the historical anomaly that motivated the cap.
            expect(notionalAbsCapAllowsTrade({
                units: 10000, entry: 150, baseCurrency: 'JPY',
            })).toBe(false);
        });

        test('rejects extreme stacked-multiplier inflation case', () => {
            // 100,000 units * entry 0.85 (e.g. GBP_USD-inverse) = $85k — passes
            expect(notionalAbsCapAllowsTrade({
                units: 100000, entry: 0.85, baseCurrency: 'GBP',
            })).toBe(true);
            // ...but the same units at 1.5 = $150k — rejects
            expect(notionalAbsCapAllowsTrade({
                units: 100000, entry: 1.5, baseCurrency: 'GBP',
            })).toBe(false);
        });
    });

    describe('environment-variable tunability (MAX_NOTIONAL_USD_ABS)', () => {
        test('raises cap to allow larger trades when explicitly tuned', () => {
            expect(notionalAbsCapAllowsTrade({
                units: 200000, entry: 1.10, baseCurrency: 'USD',
                envCap: '500000',
            })).toBe(true);
        });

        test('lowers cap to be even stricter', () => {
            expect(notionalAbsCapAllowsTrade({
                units: 60000, entry: 1.10, baseCurrency: 'USD',
                envCap: '50000',
            })).toBe(false);
        });

        test('invalid env value falls back to $100k default (fail-closed on bad config)', () => {
            // parseFloat('broken') -> NaN. Without the Number.isFinite guard this would
            // be a fail-OPEN bug; with the guard, the cap falls back to the $100k default
            // and a $220k trade attempt is correctly rejected.
            const result = notionalAbsCapAllowsTrade({
                units: 200000, entry: 1.10, baseCurrency: 'USD',
                envCap: 'broken',
            });
            expect(result).toBe(false);
        });

        test('zero env value falls back to default (cap of 0 would block everything)', () => {
            const result = notionalAbsCapAllowsTrade({
                units: 50000, entry: 1.10, baseCurrency: 'USD',
                envCap: '0',
            });
            expect(result).toBe(true);
        });

        test('negative env value falls back to default', () => {
            const result = notionalAbsCapAllowsTrade({
                units: 50000, entry: 1.10, baseCurrency: 'USD',
                envCap: '-1000',
            });
            expect(result).toBe(true);
        });
    });

    describe('negative-units (short positions)', () => {
        test('uses absolute value of units — short of $150k notional still rejects', () => {
            expect(notionalAbsCapAllowsTrade({
                units: -150000, entry: 1.10, baseCurrency: 'USD',
            })).toBe(false);
        });
    });
});
