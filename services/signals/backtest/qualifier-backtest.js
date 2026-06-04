/**
 * qualifier-backtest.js — FP/FN evaluation for the supplementary entry-qualifier gate.
 *
 * The shared `qualifyEntry` gate (services/signals/entry-qualifier.js) is stubbed off
 * in production (it only loads via the dev-only ../../services/signals block). Before
 * enabling it we must measure — per engineering Rule 4 — how it would have changed which
 * trades executed, and whether the trades it blocks were net winners or losers.
 *
 * Method (faithful replay):
 *   - Every historical EXECUTED trade already passed the inline isCryptoPositiveEV filter,
 *     so this measures qualifyEntry's MARGINAL rejections on top of what's already live.
 *   - Replays trades in chronological order, reconstructing the committee object from the
 *     stored entry_context (committeeConfidence + committeeComponents) — the exact inputs
 *     the live gate saw.
 *   - avgWin/avgLoss are computed from a trailing 50-trade window, mirroring the live
 *     `cryptoEvals.slice(-50)` derivation. Defaults 2.0% / 1.5% until the window fills.
 *   - calibrated = raw confidence (production calibration is passthrough today).
 *
 * Classification of each BLOCKED trade against its realized pnl_usd:
 *   - pnl < 0  → true positive  (gate correctly avoided a loser)
 *   - pnl > 0  → false positive (gate would have skipped a winner)
 *   - pnl == 0 → neutral
 *
 * Pure/deterministic. No DB, no network — caller supplies the trades array.
 */

const { qualifyEntry } = require('../entry-qualifier');

// Crypto cost model (mirrors unified-crypto-bot.js CRYPTO_COSTS / CRYPTO_ROUND_TRIP_COST).
const CRYPTO_ROUND_TRIP_COST = 2 * (0.001 + 0.0005); // 0.30% round trip
const DEFAULTS = Object.freeze({
  threshold: 0.45,            // MIN_SIGNAL_CONFIDENCE
  minPositiveComponents: 2,
  costPct: CRYPTO_ROUND_TRIP_COST * 100,
  window: 50,
  defaultAvgWinPct: 2.0,
  defaultAvgLossPct: 1.5,
});

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * @param {Array<Object>} trades - closed trade rows (must have entry_context, pnl_usd, pnl_pct, entry_time)
 * @param {Object} [opts] - overrides for DEFAULTS
 * @returns {Object} FP/FN report
 */
function backtestQualifier(trades, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };

  // Only trades the gate could actually evaluate (committee data present), chronological.
  const usable = trades
    .filter(t => t && t.entry_context &&
      t.entry_context.committeeConfidence != null &&
      t.entry_context.committeeComponents)
    .slice()
    .sort((a, b) => new Date(a.entry_time || a.created_at) - new Date(b.entry_time || b.created_at));

  const rolling = []; // realized pnlPct (percent, signed) of prior trades, for avgWin/avgLoss
  const blocked = [];
  const kept = [];
  const gateCounts = { threshold: 0, ev: 0, components: 0 };

  for (const t of usable) {
    const win = rolling.slice(-cfg.window).filter(p => p > 0);
    const loss = rolling.slice(-cfg.window).filter(p => p <= 0);
    const avgWinPct = win.length ? win.reduce((s, p) => s + Math.abs(p), 0) / win.length : cfg.defaultAvgWinPct;
    const avgLossPct = loss.length ? loss.reduce((s, p) => s + Math.abs(p), 0) / loss.length : cfg.defaultAvgLossPct;

    const conf = num(t.entry_context.committeeConfidence);
    const committee = {
      confidence: conf,
      calibrated: conf, // production calibration is passthrough
      components: t.entry_context.committeeComponents,
    };
    const verdict = qualifyEntry(
      committee,
      { threshold: cfg.threshold, avgWinPct, avgLossPct, minPositiveComponents: cfg.minPositiveComponents },
      { costPct: cfg.costPct }
    );

    const pnl = num(t.pnl_usd);
    const rec = { id: t.id, symbol: t.symbol, conf, pnl, reason: verdict.reason };

    if (!verdict.qualified) {
      if (/Below threshold/.test(verdict.reason)) gateCounts.threshold++;
      else if (/Negative EV/.test(verdict.reason)) gateCounts.ev++;
      else if (/positive components/.test(verdict.reason)) gateCounts.components++;
      blocked.push(rec);
    } else {
      kept.push(rec);
    }

    // pnl_pct stored as decimal (0.0018 = 0.18%); convert to percent for the trailing window.
    rolling.push(num(t.pnl_pct) * 100);
  }

  const sum = arr => arr.reduce((s, r) => s + r.pnl, 0);
  const wins = arr => arr.filter(r => r.pnl > 0).length;
  const losses = arr => arr.filter(r => r.pnl < 0).length;

  const blockedLosers = losses(blocked);   // true positives
  const blockedWinners = wins(blocked);     // false positives
  const blockedPnl = sum(blocked);
  const keptPnl = sum(kept);
  const totalPnl = blockedPnl + keptPnl;

  const winRate = arr => {
    const w = wins(arr), l = losses(arr), d = w + l;
    return d ? Math.round((w / d) * 1000) / 10 : null;
  };

  return {
    evaluated: usable.length,
    blocked: blocked.length,
    kept: kept.length,
    gateCounts,
    // FP/FN of the block decision (positive class = "should block" = losing trade)
    truePositives: blockedLosers,
    falsePositives: blockedWinners,
    blockPrecisionPct: (blockedLosers + blockedWinners)
      ? Math.round((blockedLosers / (blockedLosers + blockedWinners)) * 1000) / 10
      : null,
    pnl: {
      total: Math.round(totalPnl * 100) / 100,
      blocked: Math.round(blockedPnl * 100) / 100,   // P&L removed if gate enabled
      kept: Math.round(keptPnl * 100) / 100,          // P&L that remains
      improvement: Math.round(-blockedPnl * 100) / 100, // +ve = enabling the gate improves total P&L
    },
    winRate: {
      overall: winRate([...blocked, ...kept]),
      blocked: winRate(blocked),
      kept: winRate(kept),
    },
    blockedSample: blocked.slice(0, 8),
  };
}

module.exports = { backtestQualifier, DEFAULTS };

// CLI: node services/trading/qualifier-backtest.js /tmp/crypto_trades.json
if (require.main === module) {
  const fs = require('fs');
  const path = process.argv[2];
  if (!path) { console.error('usage: node qualifier-backtest.js <trades.json>'); process.exit(1); }
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  const trades = Array.isArray(data) ? data : data.trades;
  const report = backtestQualifier(trades);
  console.log(JSON.stringify(report, null, 2));
}
