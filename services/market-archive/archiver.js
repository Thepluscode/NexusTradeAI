#!/usr/bin/env node
// Market data archiver — the differentiated-data moat collector (Phase 2 of
// the 2026-06-11 edge program). Snapshots Kraken spot depth/ticker for the
// bot universe plus Kraken Futures funding/basis, hourly, into PostgreSQL.
// INSERT-only; touches no bot code; a failed venue never blocks the other.
//
// Spec (Rule 1):
//   Inputs : Kraken public Depth/Ticker (spot), Kraken Futures public tickers.
//   Output : rows in market_snapshots (venue, symbol, captured_at, payload JSONB).
//   Invariants: one capture batch shares a single captured_at; per-symbol
//            failures are logged and skipped (Rule 8: counted, never silent).
//   Budget : ~30 rows/hour, ~2KB each → ~500MB/year. Hourly via launchd
//            (com.theplus.market-archiver); gaps on laptop sleep are
//            acceptable for a research dataset and logged by omission.
//
// Run: node services/market-archive/archiver.js   (from repo root)
'use strict';

const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
// Minimal .env loader (only DATABASE_URL needed; avoids a dotenv dependency).
if (!process.env.DATABASE_URL) {
    try {
        const line = fs.readFileSync(path.join(ROOT, '.env'), 'utf8')
            .split('\n').find(l => l.startsWith('DATABASE_URL='));
        if (line) process.env.DATABASE_URL = line.slice('DATABASE_URL='.length).trim();
    } catch (e) { console.error(`[archiver] .env read failed: ${e.message}`); }
}
const { Pool } = require(path.join(ROOT, 'clients/bot-dashboard/node_modules/pg'));

const PAIRS = ['XBTUSD', 'ETHUSD', 'SOLUSD', 'ADAUSD', 'XRPUSD', 'AVAXUSD',
    'DOTUSD', 'LTCUSD', 'ATOMUSD', 'LINKUSD', 'UNIUSD', 'AAVEUSD', 'NEARUSD',
    'APTUSD', 'SUIUSD', 'INJUSD', 'TIAUSD', 'OPUSD', 'ARBUSD', 'FILUSD'];
const DEPTH_LEVELS = 10;

async function fetchJson(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url.slice(0, 80)}`);
    return res.json();
}

// Pure shaping (unit-testable): kraken Depth result -> compact snapshot.
function shapeDepth(depthResult, tickerResult) {
    const key = Object.keys(depthResult)[0];
    const book = depthResult[key];
    const tkey = tickerResult ? Object.keys(tickerResult)[0] : null;
    const t = tkey ? tickerResult[tkey] : {};
    const lvl = (side) => (book[side] || []).slice(0, DEPTH_LEVELS)
        .map(([p, v]) => [parseFloat(p), parseFloat(v)]);
    const bids = lvl('bids'), asks = lvl('asks');
    const mid = bids.length && asks.length ? (bids[0][0] + asks[0][0]) / 2 : null;
    return {
        bids, asks, mid,
        spread_bps: mid ? Math.round(((asks[0][0] - bids[0][0]) / mid) * 1e6) / 100 : null,
        bid_depth: Math.round(bids.reduce((a, [p, v]) => a + p * v, 0)),
        ask_depth: Math.round(asks.reduce((a, [p, v]) => a + p * v, 0)),
        last: t.c ? parseFloat(t.c[0]) : null,
        vol24h: t.v ? parseFloat(t.v[1]) : null,
    };
}

function shapeFuturesTicker(t) {
    return {
        mark: t.markPrice ?? null, index: t.indexPrice ?? null,
        last: t.last ?? null, funding_rate: t.fundingRate ?? null,
        funding_pred: t.fundingRatePrediction ?? null,
        open_interest: t.openInterest ?? null, vol24h: t.vol24h ?? null,
        basis_pct: (t.markPrice && t.indexPrice)
            ? Math.round(((t.markPrice - t.indexPrice) / t.indexPrice) * 1e6) / 1e4
            : null,
    };
}

async function main() {
    if (!process.env.DATABASE_URL) {
        console.error('[archiver] DATABASE_URL not set — aborting');
        return 1;
    }
    // ssl.rejectUnauthorized=false matches the repo-wide convention for
    // Railway managed Postgres (its cert chain fails strict verification);
    // same setting as every bot's pool (e.g. unified-forex-bot initTradeDb).
    const pool = new Pool({ connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }, max: 2 });
    await pool.query(`CREATE TABLE IF NOT EXISTS market_snapshots (
        id BIGSERIAL PRIMARY KEY,
        captured_at TIMESTAMPTZ NOT NULL,
        venue TEXT NOT NULL,
        symbol TEXT NOT NULL,
        payload JSONB NOT NULL)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_msnap_sym_t
        ON market_snapshots(symbol, captured_at)`);

    const capturedAt = new Date().toISOString();
    let ok = 0, failed = 0;

    for (const pair of PAIRS) {
        try {
            const [depth, ticker] = await Promise.all([
                fetchJson(`https://api.kraken.com/0/public/Depth?pair=${pair}&count=${DEPTH_LEVELS}`),
                fetchJson(`https://api.kraken.com/0/public/Ticker?pair=${pair}`),
            ]);
            if (depth.error?.length) throw new Error(depth.error.join(','));
            const payload = shapeDepth(depth.result, ticker.result);
            await pool.query(
                `INSERT INTO market_snapshots (captured_at, venue, symbol, payload)
                 VALUES ($1, 'kraken-spot', $2, $3)`,
                [capturedAt, pair, JSON.stringify(payload)]);
            ok++;
        } catch (e) {
            failed++;
            console.error(`[archiver] spot ${pair} failed: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 1100)); // kraken public rate limit
    }

    try {
        const fut = await fetchJson('https://futures.kraken.com/derivatives/api/v3/tickers');
        const perps = (fut.tickers || []).filter(t => /^PF_/.test(t.symbol));
        for (const t of perps) {
            await pool.query(
                `INSERT INTO market_snapshots (captured_at, venue, symbol, payload)
                 VALUES ($1, 'kraken-futures', $2, $3)`,
                [capturedAt, t.symbol, JSON.stringify(shapeFuturesTicker(t))]);
            ok++;
        }
        console.log(`[archiver] futures: ${perps.length} perp tickers archived`);
    } catch (e) {
        failed++;
        console.error(`[archiver] futures fetch failed: ${e.message}`);
    }

    console.log(`[archiver] batch ${capturedAt}: ${ok} rows ok, ${failed} failures`);
    await pool.end();
    return failed === PAIRS.length + 1 ? 1 : 0; // total failure only
}

if (require.main === module) main().then(c => process.exit(c));
module.exports = { shapeDepth, shapeFuturesTicker, PAIRS };
