#!/usr/bin/env node
/**
 * Diagnose: WHY do high-confidence crypto trades lose money?
 * Hypothesis: not the entry — the exit logic. High-conf trades sit for 8h
 * and get time-stopped at small losses while low-conf trades happen to
 * exit faster.
 *
 * Pulls all closed crypto trades and for each confidence bucket reports:
 *   - Distribution of close_reason
 *   - Avg / median hold time
 *   - WR and avg PnL split by close_reason
 */

const https = require('https');

const TRADES_URL = 'https://nexus-crypto-bot-production.up.railway.app/api/trades?limit=500&bot=crypto';

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function parseCtx(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return {}; }
}

function classifyReason(close_reason) {
  if (!close_reason) return 'unknown';
  const r = close_reason.toLowerCase();
  if (r.includes('stop loss')) return 'stop_loss';
  if (r.includes('take profit')) return 'take_profit';
  if (r.includes('time stop')) return 'time_stop';
  if (r.includes('max hold')) return 'max_hold';
  if (r.includes('trailing')) return 'trailing_stop';
  if (r.includes('momentum reversal')) return 'momentum_reversal';
  if (r.includes('end of day')) return 'eod';
  if (r.includes('manual')) return 'manual';
  if (r.includes('orphan')) return 'orphaned';
  return 'other';
}

function fmtPct(n, d = 1) {
  return Number.isFinite(n) ? `${(n * 100).toFixed(d)}%` : 'n/a';
}
function fmtUsd(n) {
  return `$${n.toFixed(2)}`;
}
function fmtHours(ms) {
  return `${(ms / 1000 / 60 / 60).toFixed(1)}h`;
}

async function main() {
  console.log(`\n=== WHY do high-confidence crypto trades lose? Exit-reason diagnosis ===\n`);
  const resp = await get(TRADES_URL);
  const closed = resp.trades.filter((t) => t.status === 'closed' && t.pnl_usd != null && t.close_reason !== 'orphaned_restart');

  const trades = closed.map((t) => {
    const ctx = parseCtx(t.entry_context);
    const entryMs = t.entry_time ? new Date(t.entry_time).getTime() : 0;
    const exitMs = t.exit_time ? new Date(t.exit_time).getTime() : 0;
    return {
      symbol: t.symbol,
      pnlUsd: parseFloat(t.pnl_usd),
      pnlPct: parseFloat(t.pnl_pct) || 0,
      conf: ctx.committeeConfidence != null ? Number(ctx.committeeConfidence) : null,
      closeReason: t.close_reason,
      reasonClass: classifyReason(t.close_reason),
      holdMs: exitMs - entryMs,
      win: parseFloat(t.pnl_usd) > 0
    };
  }).filter((t) => t.conf != null && Number.isFinite(t.conf));

  const buckets = [
    { name: '0.40–0.45',  filter: (t) => t.conf >= 0.40 && t.conf < 0.45 },
    { name: '0.45–0.50',  filter: (t) => t.conf >= 0.45 && t.conf < 0.50 },
    { name: '0.50–0.55',  filter: (t) => t.conf >= 0.50 && t.conf < 0.55 },
    { name: '>= 0.55',    filter: (t) => t.conf >= 0.55 }
  ];

  // ── Section 1: close-reason distribution per bucket ──
  console.log('Close-reason distribution per confidence bucket:');
  console.log('─'.repeat(110));
  console.log('Bucket        N    stop_loss   take_profit   time_stop   max_hold   trailing   reversal   eod   other');
  console.log('─'.repeat(110));
  for (const b of buckets) {
    const sub = trades.filter(b.filter);
    if (sub.length === 0) {
      console.log(`${b.name.padEnd(13)} ${String(sub.length).padStart(3)}     —`);
      continue;
    }
    const counts = {};
    for (const t of sub) counts[t.reasonClass] = (counts[t.reasonClass] || 0) + 1;
    const f = (k) => {
      const n = counts[k] || 0;
      return n === 0 ? '   .   ' : `${String(n).padStart(2)} (${(n / sub.length * 100).toFixed(0).padStart(2)}%)`;
    };
    console.log(
      `${b.name.padEnd(13)} ${String(sub.length).padStart(3)}  ${f('stop_loss').padEnd(11)} ${f('take_profit').padEnd(13)} ${f('time_stop').padEnd(11)} ${f('max_hold').padEnd(10)} ${f('trailing_stop').padEnd(10)} ${f('momentum_reversal').padEnd(10)} ${f('eod').padEnd(5)} ${f('other')}`
    );
  }
  console.log();

  // ── Section 2: avg hold time + win rate per bucket ──
  console.log('Hold time + WR per bucket:');
  console.log('─'.repeat(75));
  console.log('Bucket        N    Avg Hold   Median Hold   WR       Avg PnL %');
  console.log('─'.repeat(75));
  for (const b of buckets) {
    const sub = trades.filter(b.filter);
    if (sub.length === 0) continue;
    const holds = sub.map((t) => t.holdMs).sort((a, b) => a - b);
    const avgHold = holds.reduce((s, h) => s + h, 0) / holds.length;
    const medianHold = holds[Math.floor(holds.length / 2)];
    const wins = sub.filter((t) => t.win);
    const wr = wins.length / sub.length;
    const avgPnlPct = sub.reduce((s, t) => s + t.pnlPct, 0) / sub.length;
    console.log(
      `${b.name.padEnd(13)} ${String(sub.length).padStart(3)}   ${fmtHours(avgHold).padStart(6)}      ${fmtHours(medianHold).padStart(6)}     ${fmtPct(wr).padStart(6)}    ${fmtPct(avgPnlPct, 2).padStart(7)}`
    );
  }
  console.log();

  // ── Section 3: per close-reason — WR + avg P&L across all confidence ──
  console.log('Per close-reason, all confidence buckets combined:');
  console.log('─'.repeat(75));
  console.log('Reason             N    WR       Avg PnL %     Total $ P&L     Avg Hold');
  console.log('─'.repeat(75));
  const reasonClasses = [...new Set(trades.map((t) => t.reasonClass))].sort();
  for (const rc of reasonClasses) {
    const sub = trades.filter((t) => t.reasonClass === rc);
    const wins = sub.filter((t) => t.win);
    const wr = wins.length / sub.length;
    const avgPnlPct = sub.reduce((s, t) => s + t.pnlPct, 0) / sub.length;
    const totalUsd = sub.reduce((s, t) => s + t.pnlUsd, 0);
    const avgHold = sub.reduce((s, t) => s + t.holdMs, 0) / sub.length;
    console.log(
      `${rc.padEnd(18)} ${String(sub.length).padStart(3)}    ${fmtPct(wr).padStart(6)}    ${fmtPct(avgPnlPct, 2).padStart(7)}      ${fmtUsd(totalUsd).padStart(10)}     ${fmtHours(avgHold)}`
    );
  }
  console.log();

  // ── Section 4: cross-tab — for each bucket, P&L of "winning exit reasons" vs "losing exit reasons" ──
  console.log('Cross-tab: WR + avg P&L by (bucket × close_reason class):');
  console.log('─'.repeat(110));
  console.log('Bucket × Reason                    N    WR       Avg PnL %     Net $');
  console.log('─'.repeat(110));
  for (const b of buckets) {
    const sub = trades.filter(b.filter);
    if (sub.length === 0) continue;
    const reasons = [...new Set(sub.map((t) => t.reasonClass))].sort();
    for (const rc of reasons) {
      const cell = sub.filter((t) => t.reasonClass === rc);
      if (cell.length === 0) continue;
      const wins = cell.filter((t) => t.win);
      const wr = wins.length / cell.length;
      const avgPnlPct = cell.reduce((s, t) => s + t.pnlPct, 0) / cell.length;
      const totalUsd = cell.reduce((s, t) => s + t.pnlUsd, 0);
      console.log(
        `  ${b.name.padEnd(11)} × ${rc.padEnd(18)} ${String(cell.length).padStart(3)}    ${fmtPct(wr).padStart(6)}    ${fmtPct(avgPnlPct, 2).padStart(7)}    ${fmtUsd(totalUsd)}`
      );
    }
    console.log();
  }
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
