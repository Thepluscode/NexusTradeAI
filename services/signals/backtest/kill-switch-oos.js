/**
 * kill-switch-oos.js — out-of-sample walk-forward evaluation of kill-switch enforcement.
 *
 * Answers the gating question before we enforce: "if the bot had skipped every trade
 * whose (strategy, market_regime) bucket was flagged at that moment, using ONLY data
 * available before the trade, would held-out P&L have improved?"
 *
 * Walk-forward (zero look-ahead): trades are processed in entry-time order. For each
 * trade, the flag set is recomputed from the trades that CLOSED in the trailing
 * `windowDays` BEFORE this trade's entry — exactly the information the daily cron would
 * have had. A bucket is flagged when n >= minN AND the 95% CI upper bound on pnl_pct < 0,
 * the identical statistic to POST /api/admin/refresh-kill-switches
 * (avg + 1.96 * sample_stddev / sqrt(n) < 0). Every decision is therefore out-of-sample.
 *
 * Pure/deterministic. No DB, no network.
 */

const Z_95 = 1.96;
const DAY_MS = 24 * 60 * 60 * 1000;

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : NaN; }
function bucketKey(strategy, regime) {
  const s = strategy != null && String(strategy).trim() ? String(strategy) : '(unknown)';
  const r = regime != null && String(regime).trim() ? String(regime) : '(any)';
  return `${s}|${r}`;
}
function closeTime(t) { return new Date(t.exit_time || t.created_at || t.entry_time).getTime(); }
function entryTime(t) { return new Date(t.entry_time || t.created_at).getTime(); }

/** Sample standard deviation (n-1 denominator), matching Postgres STDDEV. */
function sampleStd(xs, mean) {
  if (xs.length < 2) return 0;
  const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

/** 95% CI upper bound on the mean of pnl_pct values — flagged-losing when < 0. */
function ciUpper(pnlPcts) {
  const n = pnlPcts.length;
  if (n === 0) return null;
  const mean = pnlPcts.reduce((s, x) => s + x, 0) / n;
  const sd = sampleStd(pnlPcts, mean);
  return mean + Z_95 * sd / Math.sqrt(n);
}

/**
 * @param {Array<Object>} trades - closed trade rows (strategy, market_regime, pnl_usd, pnl_pct, entry_time, exit_time)
 * @param {{windowDays?: number, minN?: number}} [opts]
 */
function backtestKillSwitchOOS(trades, opts = {}) {
  const windowDays = opts.windowDays ?? 30;
  const minN = opts.minN ?? 30;
  const windowMs = windowDays * DAY_MS;

  // Usable = closed trades with the fields the gate keys on. Chronological by entry.
  const usable = trades
    .filter(t => t && (t.status == null || t.status === 'closed') &&
      Number.isFinite(num(t.pnl_usd)) && Number.isFinite(num(t.pnl_pct)) &&
      (t.entry_time || t.created_at))
    .slice()
    .sort((a, b) => entryTime(a) - entryTime(b));

  const blocked = [];
  const kept = [];

  for (let i = 0; i < usable.length; i++) {
    const t = usable[i];
    const tEntry = entryTime(t);

    // Trailing window: trades that CLOSED strictly before this trade's entry, within windowDays.
    // Grouped by bucket → pnl_pct samples.
    const buckets = new Map();
    for (let j = 0; j < i; j++) {
      const p = usable[j];
      const pClose = closeTime(p);
      if (pClose >= tEntry) continue;          // not yet closed at decision time → unknown
      if (pClose < tEntry - windowMs) continue; // outside trailing window
      const k = bucketKey(p.strategy, p.market_regime);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(num(p.pnl_pct));
    }

    const k = bucketKey(t.strategy, t.market_regime);
    const samples = buckets.get(k) || [];
    const n = samples.length;
    const upper = n >= minN ? ciUpper(samples) : null;
    const isKilled = n >= minN && upper != null && upper < 0;

    const rec = { id: t.id, symbol: t.symbol, bucket: k, n, ciUpper: upper, pnl: num(t.pnl_usd) };
    (isKilled ? blocked : kept).push(rec);
  }

  const sum = arr => Math.round(arr.reduce((s, r) => s + r.pnl, 0) * 100) / 100;
  const wins = arr => arr.filter(r => r.pnl > 0).length;
  const losses = arr => arr.filter(r => r.pnl < 0).length;
  const winRate = arr => { const w = wins(arr), l = losses(arr), d = w + l; return d ? Math.round((w / d) * 1000) / 10 : null; };

  const blockedLosers = losses(blocked);
  const blockedWinners = wins(blocked);

  return {
    params: { windowDays, minN },
    evaluated: usable.length,
    blocked: blocked.length,
    kept: kept.length,
    // FP/FN of the block decision on held-out trades (positive class = "should block" = loser)
    truePositives: blockedLosers,
    falsePositives: blockedWinners,
    blockPrecisionPct: (blockedLosers + blockedWinners)
      ? Math.round((blockedLosers / (blockedLosers + blockedWinners)) * 1000) / 10 : null,
    pnl: {
      total: sum([...blocked, ...kept]),
      blocked: sum(blocked),               // removed if enforced
      kept: sum(kept),                     // remains if enforced
      improvement: -sum(blocked),          // +ve ⇒ enforcing improved held-out P&L
    },
    winRate: { overall: winRate([...blocked, ...kept]), blocked: winRate(blocked), kept: winRate(kept) },
    blockedSample: blocked.slice(0, 8),
  };
}

module.exports = { backtestKillSwitchOOS, ciUpper, sampleStd, bucketKey };

// CLI: node services/signals/backtest/kill-switch-oos.js /tmp/crypto_trades.json [windowDays] [minN]
if (require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  if (!path) { console.error('usage: kill-switch-oos.js <trades.json> [windowDays] [minN]'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const trades = Array.isArray(data) ? data : data.trades;
  const opts = {};
  if (process.argv[3]) opts.windowDays = parseInt(process.argv[3], 10);
  if (process.argv[4]) opts.minN = parseInt(process.argv[4], 10);
  console.log(JSON.stringify(backtestKillSwitchOOS(trades, opts), null, 2));
}
