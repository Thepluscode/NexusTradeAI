/**
 * health-pnl.js — DB-backed P&L + trade-count summary for the bots'
 * unauthenticated GET /api/health/detailed monitoring endpoint.
 *
 * Read-only. One query against the shared `trades` table. Never throws —
 * returns { available: false, error } on any failure so the health endpoint
 * degrades gracefully instead of 500ing (Rule 9: optional dep can't break base).
 *
 * The aggregation intentionally mirrors the existing GET /api/trades/summary
 * contract (status='closed', NaN-guarded pnl_usd, no ghost-exit filter) so the
 * two endpoints can never report disagreeing numbers. "Today" is bucketed by
 * exit_time (fallback created_at) in the DB's timezone, matching how
 * /api/trades/summary groups days.
 *
 * Win rate is winners / (winners + losers) — breakeven trades excluded from the
 * denominator — matching each engine's in-memory getStatus() convention.
 */

function round2(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/**
 * @param {import('pg').Pool|null} dbPool - shared Postgres pool (or null if DB unconfigured)
 * @param {string} bot - 'stock' | 'forex' | 'crypto' (maps to trades.bot)
 * @returns {Promise<{
 *   available: boolean, error?: string,
 *   pnlToday: number, pnlTotal: number,
 *   tradesToday: number, tradesTotal: number,
 *   winnersTotal: number, losersTotal: number,
 *   winRatePct: number|null, openPositions: number
 * }>}
 */
async function getPnlSummary(dbPool, bot) {
  const empty = {
    available: false,
    pnlToday: 0,
    pnlTotal: 0,
    tradesToday: 0,
    tradesTotal: 0,
    winnersTotal: 0,
    losersTotal: 0,
    winRatePct: null,
    openPositions: 0,
  };

  if (!dbPool) return { ...empty, error: 'DB not configured' };
  if (!bot) return { ...empty, error: 'bot name required' };

  try {
    // Same NaN guard /api/trades/summary uses — pnl_usd can carry a 'NaN' text value.
    const cleanPnl = `CASE WHEN pnl_usd IS NULL OR pnl_usd::text = 'NaN' THEN 0 ELSE pnl_usd END`;
    const isToday = `DATE(COALESCE(exit_time, created_at)) = CURRENT_DATE`;

    const r = await dbPool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='open')                                            AS open_positions,
         COUNT(*) FILTER (WHERE status='closed')                                          AS trades_total,
         COUNT(*) FILTER (WHERE status='closed' AND ${isToday})                           AS trades_today,
         COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} > 0)                      AS winners_total,
         COUNT(*) FILTER (WHERE status='closed' AND ${cleanPnl} < 0)                      AS losers_total,
         COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed'), 0)::FLOAT              AS pnl_total,
         COALESCE(SUM(${cleanPnl}) FILTER (WHERE status='closed' AND ${isToday}), 0)::FLOAT AS pnl_today
       FROM trades
       WHERE bot=$1`,
      [bot]
    );

    const row = r.rows[0] || {};
    const winners = toInt(row.winners_total);
    const losers = toInt(row.losers_total);
    const decided = winners + losers;

    return {
      available: true,
      pnlToday: round2(row.pnl_today),
      pnlTotal: round2(row.pnl_total),
      tradesToday: toInt(row.trades_today),
      tradesTotal: toInt(row.trades_total),
      winnersTotal: winners,
      losersTotal: losers,
      winRatePct: decided > 0 ? Math.round((winners / decided) * 1000) / 10 : null,
      openPositions: toInt(row.open_positions),
    };
  } catch (e) {
    // Rule 8 — never fail silently. Surface in logs AND in the response payload.
    console.warn(`[health-pnl] P&L summary query failed for bot='${bot}': ${e.message}`);
    return { ...empty, error: e.message };
  }
}

module.exports = { getPnlSummary };
