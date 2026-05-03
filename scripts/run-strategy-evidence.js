#!/usr/bin/env node
/**
 * Run walk-forward validation on a registered strategy and insert evidence
 * rows into Postgres so STRATEGY_EVIDENCE_GATE has data to enforce against.
 *
 * Reads:
 *   - Strategy module from services/signals/strategies/{name}.js
 *   - Historical bars from broker API (Alpaca / Kraken / OANDA) via DataLoader
 *
 * Writes:
 *   - One row in `backtest_results` (gate-A summary across all OOS folds)
 *   - One row per fold in `walk_forward_results` (gate-B detail)
 *
 * Usage:
 *   DATABASE_URL=postgres://... ALPACA_API_KEY=... ALPACA_SECRET_KEY=... \
 *     node scripts/run-strategy-evidence.js \
 *       --strategy stockOrb --symbol AAPL --days 30 --interval 5m
 *
 * Required env (depending on asset class):
 *   - DATABASE_URL                                (always; --dry-run to skip)
 *   - ALPACA_API_KEY, ALPACA_SECRET_KEY           (stock)
 *   - OANDA_API_TOKEN                             (forex)
 *   - (Kraken public OHLC needs no key)            (crypto)
 *
 * Flags:
 *   --strategy <name>         stockOrb | stockVwapReversal | cryptoMomentum |
 *                             forexLondonBreakout | _stub  (REQUIRED)
 *   --symbol <symbol>         e.g. AAPL, BTCUSD, EUR_USD            (REQUIRED)
 *   --days <int>              days of history (default 30)
 *   --interval <str>          1m | 5m | 15m | 1h | 4h | 1D (default 5m)
 *   --train-bars <int>        walk-forward train window  (default 1000)
 *   --test-bars <int>         walk-forward test window   (default 250)
 *   --max-hold-bars <int>     max bars per simulated trade (default 60)
 *   --dry-run                 don't connect to DB, just print payloads
 *   --verbose                 print per-fold breakdown
 */

'use strict';

const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const STRATEGIES_DIR = path.join(REPO_ROOT, 'services/signals/strategies');

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        out[key] = true;
      } else {
        out[key] = next;
        i++;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// Map DataLoader bar shape ({time,open,high,...}) → harness shape ({t,o,h,l,c,v})
function normalizeBars(rawBars) {
  if (!Array.isArray(rawBars)) return [];
  return rawBars
    .map(b => {
      if (b == null) return null;
      const o = Number(b.open ?? b.o);
      const h = Number(b.high ?? b.h);
      const l = Number(b.low ?? b.l);
      const c = Number(b.close ?? b.c);
      const v = Number(b.volume ?? b.v ?? 0);
      const t = b.time ?? b.t ?? null;
      if (![o, h, l, c].every(Number.isFinite)) return null;
      return { t, o, h, l, c, v };
    })
    .filter(Boolean);
}

// Deterministic run id so re-running for the same (strategy, symbol, day) replaces cleanly
function buildRunId(strategy, symbol, interval) {
  const date = new Date().toISOString().split('T')[0];
  return `${strategy}_${symbol}_${interval}_${date}`;
}

// Backtest_results row payload — one row aggregating all OOS folds.
function buildBacktestRow({ strategy, assetClass, harnessResult, dateRangeStart, dateRangeEnd, coverage }) {
  const summary = harnessResult.summary || {};
  const oosTrades = harnessResult.allTrades || [];
  const winRate = summary.oosWinRate != null ? Number(summary.oosWinRate) : 0;
  const profitFactor = summary.oosProfitFactor != null
    ? Number(summary.oosProfitFactor)
    : (() => {
      const wins = oosTrades.filter(t => (t.pnl ?? t.totalPnl ?? 0) > 0).reduce((s, t) => s + (t.pnl ?? 0), 0);
      const losses = Math.abs(oosTrades.filter(t => (t.pnl ?? 0) <= 0).reduce((s, t) => s + (t.pnl ?? 0), 0));
      return losses > 0 ? wins / losses : (wins > 0 ? 10 : 0);
    })();
  const passedGateA = harnessResult.gateA?.passed === true;
  const passedWalkForward = harnessResult.gateB?.passed === true;

  return {
    strategy_name: strategy,
    asset_class: assetClass,
    date_range_start: dateRangeStart,
    date_range_end: dateRangeEnd,
    trade_count: oosTrades.length,
    win_rate: Number(winRate.toFixed(4)),
    profit_factor: Number(profitFactor.toFixed(2)),
    sharpe: summary.oosSharpe != null ? Number(summary.oosSharpe.toFixed(2)) : 0,
    max_drawdown_pct: summary.oosMaxDrawdown != null ? Number(summary.oosMaxDrawdown.toFixed(2)) : 0,
    coverage,
    passed_gate_a: passedGateA,
    passed_walk_forward: passedWalkForward,
    trades_sample: oosTrades.slice(0, 20)
  };
}

// One walk_forward_results row per fold.
function buildWalkForwardRows({ strategy, assetClass, harnessResult, runId }) {
  return (harnessResult.folds || []).map(fold => ({
    strategy_name: strategy,
    asset_class: assetClass,
    fold_index: fold.foldIndex,
    train_sharpe: fold.inSample?.sharpe != null ? Number(fold.inSample.sharpe.toFixed(3)) : 0,
    test_sharpe: fold.outOfSample?.sharpe != null ? Number(fold.outOfSample.sharpe.toFixed(3)) : 0,
    sharpe_decay: (fold.inSample?.sharpe != null && fold.outOfSample?.sharpe != null)
      ? Number((fold.inSample.sharpe - fold.outOfSample.sharpe).toFixed(3))
      : 0,
    test_win_rate: fold.outOfSample?.winRate != null ? Number(fold.outOfSample.winRate.toFixed(4)) : 0,
    test_profit_factor: fold.outOfSample?.profitFactor != null ? Number(fold.outOfSample.profitFactor.toFixed(3)) : 0,
    test_trade_count: fold.outOfSample?.tradeCount ?? 0,
    test_total_pnl: fold.outOfSample?.totalPnl != null ? Number(fold.outOfSample.totalPnl.toFixed(4)) : 0,
    test_max_drawdown_pct: fold.outOfSample?.maxDrawdownPct != null ? Number(fold.outOfSample.maxDrawdownPct.toFixed(3)) : 0,
    run_id: runId
  }));
}

async function insertEvidence(dbPool, backtestRow, walkForwardRows) {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    // Delete prior rows for this run_id so reruns are idempotent
    if (walkForwardRows.length > 0) {
      await client.query(
        `DELETE FROM walk_forward_results WHERE strategy_name = $1 AND asset_class = $2 AND run_id = $3`,
        [walkForwardRows[0].strategy_name, walkForwardRows[0].asset_class, walkForwardRows[0].run_id]
      );
    }
    await client.query(
      `INSERT INTO backtest_results
         (strategy_name, asset_class, date_range_start, date_range_end, trade_count,
          win_rate, profit_factor, sharpe, max_drawdown_pct, coverage,
          passed_gate_a, passed_walk_forward, trades_sample)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        backtestRow.strategy_name, backtestRow.asset_class,
        backtestRow.date_range_start, backtestRow.date_range_end,
        backtestRow.trade_count, backtestRow.win_rate, backtestRow.profit_factor,
        backtestRow.sharpe, backtestRow.max_drawdown_pct, backtestRow.coverage,
        backtestRow.passed_gate_a, backtestRow.passed_walk_forward,
        JSON.stringify(backtestRow.trades_sample || [])
      ]
    );
    for (const r of walkForwardRows) {
      await client.query(
        `INSERT INTO walk_forward_results
           (strategy_name, asset_class, fold_index, train_sharpe, test_sharpe, sharpe_decay,
            test_win_rate, test_profit_factor, test_trade_count, test_total_pnl,
            test_max_drawdown_pct, run_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          r.strategy_name, r.asset_class, r.fold_index,
          r.train_sharpe, r.test_sharpe, r.sharpe_decay,
          r.test_win_rate, r.test_profit_factor, r.test_trade_count,
          r.test_total_pnl, r.test_max_drawdown_pct, r.run_id
        ]
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const strategyName = args.strategy;
  const symbol = args.symbol;
  const days = parseInt(args.days, 10) || 30;
  const interval = args.interval || '5m';
  const trainBars = parseInt(args['train-bars'], 10) || 1000;
  const testBars = parseInt(args['test-bars'], 10) || 250;
  const maxHoldBars = parseInt(args['max-hold-bars'], 10) || 60;
  const dryRun = args['dry-run'] === true;
  const verbose = args.verbose === true;

  if (!strategyName || !symbol) {
    console.error('ERROR: --strategy and --symbol are required.');
    console.error('Try: node scripts/run-strategy-evidence.js --strategy stockOrb --symbol AAPL --days 30');
    process.exit(2);
  }

  // Load strategy
  let strategy;
  try {
    strategy = require(path.join(STRATEGIES_DIR, `${strategyName}.js`));
  } catch (e) {
    // Try kebab-case (modules are kebab-case but registry uses camelCase)
    const kebab = strategyName.replace(/[A-Z]/g, ch => '-' + ch.toLowerCase()).replace(/^-/, '');
    try {
      strategy = require(path.join(STRATEGIES_DIR, `${kebab}.js`));
    } catch (e2) {
      console.error(`ERROR: cannot load strategy "${strategyName}". Tried both ${strategyName}.js and ${kebab}.js`);
      console.error(`Available strategies: ${require('fs').readdirSync(STRATEGIES_DIR).filter(f => f.endsWith('.js') && f !== 'index.js').join(', ')}`);
      process.exit(2);
    }
  }
  if (typeof strategy.evaluate !== 'function') {
    console.error(`ERROR: strategy "${strategyName}" does not export an evaluate(bars, context) function`);
    process.exit(2);
  }

  // Resolve bot/asset class
  const assetClass = strategy.assetClass || 'stock';
  const botMap = { stock: 'stock', forex: 'forex', crypto: 'crypto' };
  const bot = botMap[assetClass];
  if (!bot) {
    console.error(`ERROR: unknown assetClass on strategy "${strategyName}": ${assetClass}`);
    process.exit(2);
  }

  console.log(`\n=== Strategy Evidence Run ===`);
  console.log(`  strategy: ${strategy.name || strategyName}`);
  console.log(`  symbol:   ${symbol}`);
  console.log(`  asset:    ${assetClass} (bot: ${bot})`);
  console.log(`  bars:     last ${days} days @ ${interval}`);
  console.log(`  walk-fwd: train=${trainBars} bars, test=${testBars} bars`);
  console.log(`  dry-run:  ${dryRun ? 'YES (no DB writes)' : 'no'}\n`);

  // Load bars
  const { DataLoader } = require(path.join(REPO_ROOT, 'services/backtesting-js/data-loader.js'));
  const loader = new DataLoader();
  let loadResult;
  try {
    loadResult = await loader.loadBars(bot, symbol, interval, days);
  } catch (e) {
    console.error(`ERROR: failed to load bars: ${e.message}`);
    if (/credential|API key|key|token/i.test(e.message)) {
      console.error(`Hint: ${bot} requires API credentials in env. See script header.`);
    }
    process.exit(1);
  }
  const bars = normalizeBars(loadResult?.bars || loadResult);
  if (loadResult?.cached) console.log(`(bars loaded from local cache)`);
  console.log(`Loaded ${bars.length} bars.`);
  if (bars.length < trainBars + testBars + 30) {
    console.error(`ERROR: only ${bars.length} bars available; need ≥ ${trainBars + testBars + 30}.`);
    console.error(`Hint: increase --days or use a smaller --train-bars/--test-bars window.`);
    process.exit(1);
  }

  // Run harness
  const { walkForward } = require(path.join(REPO_ROOT, 'services/signals/backtest/walk-forward-harness.js'));
  const harnessResult = walkForward(strategy, bars, {
    trainBars, testBars, assetClass, lookback: 30, maxHoldBars
  });

  // Print summary
  const s = harnessResult.summary || {};
  console.log(`\n=== Walk-Forward Summary ===`);
  console.log(`  folds:           ${s.foldCount}`);
  console.log(`  total OOS trades: ${s.totalOOSTrades}`);
  console.log(`  OOS win rate:    ${(s.oosWinRate * 100).toFixed(1)}%`);
  console.log(`  OOS sharpe:      ${(s.oosSharpe || 0).toFixed(2)}`);
  console.log(`  OOS max DD:      ${(s.oosMaxDrawdown || 0).toFixed(2)}%`);
  console.log(`  OOS total P&L:   ${(s.oosTotalPnl || 0).toFixed(2)}`);
  console.log(`  Gate A passed:   ${s.passedGateA}`);
  console.log(`  Gate B passed:   ${s.passedGateB}`);
  console.log(`  Verdict:         ${s.verdict}`);

  if (verbose) {
    console.log(`\n=== Per-Fold Detail ===`);
    for (const f of harnessResult.folds || []) {
      console.log(`  fold ${f.foldIndex}: in-sample sharpe=${(f.inSample.sharpe || 0).toFixed(2)} | OOS sharpe=${(f.outOfSample.sharpe || 0).toFixed(2)} | OOS trades=${f.outOfSample.tradeCount} | OOS PnL=${(f.outOfSample.totalPnl || 0).toFixed(2)}`);
    }
  }

  // Build payloads
  const dateRangeStart = bars[0]?.t ? String(bars[0].t).split('T')[0] : null;
  const dateRangeEnd = bars[bars.length - 1]?.t ? String(bars[bars.length - 1].t).split('T')[0] : null;
  const coverage = Math.min(1, bars.length / (trainBars + testBars * 5));
  const runId = buildRunId(strategyName, symbol, interval);

  const backtestRow = buildBacktestRow({
    strategy: strategyName, assetClass, harnessResult,
    dateRangeStart, dateRangeEnd, coverage: Number(coverage.toFixed(3))
  });
  const walkForwardRows = buildWalkForwardRows({
    strategy: strategyName, assetClass, harnessResult, runId
  });

  if (dryRun) {
    console.log(`\n=== DRY RUN — would insert ===`);
    console.log(`backtest_results: 1 row`);
    console.log(JSON.stringify(backtestRow, null, 2));
    console.log(`walk_forward_results: ${walkForwardRows.length} rows`);
    if (walkForwardRows.length > 0) console.log(JSON.stringify(walkForwardRows[0], null, 2));
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.error(`ERROR: DATABASE_URL not set. Use --dry-run to skip DB writes.`);
    process.exit(1);
  }

  const { Pool } = require('pg');
  const dbPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  try {
    await insertEvidence(dbPool, backtestRow, walkForwardRows);
    console.log(`\n=== Inserted ===`);
    console.log(`  1 backtest_results row`);
    console.log(`  ${walkForwardRows.length} walk_forward_results rows`);
    console.log(`  run_id: ${runId}`);
  } finally {
    await dbPool.end();
  }
}

// Export pure helpers for tests
module.exports = {
  parseArgs,
  normalizeBars,
  buildRunId,
  buildBacktestRow,
  buildWalkForwardRows
};

if (require.main === module) {
  main().catch(e => {
    console.error('FAILED:', e.message);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  });
}
