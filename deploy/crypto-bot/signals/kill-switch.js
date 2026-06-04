/**
 * kill-switch.js — signal-time enforcement of the `strategy_kill_switches` table.
 *
 * The daily auto-disable cron (POST /api/admin/refresh-kill-switches) flags every
 * (bot, strategy, market_regime) bucket that is statistically losing money over a
 * trailing window (n >= minN AND 95% CI upper bound on pnl_pct < 0), with a TTL.
 *
 * This module lets a bot ENFORCE those flags at signal-build time — but only when
 * ENFORCE_KILL_SWITCHES=true (the bot gates the call; default behaviour is unchanged).
 *
 * Design:
 *   - Read-only; never throws. On any DB error it FAILS OPEN (returns "not killed")
 *     and logs (Rule 8). A transient DB blip must not silently halt all trading — and
 *     the kill-switch is a quality filter, not a safety gate (anti-churning canTrade()
 *     remains the safety floor regardless).
 *   - Cached with a short TTL (default 60s) so we don't hit the DB on every signal; the
 *     source table only changes once a day.
 *   - Match key mirrors the cron's COALESCE exactly: empty/blank strategy -> '(unknown)',
 *     empty/blank regime -> '(any)'. A bucket flagged for the '(any)' regime blocks the
 *     strategy in every regime.
 */

/** Build the canonical "<strategy>|<regime>" key, mirroring the cron's NULLIF/COALESCE. */
function killKey(strategy, regime) {
  const s = strategy != null && String(strategy).trim() ? String(strategy) : '(unknown)';
  const r = regime != null && String(regime).trim() ? String(regime) : '(any)';
  return `${s}|${r}`;
}

/**
 * Pure matcher: is (strategy, regime) killed given the active flag map?
 * @param {Map<string,string|null>} activeMap - key -> reason
 * @returns {{killed: true, key: string, reason: string|null} | null}
 */
function matchKill(activeMap, strategy, regime) {
  if (!activeMap || activeMap.size === 0) return null;
  const exact = killKey(strategy, regime);
  if (activeMap.has(exact)) return { killed: true, key: exact, reason: activeMap.get(exact) };
  const anyRegime = killKey(strategy, '(any)');
  if (anyRegime !== exact && activeMap.has(anyRegime)) {
    return { killed: true, key: anyRegime, reason: activeMap.get(anyRegime) };
  }
  return null;
}

/**
 * Create a cached, DB-backed gate for one bot.
 * @param {{ dbPool: object|null, bot: string, ttlMs?: number }} opts
 */
function createKillSwitchGate({ dbPool, bot, ttlMs = 60000 }) {
  let cache = { at: -Infinity, map: new Map() };

  async function refresh() {
    if (!dbPool) { cache = { at: Date.now(), map: new Map() }; return cache.map; }
    const r = await dbPool.query(
      `SELECT strategy, market_regime, reason
         FROM strategy_kill_switches
        WHERE bot = $1 AND (expires_at IS NULL OR expires_at > NOW())`,
      [bot]
    );
    const map = new Map();
    for (const row of r.rows) map.set(killKey(row.strategy, row.market_regime), row.reason || null);
    cache = { at: Date.now(), map };
    return map;
  }

  async function isKilled(strategy, regime) {
    try {
      if (Date.now() - cache.at > ttlMs) await refresh();
    } catch (e) {
      // Fail open — never block trading on an infra error. Logged, not silent.
      console.warn(`[kill-switch] refresh failed for bot=${bot}: ${e.message}`);
      return null;
    }
    return matchKill(cache.map, strategy, regime);
  }

  return { isKilled, refresh, _cache: () => cache };
}

module.exports = { killKey, matchKill, createKillSwitchGate };
