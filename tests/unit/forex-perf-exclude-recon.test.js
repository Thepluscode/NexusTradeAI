/**
 * Tests for the forex performance reconciliation-exclusion SQL fragment (v25.5).
 *
 * `FOREX_PERF_EXCLUDE_RECON_SQL` lives at file scope in
 * clients/bot-dashboard/unified-forex-bot.js and is interpolated into every
 * forex performance aggregation query:
 *   - loadForexEvaluationsFromDB (line ~634)
 *   - /api/trades/summary daily query (line ~4897)
 *   - /api/trades/summary totals query (line ~4909)
 *   - consecutive-losses query (line ~6416)
 *
 * Reconciliation trades pollute strategy stats. The fragment excludes:
 *   - orphaned_restart EXITS (restart found DB-open trade with no OANDA match)
 *   - session='restored' ENTRIES (recovered from OANDA, not a strategy decision)
 *
 * These tests verify the SQL shape, the COALESCE NULL-safety, and the
 * "decision logic" simulated in JS against representative rows.
 *
 * Run with:  npx jest tests/unit/forex-perf-exclude-recon.test.js --config='{}'
 */

'use strict';

// Mirror of the fragment in unified-forex-bot.js (v25.5).
const FOREX_PERF_EXCLUDE_RECON_SQL =
    `(COALESCE(close_reason, '') != 'orphaned_restart' AND COALESCE(session, '') != 'restored')`;

/**
 * JS-side simulator of the SQL predicate. Returns true if the row PASSES the
 * filter (i.e. counts as a real strategy trade), false if it should be excluded.
 */
function isStrategyTrade(row) {
    const closeReason = row.close_reason ?? '';
    const session = row.session ?? '';
    return closeReason !== 'orphaned_restart' && session !== 'restored';
}

describe('forex performance reconciliation-exclusion (v25.5)', () => {
    describe('SQL fragment shape', () => {
        test('excludes orphaned_restart exits explicitly', () => {
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toContain(`close_reason`);
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toContain(`'orphaned_restart'`);
        });
        test('excludes session=restored entries explicitly', () => {
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toContain(`session`);
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toContain(`'restored'`);
        });
        test('uses COALESCE to handle NULL columns (no silent-drop-all bug)', () => {
            // Postgres: `col != 'x'` returns NULL when col IS NULL, which means
            // WHERE clauses silently drop those rows. COALESCE(col, '') fixes this.
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toContain(`COALESCE(close_reason`);
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toContain(`COALESCE(session`);
        });
        test('combines exclusions with AND (both must be true to pass)', () => {
            expect(FOREX_PERF_EXCLUDE_RECON_SQL).toMatch(/AND/);
        });
    });

    describe('decision logic simulated against representative rows', () => {
        test('real strategy trade with valid exit passes', () => {
            expect(isStrategyTrade({
                close_reason: 'take_profit',
                session: 'london',
            })).toBe(true);
        });

        test('orphaned_restart exit is excluded', () => {
            expect(isStrategyTrade({
                close_reason: 'orphaned_restart',
                session: 'london',
            })).toBe(false);
        });

        test('restored entry is excluded even if it closed normally', () => {
            // This is the load-bearing case for v25.5: a position recovered from
            // OANDA on restart that subsequently hits its TP. Pre-v25.5 it
            // would have counted as a real strategy "win". Post-v25.5 it's
            // correctly excluded because the ENTRY wasn't a strategy decision.
            expect(isStrategyTrade({
                close_reason: 'take_profit',
                session: 'restored',
            })).toBe(false);
        });

        test('orphaned_restart AND session=restored both excluded (defensive overlap)', () => {
            expect(isStrategyTrade({
                close_reason: 'orphaned_restart',
                session: 'restored',
            })).toBe(false);
        });

        test('open trade (NULL close_reason) is NOT silently dropped', () => {
            expect(isStrategyTrade({
                close_reason: null,
                session: 'london',
            })).toBe(true);
        });

        test('row with NULL session passes (legacy pre-session-tagging rows)', () => {
            expect(isStrategyTrade({
                close_reason: 'take_profit',
                session: null,
            })).toBe(true);
        });

        test('row with both NULLs passes (legacy data without either column set)', () => {
            expect(isStrategyTrade({
                close_reason: null,
                session: null,
            })).toBe(true);
        });

        test('undefined fields treated same as NULL', () => {
            expect(isStrategyTrade({})).toBe(true);
        });
    });
});
