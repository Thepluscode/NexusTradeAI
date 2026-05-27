/**
 * Tests for the forex missing-context entry-rejection guard (v25.4).
 *
 * The guard is inlined in both dbForexOpen variants of
 * clients/bot-dashboard/unified-forex-bot.js (global at line ~316, user-scoped
 * at line ~5473). A small helper `_forexEntryHasContext(signal)` returns true
 * when the signal carries any of (rsi, volumeRatio, marketRegime, strategy).
 * Non-restored entries that fail this check are rejected before INSERT.
 *
 * This test mirrors the helper's logic and exercises:
 *   - present indicators (any one is sufficient)
 *   - empty signal {} (the bug case from monitor 2026-05-27)
 *   - null / undefined / non-object signals
 *   - session='restored' bypass (verified at the call site, not in the helper)
 *
 * Run with:  npx jest tests/unit/forex-missing-context-guard.test.js --config='{}'
 */

'use strict';

// Pure-function mirror of _forexEntryHasContext from unified-forex-bot.js.
function hasContext(signal) {
    if (!signal || typeof signal !== 'object') return false;
    return signal.rsi != null
        || signal.volumeRatio != null
        || signal.marketRegime != null
        || (typeof signal.strategy === 'string' && signal.strategy.length > 0);
}

// Mirror of the call-site composite gate: session !== 'restored' && !hasContext(signal)
function shouldRejectEntry({ session, signal }) {
    if (session === 'restored') return false;
    return !hasContext(signal);
}

describe('forex missing-context entry guard (v25.4)', () => {
    describe('hasContext — accepts any one meaningful field', () => {
        test('accepts rsi alone', () => {
            expect(hasContext({ rsi: 45 })).toBe(true);
        });
        test('accepts volumeRatio alone', () => {
            expect(hasContext({ volumeRatio: 1.3 })).toBe(true);
        });
        test('accepts marketRegime alone', () => {
            expect(hasContext({ marketRegime: 'trending_up' })).toBe(true);
        });
        test('accepts non-empty strategy tag alone', () => {
            expect(hasContext({ strategy: 'boxBreakout' })).toBe(true);
        });
        test('accepts rsi=0 (extreme oversold, falsy-but-meaningful)', () => {
            expect(hasContext({ rsi: 0 })).toBe(true);
        });
    });

    describe('hasContext — rejects empty / unusable signals', () => {
        test('rejects empty object {} (the monitor 2026-05-27 bug case)', () => {
            expect(hasContext({})).toBe(false);
        });
        test('rejects null', () => {
            expect(hasContext(null)).toBe(false);
        });
        test('rejects undefined', () => {
            expect(hasContext(undefined)).toBe(false);
        });
        test('rejects non-object types (string, number, boolean)', () => {
            expect(hasContext('signal')).toBe(false);
            expect(hasContext(42)).toBe(false);
            expect(hasContext(true)).toBe(false);
        });
        test('rejects object with all-null indicators', () => {
            expect(hasContext({ rsi: null, volumeRatio: null, marketRegime: null, strategy: null })).toBe(false);
        });
        test('rejects empty-string strategy (not a real tag)', () => {
            expect(hasContext({ strategy: '' })).toBe(false);
        });
    });

    describe('shouldRejectEntry — composite gate at call site', () => {
        test('restored session always passes even with empty signal', () => {
            expect(shouldRejectEntry({ session: 'restored', signal: {} })).toBe(false);
            expect(shouldRejectEntry({ session: 'restored', signal: null })).toBe(false);
        });
        test('non-restored entry with no context is rejected (monitor 2026-05-27)', () => {
            expect(shouldRejectEntry({ session: 'london', signal: {} })).toBe(true);
            expect(shouldRejectEntry({ session: null, signal: {} })).toBe(true);
            expect(shouldRejectEntry({ session: undefined, signal: null })).toBe(true);
        });
        test('non-restored entry with context proceeds', () => {
            expect(shouldRejectEntry({
                session: 'london',
                signal: { rsi: 55, strategy: 'boxBreakout' },
            })).toBe(false);
        });
        test('session "restoring" (typo) is NOT exempt — must match exactly', () => {
            // Defensive: only the literal 'restored' bypasses the guard.
            // Anything else (typo, alternative casing, null) must have real context.
            expect(shouldRejectEntry({ session: 'restoring', signal: {} })).toBe(true);
            expect(shouldRejectEntry({ session: 'Restored', signal: {} })).toBe(true);
        });
    });
});
