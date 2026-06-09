#!/usr/bin/env node
/**
 * Read-only production monitor for crypto edge controls.
 *
 * Usage:
 *   node scripts/crypto-edge-monitor.js --since=2026-06-09T12:32:27Z
 *
 * Exit codes:
 *   0 = enforcement active and no killed-bucket trades since cutoff
 *   1 = monitor fetch/parse failure
 *   2 = enforcement inactive or killed-bucket trade leakage detected
 */

const BASE_URL = process.env.CRYPTO_BOT_URL || 'https://nexus-crypto-bot-production.up.railway.app';
const RISK_ON_TARGET_N = Number(process.env.RISK_ON_TARGET_N || 30);

function argValue(name) {
    const prefix = `--${name}=`;
    const found = process.argv.find(arg => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : null;
}

function num(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function tradesArray(payload) {
    if (Array.isArray(payload)) return payload;
    return payload.trades || payload.data || [];
}

function tradeTime(trade) {
    return new Date(trade.exit_time || trade.entry_time || trade.created_at || 0).getTime();
}

function bucketKey(trade) {
    const strategy = trade.strategy || '(unknown)';
    const regime = trade.market_regime || trade.entry_context?.marketRegimeClass || trade.entry_context?.marketRegime || trade.regime || '(any)';
    return `${strategy}|${regime}`;
}

function summarize(trades) {
    const closed = trades.filter(t =>
        t.status === 'closed' &&
        t.close_reason !== 'orphaned_restart' &&
        Number.isFinite(Number(t.pnl_usd))
    );
    const wins = closed.filter(t => num(t.pnl_usd) > 0);
    const losses = closed.filter(t => num(t.pnl_usd) < 0);
    const total = closed.reduce((sum, t) => sum + num(t.pnl_usd), 0);
    const winSum = wins.reduce((sum, t) => sum + num(t.pnl_usd), 0);
    const lossSum = losses.reduce((sum, t) => sum + Math.abs(num(t.pnl_usd)), 0);
    return {
        n: closed.length,
        winRate: closed.length ? wins.length / closed.length : null,
        total,
        profitFactor: lossSum > 0 ? winSum / lossSum : (winSum > 0 ? Infinity : 0),
        expectancy: closed.length ? total / closed.length : 0,
    };
}

function fmtMoney(value) {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function fmtPct(value) {
    return value == null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function fmtPf(value) {
    return value === Infinity ? 'Inf' : value.toFixed(2);
}

async function getJson(path) {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { accept: 'application/json' } });
    const text = await res.text();
    if (!res.ok) throw new Error(`${path} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`${path} returned non-JSON: ${text.slice(0, 200)}`);
    }
}

function printBucketTable(title, rows) {
    console.log(`\n## ${title}`);
    console.log('| Bucket | n | WR | PnL | PF | EV/trade |');
    console.log('|---|---:|---:|---:|---:|---:|');
    for (const row of rows) {
        const s = row.stats;
        console.log(`| ${row.bucket} | ${s.n} | ${fmtPct(s.winRate)} | ${fmtMoney(s.total)} | ${fmtPf(s.profitFactor)} | ${fmtMoney(s.expectancy)} |`);
    }
}

async function main() {
    const sinceRaw = argValue('since') || process.env.EDGE_MONITOR_SINCE || null;
    const sinceMs = sinceRaw ? new Date(sinceRaw).getTime() : Date.now() - 24 * 60 * 60 * 1000;
    if (!Number.isFinite(sinceMs)) throw new Error(`Invalid --since timestamp: ${sinceRaw}`);

    const [health, killSwitches, edgeAttribution, tradesPayload] = await Promise.all([
        getJson('/api/health/detailed'),
        getJson('/api/kill-switches'),
        getJson('/api/edge-attribution?window=30&minN=5'),
        getJson('/api/trades?limit=5000'),
    ]);

    const trades = tradesArray(tradesPayload);
    const closed = trades.filter(t => t.status === 'closed' && t.close_reason !== 'orphaned_restart');
    const recent = closed.filter(t => tradeTime(t) >= sinceMs);
    const killedKeys = new Set((killSwitches.data || []).map(row => `${row.strategy}|${row.market_regime}`));
    const killedRecent = recent.filter(t => killedKeys.has(bucketKey(t)));

    const byBucket = new Map();
    for (const trade of closed) {
        const key = bucketKey(trade);
        if (!byBucket.has(key)) byBucket.set(key, []);
        byBucket.get(key).push(trade);
    }
    const bucketRows = [...byBucket.entries()]
        .map(([bucket, bucketTrades]) => ({ bucket, stats: summarize(bucketTrades) }))
        .sort((a, b) => b.stats.n - a.stats.n);

    const recentByBucket = new Map();
    for (const trade of recent) {
        const key = bucketKey(trade);
        if (!recentByBucket.has(key)) recentByBucket.set(key, []);
        recentByBucket.get(key).push(trade);
    }
    const recentRows = [...recentByBucket.entries()]
        .map(([bucket, bucketTrades]) => ({ bucket, stats: summarize(bucketTrades) }))
        .sort((a, b) => b.stats.n - a.stats.n);

    const riskOn = byBucket.get('momentum|risk-on') || [];
    const riskOnStats = summarize(riskOn);
    const riskOnRemaining = Math.max(0, RISK_ON_TARGET_N - riskOnStats.n);

    const generatedAt = new Date().toISOString();
    console.log(`# Crypto Edge Monitor - ${generatedAt}`);
    console.log(`\nBase URL: ${BASE_URL}`);
    console.log(`Since: ${new Date(sinceMs).toISOString()}`);
    console.log(`Enforcement: ${health.enforceKillSwitches === true ? 'ON' : 'OFF'} (${killSwitches.mode || 'unknown'})`);
    console.log(`Operational status: ${health.operationalStatus || 'unknown'}`);
    console.log(`P&L: total ${fmtMoney(num(health.pnl?.total))}, today ${fmtMoney(num(health.pnl?.today))}, win rate ${health.pnl?.winRatePct ?? 'n/a'}%`);
    console.log(`Active kill-switch buckets: ${(killSwitches.data || []).map(row => `${row.strategy}|${row.market_regime}`).join(', ') || 'none'}`);
    console.log(`Risk-on sample: n=${riskOnStats.n}/${RISK_ON_TARGET_N}, WR=${fmtPct(riskOnStats.winRate)}, PnL=${fmtMoney(riskOnStats.total)}, remaining=${riskOnRemaining}`);

    printBucketTable('All Closed Crypto Buckets', bucketRows.filter(row => row.stats.n >= 5));

    console.log('\n## Edge Attribution');
    console.log('| Strategy | Regime | n | WR | PnL | CI high | Status |');
    console.log('|---|---|---:|---:|---:|---:|---|');
    for (const row of edgeAttribution.data || []) {
        console.log(`| ${row.strategy} | ${row.market_regime} | ${row.n} | ${row.win_rate_pct}% | ${fmtMoney(num(row.total_pnl_usd))} | ${num(row.pnl_pct_ci_high).toFixed(6)} | ${row.status} |`);
    }

    if (recentRows.length) {
        printBucketTable('New Closed Trades Since Cutoff', recentRows);
    } else {
        console.log('\n## New Closed Trades Since Cutoff');
        console.log('No closed trades since cutoff.');
    }

    if (killedRecent.length) {
        console.log('\n## Killed-Bucket Leakage');
        for (const trade of killedRecent) {
            console.log(`- ${trade.id} ${trade.symbol} ${bucketKey(trade)} ${trade.entry_time} ${fmtMoney(num(trade.pnl_usd))}`);
        }
    } else {
        console.log('\n## Killed-Bucket Leakage');
        console.log('None detected since cutoff.');
    }

    const failures = [];
    if (health.enforceKillSwitches !== true || killSwitches.mode !== 'enforcing') failures.push('kill-switch enforcement is not active');
    if (killedRecent.length > 0) failures.push(`${killedRecent.length} killed-bucket trade(s) closed since cutoff`);

    if (failures.length) {
        console.error(`\nFAIL: ${failures.join('; ')}`);
        process.exit(2);
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(`FAIL: ${error.message}`);
        process.exit(1);
    });
}

module.exports = { bucketKey, summarize, tradeTime, tradesArray };
