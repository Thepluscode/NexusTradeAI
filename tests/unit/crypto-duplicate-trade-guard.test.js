/**
 * Tests for the crypto duplicate-open-trade guard (v25.3).
 *
 * The guard is inlined in clients/bot-dashboard/unified-crypto-bot.js in two
 * places — the global `dbCryptoOpen` (~line 800) and the user-scoped
 * `userEngine._dbOpen` (~line 5631) — to prevent the trade fan-out reported by
 * the 2026-05-27 strategy monitor: same (user_id, symbol, decision_run_id)
 * INSERTed more than once.
 *
 * Both guards run a SELECT before the INSERT; if a matching open trade exists,
 * they log a warning and return null without inserting. This test exercises the
 * decision logic (replicated as a pure helper) against a stubbed pg-style pool.
 *
 * Run with:  npx jest tests/unit/crypto-duplicate-trade-guard.test.js --config='{}'
 */

'use strict';

/**
 * Pure-function mirror of the inline guard. Returns true if the trade should
 * be SKIPPED (duplicate exists), false if it should proceed to INSERT.
 */
async function shouldSkipAsDuplicate({ dbPool, userId, symbol, decisionRunId }) {
    if (decisionRunId == null) return false; // can't dedupe without an ID
    const isUserScoped = userId != null;
    const sql = isUserScoped
        ? `SELECT id, entry_time FROM trades WHERE user_id=$1 AND bot='crypto' AND symbol=$2 AND decision_run_id=$3 AND status='open' LIMIT 1`
        : `SELECT id, entry_time FROM trades WHERE bot='crypto' AND symbol=$1 AND decision_run_id=$2 AND status='open' AND user_id IS NULL LIMIT 1`;
    const params = isUserScoped
        ? [userId, symbol, decisionRunId]
        : [symbol, decisionRunId];
    const r = await dbPool.query(sql, params);
    return r.rows.length > 0;
}

function makeStubPool({ existingRows = [] } = {}) {
    const calls = [];
    return {
        calls,
        query: async (sql, params) => {
            calls.push({ sql, params });
            return { rows: existingRows };
        },
    };
}

describe('crypto duplicate-open-trade guard (v25.3)', () => {
    describe('global (legacy, NULL user_id) path', () => {
        test('skips when an existing open trade matches (symbol, decision_run_id)', async () => {
            const pool = makeStubPool({ existingRows: [{ id: 999, entry_time: 'NOW' }] });
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: null, symbol: 'BTC/USD', decisionRunId: 42,
            });
            expect(skip).toBe(true);
            expect(pool.calls).toHaveLength(1);
            expect(pool.calls[0].params).toEqual(['BTC/USD', 42]);
            expect(pool.calls[0].sql).toMatch(/user_id IS NULL/);
        });

        test('proceeds when no existing open trade matches', async () => {
            const pool = makeStubPool({ existingRows: [] });
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: null, symbol: 'ETH/USD', decisionRunId: 99,
            });
            expect(skip).toBe(false);
        });
    });

    describe('user-scoped path', () => {
        test('skips when (user_id, symbol, decision_run_id) matches an open trade', async () => {
            const pool = makeStubPool({ existingRows: [{ id: 5, entry_time: 'NOW' }] });
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: 'user-abc', symbol: 'BTC/USD', decisionRunId: 42,
            });
            expect(skip).toBe(true);
            expect(pool.calls[0].params).toEqual(['user-abc', 'BTC/USD', 42]);
            expect(pool.calls[0].sql).toMatch(/user_id=\$1/);
            expect(pool.calls[0].sql).not.toMatch(/user_id IS NULL/);
        });

        test('proceeds when a DIFFERENT user has the same decision_run_id open', async () => {
            // Multi-tenant: user A's open trade does NOT block user B's INSERT.
            // The SELECT is scoped to userId, so the stub returns [] for user B.
            const pool = makeStubPool({ existingRows: [] });
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: 'user-B', symbol: 'BTC/USD', decisionRunId: 42,
            });
            expect(skip).toBe(false);
        });

        test('proceeds when same user has the same decision_run_id but CLOSED status', async () => {
            // The SELECT filters status='open', so closed trades are not duplicates.
            // The stub returning [] simulates "no OPEN match found."
            const pool = makeStubPool({ existingRows: [] });
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: 'user-abc', symbol: 'BTC/USD', decisionRunId: 42,
            });
            expect(skip).toBe(false);
        });
    });

    describe('missing decision_run_id', () => {
        test('proceeds without querying the database (cannot dedupe by ID)', async () => {
            const pool = makeStubPool({ existingRows: [{ id: 1 }] }); // would match if queried
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: 'user-x', symbol: 'BTC/USD', decisionRunId: null,
            });
            expect(skip).toBe(false);
            expect(pool.calls).toHaveLength(0); // short-circuited before query
        });

        test('treats undefined decisionRunId the same as null', async () => {
            const pool = makeStubPool({ existingRows: [{ id: 1 }] });
            const skip = await shouldSkipAsDuplicate({
                dbPool: pool, userId: 'user-x', symbol: 'BTC/USD', decisionRunId: undefined,
            });
            expect(skip).toBe(false);
            expect(pool.calls).toHaveLength(0);
        });
    });
});
