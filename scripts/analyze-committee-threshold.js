#!/usr/bin/env node
/**
 * One-shot analysis: should we lower the crypto committee threshold from 0.40?
 *
 * Pulls all closed crypto trades from the production API, buckets them by
 * committeeConfidence, and reports win rate / profit factor / EV per bucket.
 *
 * Usage:
 *   node scripts/analyze-committee-threshold.js
 *
 * Caveat: only trades with conf >= historical threshold executed, so we have
 * a SELECTION-BIASED sample. We can't see what would happen below the
 * historical floor — but we CAN see whether the committee score actually
 * predicts winners among trades that did execute.
 */

const https = require('https');

const BASE = 'https://nexus-crypto-bot-production.up.railway.app';
const TRADES_URL = `${BASE}/api/trades?limit=500&bot=crypto`;

const ROUND_TRIP_COST_PCT = 2 * (0.001 + 0.0005); // taker fee + slippage, both ways = 0.30%

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function parseEntryContext(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function pctFmt(n, digits = 1) {
  if (!Number.isFinite(n)) return 'n/a';
  return `${(n * 100).toFixed(digits)}%`;
}

function bucketStats(trades) {
  if (trades.length === 0) {
    return { count: 0, winRate: NaN, avgWinPct: NaN, avgLossPct: NaN, profitFactor: NaN, evPct: NaN, totalPnlUsd: 0 };
  }
  const wins = trades.filter((t) => t.pnlUsd > 0);
  const losses = trades.filter((t) => t.pnlUsd <= 0);
  const totalWin = wins.reduce((s, t) => s + t.pnlUsd, 0);
  const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnlUsd, 0));
  const avgWinPct = wins.length ? wins.reduce((s, t) => s + t.pnlPct, 0) / wins.length : 0;
  const avgLossPct = losses.length ? losses.reduce((s, t) => s + t.pnlPct, 0) / losses.length : 0;
  const winRate = wins.length / trades.length;
  const evPct = winRate * avgWinPct + (1 - winRate) * avgLossPct;
  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;
  return {
    count: trades.length,
    winRate,
    avgWinPct,
    avgLossPct,
    profitFactor,
    evPct,
    evNetOfCostsPct: evPct - ROUND_TRIP_COST_PCT,
    totalPnlUsd: trades.reduce((s, t) => s + t.pnlUsd, 0)
  };
}

async function main() {
  console.log(`\n=== Crypto committee-threshold FP/FN analysis ===`);
  console.log(`Source: ${TRADES_URL}\n`);

  const resp = await get(TRADES_URL);
  if (!resp.trades) throw new Error('Unexpected response shape');

  const closed = resp.trades.filter((t) => t.status === 'closed' && t.pnl_usd != null && t.close_reason !== 'orphaned_restart');
  console.log(`Pulled ${resp.trades.length} trades, ${closed.length} closed with valid pnl`);

  const trades = closed.map((t) => {
    const ctx = parseEntryContext(t.entry_context);
    return {
      id: t.id,
      symbol: t.symbol,
      pnlUsd: parseFloat(t.pnl_usd),
      pnlPct: parseFloat(t.pnl_pct) || 0,
      conf: ctx.committeeConfidence != null ? Number(ctx.committeeConfidence) : null,
      regime: ctx.marketRegime || t.regime,
      tier: t.tier,
      strategy: t.strategy,
      closeReason: t.close_reason,
      exitTime: t.exit_time
    };
  });

  const withConf = trades.filter((t) => t.conf != null && Number.isFinite(t.conf));
  const noConf = trades.filter((t) => t.conf == null || !Number.isFinite(t.conf));
  console.log(`  ${withConf.length} have committeeConfidence, ${noConf.length} missing\n`);

  if (withConf.length === 0) {
    console.log('No trades have committeeConfidence — cannot analyze.');
    return;
  }

  // Confidence distribution
  const confs = withConf.map((t) => t.conf).sort((a, b) => a - b);
  const min = confs[0];
  const max = confs[confs.length - 1];
  const median = confs[Math.floor(confs.length / 2)];
  const mean = confs.reduce((s, c) => s + c, 0) / confs.length;
  console.log(`Confidence distribution (executed trades only):`);
  console.log(`  min=${min.toFixed(3)}  median=${median.toFixed(3)}  mean=${mean.toFixed(3)}  max=${max.toFixed(3)}\n`);

  // Bucket by confidence
  const buckets = [
    { name: '< 0.40',     filter: (t) => t.conf < 0.40 },
    { name: '0.40–0.45',  filter: (t) => t.conf >= 0.40 && t.conf < 0.45 },
    { name: '0.45–0.50',  filter: (t) => t.conf >= 0.45 && t.conf < 0.50 },
    { name: '0.50–0.55',  filter: (t) => t.conf >= 0.50 && t.conf < 0.55 },
    { name: '0.55–0.60',  filter: (t) => t.conf >= 0.55 && t.conf < 0.60 },
    { name: '>= 0.60',    filter: (t) => t.conf >= 0.60 }
  ];

  console.log(`Per-bucket performance (executed trades, sample-biased — see caveat below):`);
  console.log('─'.repeat(110));
  console.log('Bucket        N      WR       AvgWin    AvgLoss    EV (gross)  EV (after 0.30% fees)  PF       Net P&L');
  console.log('─'.repeat(110));
  for (const b of buckets) {
    const sub = withConf.filter(b.filter);
    const s = bucketStats(sub);
    const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : (s.profitFactor === Infinity ? '∞' : '0.00');
    console.log(
      `${b.name.padEnd(13)} ${String(s.count).padStart(3)}    ${pctFmt(s.winRate).padStart(6)}   ` +
      `${pctFmt(s.avgWinPct, 2).padStart(7)}  ${pctFmt(s.avgLossPct, 2).padStart(8)}    ` +
      `${pctFmt(s.evPct, 2).padStart(8)}        ${pctFmt(s.evNetOfCostsPct, 2).padStart(8)}        ` +
      `${pf.padStart(5)}   $${s.totalPnlUsd.toFixed(2)}`
    );
  }
  console.log('─'.repeat(110));
  const all = bucketStats(withConf);
  const pfAll = Number.isFinite(all.profitFactor) ? all.profitFactor.toFixed(2) : (all.profitFactor === Infinity ? '∞' : '0.00');
  console.log(
    `${'ALL'.padEnd(13)} ${String(all.count).padStart(3)}    ${pctFmt(all.winRate).padStart(6)}   ` +
    `${pctFmt(all.avgWinPct, 2).padStart(7)}  ${pctFmt(all.avgLossPct, 2).padStart(8)}    ` +
    `${pctFmt(all.evPct, 2).padStart(8)}        ${pctFmt(all.evNetOfCostsPct, 2).padStart(8)}        ` +
    `${pfAll.padStart(5)}   $${all.totalPnlUsd.toFixed(2)}`
  );
  console.log();

  // Threshold sweep — what does it look like if we drop the floor to X?
  console.log(`Threshold sweep — "what if we accept everything >= T?" (still sample-biased):`);
  console.log('─'.repeat(85));
  console.log('Threshold   N      WR       EV (gross)   EV (after fees)   PF       Net P&L');
  console.log('─'.repeat(85));
  const thresholds = [0.30, 0.35, 0.40, 0.425, 0.45, 0.475, 0.50, 0.525, 0.55, 0.60];
  for (const thresh of thresholds) {
    const sub = withConf.filter((t) => t.conf >= thresh);
    const s = bucketStats(sub);
    const pf = Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : (s.profitFactor === Infinity ? '∞' : '0.00');
    const marker = Math.abs(thresh - 0.40) < 1e-9 ? '  <- current default' : '';
    console.log(
      `>= ${thresh.toFixed(3)}   ${String(s.count).padStart(3)}    ${pctFmt(s.winRate).padStart(6)}   ` +
      `${pctFmt(s.evPct, 2).padStart(8)}     ${pctFmt(s.evNetOfCostsPct, 2).padStart(8)}        ` +
      `${pf.padStart(5)}   $${s.totalPnlUsd.toFixed(2)}${marker}`
    );
  }
  console.log('─'.repeat(85));

  // Caveat reminder
  console.log(`\nCaveat — read this before changing the threshold:`);
  console.log(`• Sample is selection-biased: only signals that BEAT the historical threshold`);
  console.log(`  (which auto-optimizer floats between 0.35–0.55) actually executed.`);
  console.log(`• If the < 0.40 bucket has trades, those came from periods when auto-optimizer`);
  console.log(`  ran below 0.40 — they're real evidence for what flow looks like below the`);
  console.log(`  current default. If empty, you can't infer below-floor behavior from this`);
  console.log(`  data alone — you'd need to lower the floor and run a forward test.`);
  console.log(`• Round-trip cost (~0.30%) subtracted from gross EV. A bucket needs gross EV`);
  console.log(`  comfortably above 0.30% to be net-profitable.`);
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
