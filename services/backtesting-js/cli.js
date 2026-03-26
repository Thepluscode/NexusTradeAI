#!/usr/bin/env node
const { DataLoader } = require('./data-loader');
const { ReplayEngine } = require('./replay-engine');
const { Analytics } = require('./analytics');
const signals = require('../signals');

const args = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith('--')) {
    const key = args[i].replace('--', '');
    flags[key] = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
    if (flags[key] !== true) i++;
  }
}

const bot = flags.bot || 'crypto';
const days = parseInt(flags.days) || 60;
const timeframe = flags.timeframe || '5m';
const threshold = parseFloat(flags.threshold) || 0.45;
const fullAnalysis = flags['full-analysis'] || false;
const sweepRange = flags['sweep-threshold'];

const SYMBOLS = {
  stock: ['AAPL', 'TSLA', 'NVDA', 'AMD', 'MSFT', 'GOOGL', 'AMZN', 'META'],
  forex: ['EUR_USD', 'GBP_USD', 'USD_JPY', 'AUD_USD', 'USD_CAD', 'NZD_USD'],
  crypto: ['BTCUSD', 'ETHUSD', 'SOLUSD', 'ADAUSD']
};

async function main() {
  console.log(`\n=== NexusTradeAI Backtester ===`);
  console.log(`Bot: ${bot} | Days: ${days} | Timeframe: ${timeframe} | Threshold: ${threshold}\n`);

  const loader = new DataLoader();
  const analytics = new Analytics();
  const botConfig = signals.BOT_COMPONENTS[bot];
  const symbols = SYMBOLS[bot] || SYMBOLS.crypto;

  const allTrades = [];

  for (const symbol of symbols) {
    process.stdout.write(`Loading ${symbol}...`);
    try {
      const data = await loader.loadMultiTimeframeBars(bot, symbol, days);
      if (data.m5.length < 50) {
        console.log(` skipped (${data.m5.length} bars)`);
        continue;
      }
      data.symbol = symbol;

      const engine = new ReplayEngine({ bot, threshold, botConfig });
      const result = engine.replay(data);
      allTrades.push(...result.trades);
      console.log(` ${result.trades.length} trades (${result.summary.winRate ? (result.summary.winRate * 100).toFixed(0) : 0}% WR)`);
    } catch (err) {
      console.log(` ERROR: ${err.message}`);
    }
  }

  console.log(`\n--- Summary: ${allTrades.length} total trades ---\n`);

  if (allTrades.length === 0) {
    console.log('No trades generated. Try lowering --threshold or increasing --days.');
    return;
  }

  // Noise report
  const report = analytics.generateNoiseReport(allTrades, botConfig.components);

  console.log('Component Rankings (by IC):');
  for (const c of report.componentRankings) {
    const tag = c.classification === 'signal' ? 'SIG' : c.classification === 'noise' ? 'NOI' : c.classification === 'weak' ? 'WEK' : '???';
    console.log(`  [${tag}] ${c.name.padEnd(16)} IC: ${c.ic.toFixed(3).padStart(7)}  p: ${c.pValue.toFixed(3)}  [${c.classification}]`);
  }

  if (report.redundantPairs.length > 0) {
    console.log('\nRedundant Pairs:');
    for (const p of report.redundantPairs) {
      console.log(`  ${p.a} <-> ${p.b} (r=${p.r}) -- ${p.recommendation}`);
    }
  }

  if (report.recommendations.length > 0) {
    console.log('\nRecommendations:');
    for (const rec of report.recommendations) {
      console.log(`  -> ${rec}`);
    }
  }

  if (report.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of report.warnings) {
      console.log(`  [WARN] ${w}`);
    }
  }

  // Threshold sweep
  if (sweepRange || fullAnalysis) {
    console.log('\n--- Threshold Sweep ---\n');
    const [min, max, step] = (sweepRange || '0.30,0.70,0.05').split(',').map(Number);
    console.log('Threshold  Trades  WinRate  PF     Sharpe  NetPnl');
    const sweepData = [];
    for (let t = min; t <= max + 0.001; t += step) {
      const engine = new ReplayEngine({ bot, threshold: t, botConfig });
      const sweepTrades = [];
      for (const symbol of symbols) {
        try {
          const data = await loader.loadMultiTimeframeBars(bot, symbol, days);
          if (data.m5.length < 50) continue;
          data.symbol = symbol;
          const result = engine.replay(data);
          sweepTrades.push(...result.trades);
        } catch {}
      }
      const s = engine._computeSummary(sweepTrades);
      sweepData.push({ threshold: Math.round(t * 100) / 100, ...s });
      console.log(
        `${t.toFixed(2).padStart(9)}  ${String(s.totalTrades).padStart(6)}  ${(s.winRate*100).toFixed(0).padStart(5)}%  ${s.profitFactor.toFixed(2).padStart(5)}  ${s.sharpe.toFixed(2).padStart(6)}  ${s.netPnl.toFixed(1).padStart(6)}%`
      );
    }

    // Save sweep results
    const fs = require('fs');
    const sweepPath = `services/backtesting-js/cache/${bot}-threshold-sweep.json`;
    const best = sweepData.reduce((a, b) => (a.sharpe * a.netPnl > b.sharpe * b.netPnl ? a : b), sweepData[0]);
    fs.writeFileSync(sweepPath, JSON.stringify({ results: sweepData, optimal: best.threshold, current: threshold }, null, 2));
    console.log(`\nThreshold sweep saved to ${sweepPath}`);
  }

  // Save noise report
  const fs = require('fs');
  const reportPath = `services/backtesting-js/cache/${bot}-noise-report.json`;
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Noise report saved to ${reportPath}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
