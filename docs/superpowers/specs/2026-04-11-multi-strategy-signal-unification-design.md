# Multi-Strategy Signal Unification — Design Spec

**Date:** 2026-04-11
**Status:** Draft — pending spec review + user approval
**Author:** Systematic debugging + brainstorming session following the stock bot 17-day trading drought
**Scope:** Stock bot + forex bot (crypto untouched)

---

## Problem Statement

The stock bot has not executed a trade since **2026-03-25** (17+ days at time of writing). Investigation with `systematic-debugging` traced the issue to:

1. **Asymmetric code paths:** The stock bot has two nearly-identical signal functions — `analyzeMomentum()` (global) and `analyzeMomentumForEngine()` (per-user engine, running in production). They drifted apart across several commits. The global path was fixed on 2026-03-31 to add VWAP Reversal and relax below-VWAP hard blocks; the engine path was never updated.

2. **Engine path is over-restrictive:** `analyzeMomentumForEngine()` hard-blocks any stock below VWAP or with EMA9 ≤ EMA21 (lines 5885, 5889). In current market regimes, most stocks fail these filters, producing zero candidates.

3. **No catch-all strategy in engine path:** The engine path only has ORB, momentum (currently disabled), and RSI(2) mean reversion. ORB fires only 9:45–11:00 AM ET; momentum is disabled; RSI(2) is rare. The global path has VWAP Reversal as a mean-reversion entry that was designed specifically for below-VWAP stocks — but it's missing from the engine path.

4. **Backtest confirms the bottleneck:** Across 4 trading days × 40 liquid stocks (= 160 scan simulations), 0 ORB candidates were produced. The `breakoutVolumeRatio ≥ 1.8` check killed every remaining candidate — post-open volume never matches opening-range volume.

5. **Forex bot has a separate but related problem:** 0% win rate across 26 trades. Currently paused (`BOT_PAUSED=true`). Strategies never validated with backtests before being enabled.

**Root cause class:** Architectural — two code paths, no enforced parity, strategies never validated before enablement. No amount of threshold tuning fixes this without accepting the underlying structural problem.

---

## Goals & Non-Goals

**Goals:**
1. Stock bot resumes trading with strategies appropriate for current market regime
2. Forex bot resumes trading once strategies pass validation gates
3. Strategy code has a single source of truth (no drift between code paths)
4. Every strategy passes a tiered validation gate before executing real trades
5. Observability: per-strategy diagnostics showing which gates block trades
6. Rollback-safe deployment (feature flag)

**Non-goals:**
1. Touching the crypto bot (currently working)
2. Modifying the anti-churning system (non-negotiable per CARL trading-safety domain)
3. Changing position sizes, risk limits, or safety thresholds
4. Switching brokers or moving to live trading
5. A full backtesting framework with GUI — keep it CLI/API only
6. Multi-user scaling (out of scope for this spec; existing engine registry stays as-is)

---

## Design Decisions

All decisions validated through brainstorming session with user:

| Decision | Choice | Why |
|---|---|---|
| **Overall goal** | Build a robust multi-strategy system | User priority: correctness and longevity over speed |
| **Scope** | Stock + forex bots | User called these out specifically; crypto is working |
| **Architecture** | Unify into one function per bot | Fixes the drift root cause |
| **Validation gates** | Tiered: Gate A → Walk-forward → Shadow mode → Live | Each catches different failure modes |
| **Strategy list** | ORB, VWAP Reversal, RSI(2), Momentum (stock); London Breakout, BB+RSI MeanRev, Asian Box (forex) | Data decides final list post-backtest |
| **Data source** | Alpaca SIP + OANDA historical, cached in Postgres | Authoritative + fast iteration |
| **Routing** | Hybrid: static defaults from backtest + bandit refinement | Leverages existing supervisor bandit |
| **Migration** | Incremental, crypto last (if ever) | Protects the only working bot |
| **Code organization** | Strategy Registry Pattern | Matches existing `services/signals/` module layout |

---

## Architecture

### File Layout

```
clients/bot-dashboard/
├── unified-trading-bot.js    (stock)  → thin scan loop, calls strategy registry
├── unified-forex-bot.js      (forex)  → thin scan loop, calls strategy registry
└── unified-crypto-bot.js     (crypto) → UNCHANGED

services/signals/
├── strategies/                    ← NEW
│   ├── index.js                  (exports all strategies + auto-registration)
│   ├── stock-orb.js              (port from unified-trading-bot.js:1544)
│   ├── stock-vwap-reversal.js    (port from global path lines 3202-3262)
│   ├── stock-rsi2-meanrev.js     (port from line 6015+)
│   ├── stock-momentum.js         (port from line 5949+, currently disabled)
│   ├── forex-london-breakout.js
│   ├── forex-bb-rsi-meanrev.js
│   └── forex-asian-box.js
├── strategy-registry.js          ← NEW — registration, runStrategies(), getEnabledStrategies()
├── strategy-context.js           ← NEW — computeContext(bars, regime) → indicator bundle
└── backtest/                     ← NEW
    ├── index.js                  (runBacktest runner)
    ├── data-loader.js            (Alpaca/OANDA fetch + Postgres cache)
    ├── gate-a-validator.js       (≥15 trades, ≥40% WR, PF ≥1.1)
    ├── walk-forward.js           (60/40 train/test Sharpe check)
    └── shadow-runner.js          (async watcher: closes shadow positions on price movement)

services/signals/__tests__/
├── strategies/
│   ├── stock-orb.test.js         (~20 tests/strategy)
│   ├── stock-vwap-reversal.test.js
│   ├── stock-rsi2-meanrev.test.js
│   ├── stock-momentum.test.js
│   ├── forex-london-breakout.test.js
│   ├── forex-bb-rsi-meanrev.test.js
│   └── forex-asian-box.test.js
├── strategy-registry.test.js
├── strategy-context.test.js
├── backtest/
│   ├── runner.test.js
│   ├── data-loader.test.js
│   ├── gate-a-validator.test.js
│   └── walk-forward.test.js
├── integration/
│   └── scan-loop.test.js
├── regression/
│   ├── engine-global-drift.test.js
│   ├── below-vwap-hard-block.test.js
│   ├── ema-hard-block.test.js
│   └── committee-absent-signal-scoring.test.js
└── fixtures/
    ├── bars-aapl-orb-valid.json
    ├── bars-aapl-orb-no-breakout.json
    └── ... (one fixture per edge case)
```

### Postgres Schema Additions

```sql
CREATE TABLE historical_bars_cache (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    date DATE NOT NULL,
    interval TEXT NOT NULL,        -- '1Min', '5Min', etc.
    bars JSONB NOT NULL,
    source TEXT NOT NULL,          -- 'alpaca_sip', 'oanda'
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (symbol, date, interval, source)
);
CREATE INDEX idx_bars_cache_lookup ON historical_bars_cache (symbol, date, interval);

CREATE TABLE backtest_results (
    id SERIAL PRIMARY KEY,
    strategy_name TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    trade_count INT NOT NULL,
    win_rate NUMERIC(5,4),
    profit_factor NUMERIC(6,2),
    sharpe NUMERIC(6,2),
    max_drawdown_pct NUMERIC(5,2),
    passed_gate_a BOOL NOT NULL,
    passed_walk_forward BOOL,
    trades_sample JSONB,
    tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_backtest_strategy ON backtest_results (strategy_name, tested_at DESC);

CREATE TABLE shadow_signals (
    id SERIAL PRIMARY KEY,
    strategy_name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    asset_class TEXT NOT NULL,
    entry_time TIMESTAMPTZ NOT NULL,
    entry_price NUMERIC(12,6) NOT NULL,
    stop_loss NUMERIC(12,6) NOT NULL,
    take_profit NUMERIC(12,6) NOT NULL,
    tier TEXT,
    regime TEXT,
    context_snapshot JSONB,
    exit_time TIMESTAMPTZ,
    exit_price NUMERIC(12,6),
    exit_reason TEXT,
    would_have_pnl_usd NUMERIC(12,4),
    would_have_pnl_pct NUMERIC(8,4)
);
CREATE INDEX idx_shadow_open ON shadow_signals (strategy_name, exit_time) WHERE exit_time IS NULL;

CREATE TABLE strategy_enabled (
    id SERIAL PRIMARY KEY,
    strategy_name TEXT NOT NULL UNIQUE,
    asset_class TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('disabled','backtest','shadow','live')),
    reason TEXT,
    updated_by TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Scan Loop After Refactor

```js
async function scanMomentumBreakouts() {
    scanDiagnostics._reset();
    const regime = globalThis._marketRegime || defaultRegime();
    const enabledStrategies = await registry.getEnabledStrategies('stock', regime);
    if (enabledStrategies.length === 0) {
        console.log('[scan] No enabled strategies for stock — skipping');
        return [];
    }

    const symbols = popularStocks.getAllSymbols();
    const movers = [];
    const batchSize = 20;

    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        const results = await Promise.allSettled(batch.map(async symbol => {
            const bars = await fetchBarsWithCache(symbol, alpacaConfig, ...);
            if (!bars || bars.length < 21) return null;
            const context = computeContext(bars, regime);
            const { candidates, diagnostics } = runStrategies(enabledStrategies, symbol, bars, context);
            scanDiagnostics._mergeStrategyDiagnostics(symbol, diagnostics);
            return candidates;
        }));
        for (const r of results) {
            if (r.status === 'fulfilled' && r.value) movers.push(...r.value);
        }
    }

    movers.sort((a, b) => (b.score || 0) - (a.score || 0));

    // Existing gate chain (unchanged):
    // SPY, anti-churning, agent advisor (advisory), committee, quality, correlation
    await processMoversThroughGates(movers);

    scanDiagnostics._save();
    return movers;
}
```

---

## Components

### Strategy Interface

```js
// Shape every strategy module must export:
{
    name: 'stockORB',                       // unique, matches DB
    assetClass: 'stock',                    // 'stock' | 'forex' | 'crypto'
    regimes: ['opening-range','trending'],  // which market regimes to run in
    timeWindow: {                           // optional
        start: '09:45',
        end: '11:00',
        tz: 'America/New_York'
    },
    evaluate(bars, context) {
        // Returns one of:
        // { candidate: { symbol, price, tier, score, stopLoss, takeProfit, ... } }
        // { killedBy: 'no_breakout', detail: 'current 158.12 <= trigger 158.66' }
        // Must never throw — caller wraps in try/catch as defense in depth
    }
}
```

### Strategy Context

`services/signals/strategy-context.js`:

```js
function computeContext(bars, marketRegime) {
    // Pure function — no I/O, no side effects
    return {
        // Price & volume
        currentPrice: ...,
        todayOpen: ...,
        volumeToday: ...,
        prevVolume: ...,
        volumeRatio: ...,
        percentChange: ...,
        dailyHigh: ...,
        dailyLow: ...,
        // Indicators (null if insufficient data)
        vwap: ... || null,
        vwapUpperBand: ... || null,
        vwapLowerBand: ... || null,
        ema9: ... || null,
        ema21: ... || null,
        sma9daily: ... || null,
        sma50daily: ... || null,
        rsi: ... || null,
        rsi2: ... || null,
        adx: ... || null,
        macd: { histogram, bullish, nearlyFlat } || null,
        atr: ... || null,
        atrPct: ... || null,
        // Market state (read-only refs)
        marketRegime,
        spyBullish: ...,
        isOpeningRangeWindow: ...,
        // Derived flags
        belowVwap: ...,
        emaUptrend: ...,
        positionInDailyRange: ...
    };
}
```

### Strategy Registry

```js
// services/signals/strategy-registry.js

const strategies = new Map();  // name → strategy

function register(strategy) {
    assert.ok(strategy.name, 'strategy.name required');
    assert.ok(strategy.assetClass, 'strategy.assetClass required');
    assert.ok(typeof strategy.evaluate === 'function', 'strategy.evaluate required');
    if (strategies.has(strategy.name)) {
        throw new Error(`Duplicate strategy name: ${strategy.name}`);
    }
    strategies.set(strategy.name, strategy);
}

// Load all strategies (require() side effect registers each)
require('./strategies');

// DB-backed enablement cache
let enabledCache = null;
let enabledCacheFetchedAt = 0;
const ENABLED_CACHE_TTL_MS = 60_000;

async function getEnabledStrategies(assetClass, regime, dbPool) {
    // Refresh cache every 60s
    const age = Date.now() - enabledCacheFetchedAt;
    if (enabledCache === null || age > ENABLED_CACHE_TTL_MS) {
        try {
            const { rows } = await dbPool.query(
                `SELECT strategy_name, state FROM strategy_enabled
                 WHERE asset_class = $1 AND state IN ('shadow','live')`,
                [assetClass]
            );
            enabledCache = rows;
            enabledCacheFetchedAt = Date.now();
        } catch (e) {
            console.error(`[strategies] DB refresh failed: ${e.message} — using last cached`);
            if (enabledCache === null) return [];  // Safe default
        }
    }
    // Filter by regime match
    return enabledCache
        .map(row => ({ ...strategies.get(row.strategy_name), state: row.state }))
        .filter(s => s && s.regimes.includes(regime) || s.regimes.includes('any'));
}

function runStrategies(enabledStrategies, symbol, bars, context) {
    const candidates = [];
    const diagnostics = {};
    for (const strategy of enabledStrategies) {
        if (strategy.timeWindow && !isInTimeWindow(strategy.timeWindow)) continue;
        try {
            const result = strategy.evaluate(bars, context);
            if (result.candidate) {
                candidates.push({
                    ...result.candidate,
                    strategy: strategy.name,
                    shadowMode: strategy.state === 'shadow'
                });
            } else if (result.killedBy) {
                diagnostics[strategy.name] = diagnostics[strategy.name] || {};
                diagnostics[strategy.name][result.killedBy] = (diagnostics[strategy.name][result.killedBy] || 0) + 1;
            }
        } catch (e) {
            console.error(`[strategy ${strategy.name}] ${symbol} crashed: ${e.message}`);
            scanDiagnostics._strategyError(strategy.name, e.message);
            maybeAutoDisable(strategy.name, 'runtime_errors').catch(err =>
                console.error(`[strategies] auto-disable failed: ${err.message}`));
        }
    }
    return { candidates, diagnostics };
}

module.exports = { register, getEnabledStrategies, runStrategies };
```

### Backtest Harness

`services/signals/backtest/index.js:runBacktest(strategy, dateRange, symbols)`:

1. Resolve symbols (default to popularStocks / popularForexPairs)
2. For each symbol, load cached bars from Postgres (cache miss → fetch from Alpaca/OANDA → INSERT)
3. For each minute in dateRange, call `strategy.evaluate(bars[0:now], computeContext(...))`
4. On candidate: simulate trade with stop/target, track entry/exit/pnl
5. Aggregate trades → `{ trades, winRate, profitFactor, sharpe, maxDrawdown, coverage }`
6. INSERT INTO backtest_results
7. Run `validateGateA(trades)` → returns eligibility

### Gate Validators

**Gate A** (fast, always runs):
```js
function validateGateA(trades) {
    const reasons = [];
    if (trades.length < 15) reasons.push(`insufficient_trades (${trades.length} < 15)`);
    const wins = trades.filter(t => t.pnl > 0);
    const losses = trades.filter(t => t.pnl <= 0);
    const winRate = trades.length > 0 ? wins.length / trades.length : 0;
    if (winRate < 0.40) reasons.push(`low_win_rate (${(winRate*100).toFixed(0)}% < 40%)`);
    const totalWin = wins.reduce((s, t) => s + t.pnl, 0);
    const totalLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const pf = totalLoss > 0 ? totalWin / totalLoss : 0;
    if (pf < 1.1) reasons.push(`low_profit_factor (${pf.toFixed(2)} < 1.1)`);
    return { passed: reasons.length === 0, reasons };
}
```

**Walk-forward** (runs after Gate A passes):
```js
async function validateWalkForward(strategy, dateRange, symbols) {
    const mid = midpoint(dateRange, 0.6);  // 60% train, 40% test
    const train = await runBacktest(strategy, { start: dateRange.start, end: mid }, symbols);
    const test = await runBacktest(strategy, { start: mid, end: dateRange.end }, symbols);
    if (train.trades.length < 10 || test.trades.length < 10) return { inconclusive: true };
    const trainSharpe = train.sharpe;
    const testSharpe = test.sharpe;
    const passed = trainSharpe > 0 && testSharpe > 0 && testSharpe > trainSharpe * 0.5;
    return { passed, trainSharpe, testSharpe };
}
```

### Shadow Mode

A separate `shadow-runner.js` daemon runs every 5 minutes:

1. `SELECT * FROM shadow_signals WHERE exit_time IS NULL`
2. For each open shadow: fetch recent bars for the symbol
3. Check if price hit stop_loss or take_profit, or time_stop exceeded
4. If yes: compute `would_have_pnl`, UPDATE shadow_signals with exit data
5. Log summary: "X shadow signals closed this cycle"

### Admin Endpoints

Added to stock bot and forex bot:

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/backtest/run` | API secret | Run backtest for a strategy + date range |
| GET | `/api/backtest/results` | API secret | List recent backtest runs |
| POST | `/api/strategies/:name/promote` | API secret | Move strategy disabled→backtest→shadow→live |
| POST | `/api/strategies/:name/disable` | API secret | Move strategy to disabled with reason |
| GET | `/api/strategies` | Public | Current enabled strategies per asset class |
| GET | `/api/shadow-signals` | API secret | Query shadow signals with filters |

---

## Data Flow

### Runtime Scan Flow

```
Every 60s during market hours:
  1. getEnabledStrategies('stock', regime, db) → filtered by DB state + regime
  2. For each symbol (batched 20 parallel):
     a. fetchBarsWithCache(symbol)
     b. computeContext(bars, regime)
     c. runStrategies(enabled, symbol, bars, context)
        → { candidates, diagnostics }
     d. Accumulate into movers[]
  3. Sort movers by score
  4. For each top mover:
     a. canTrade check (anti-churning)
     b. Existing gate chain (SPY, agent advisory, committee, quality, correlation)
     c. If mover.shadowMode: INSERT INTO shadow_signals
        Else: executeTrade() + POST /agent/evaluate + /agent/execution
  5. On close: POST /agent/trade-outcome, supervisor bandit updates per-strategy
  6. scanDiagnostics._save() exposes per-strategy blocks via /api/scan/diagnostics
```

### Backtest Flow

```
POST /api/backtest/run { strategy: 'stockORB', dateRange: {start, end} }
  1. DataLoader.loadBars(symbols, dateRange)
     - For each symbol/date: check historical_bars_cache
     - Miss → fetch Alpaca SIP → INSERT cache → return
  2. For each symbol, for each minute in dateRange:
     - barsUntil = bars.slice(0, currentMinute)
     - context = computeContext(barsUntil, regime)
     - result = strategy.evaluate(barsUntil, context)
     - If candidate: simulate trade with stop/target
  3. Aggregate: { trades[], winRate, profitFactor, sharpe, maxDrawdown, coverage }
  4. INSERT INTO backtest_results
  5. validateGateA(trades) → passed / reasons
  6. If passed: operator can promote to shadow via /api/strategies/:name/promote
```

### Shadow Mode Flow

```
Strategy state = 'shadow' in strategy_enabled table

Runtime scan produces candidate → runStrategies marks shadowMode=true
  ↓
processMoversThroughGates routes shadowMode candidates to INSERT INTO shadow_signals
  ↓
shadow-runner daemon (every 5 min):
  - SELECT open shadow signals
  - Fetch recent bars
  - Check stop/target/time hit
  - UPDATE exit_price, exit_reason, would_have_pnl
  ↓
After N days / N signals, operator reviews GET /api/shadow-signals?strategy=X
  ↓
If shadow P&L positive → POST /api/strategies/X/promote → state='live'
```

### Strategy State Machine

```
disabled → backtest → shadow → live
    ↑         ↓          ↓        ↓
    └───── failure / operator disable ───┘
```

---

## Error Handling

| Failure Mode | Handling | Observable |
|---|---|---|
| Strategy throws in evaluate() | try/catch in runStrategies; log error; scanDiagnostics._strategyError | Per-strategy error count |
| Strategy errors ≥5x in 10min | Auto-disable: UPDATE strategy_enabled SET state='disabled', reason='runtime_errors' | Telegram alert on auto-disable |
| Insufficient bars for indicator | computeContext returns null; strategy must handle explicitly | killedBy='insufficient_bars_for_X' in diagnostics |
| DB down (getEnabledStrategies) | Use last cached; if cache empty on first startup, return [] (zero trades safe default) | Log error, metric |
| DB down (shadow_signals INSERT) | Log warning, drop the shadow signal; real scan continues | Counter of dropped shadow inserts |
| Data loader fetch fails | Retry with exponential backoff (3 attempts); throw after | Backtest reports coverage < 1.0 |
| Backtest partial failure | Continue with symbols that succeeded; coverage < 0.8 → Gate A rejects | backtest_results.coverage field |
| Walk-forward insufficient data | Returns `inconclusive`, not `passed` | Operator sees reason |
| Feature flag off (USE_UNIFIED_STRATEGIES=false) | Fall back to existing inline code path | Deployment rollback path |

All rejections logged in rule-8-compliant format:
```
[strategy stockORB] AAPL BLOCKED: breakout_vol_ratio (1.2 < 1.8, 33% off threshold)
```

---

## Testing

### Coverage Requirements

- `services/signals/strategies/**` — **≥ 90% line coverage**, enforced in CI
- `services/signals/strategy-*.js` — **≥ 90%**
- `services/signals/backtest/**` — **≥ 80%**
- Existing bot files — no retroactive requirement

### Test Layout

```
services/signals/__tests__/
├── strategies/
│   ├── stock-orb.test.js           (~20 tests, 6 categories)
│   ├── stock-vwap-reversal.test.js
│   ├── stock-rsi2-meanrev.test.js
│   ├── stock-momentum.test.js
│   └── forex-*.test.js
├── strategy-registry.test.js
├── strategy-context.test.js
├── backtest/
│   ├── runner.test.js
│   ├── data-loader.test.js
│   ├── gate-a-validator.test.js
│   └── walk-forward.test.js
├── integration/
│   └── scan-loop.test.js           (~10 tests with mock Alpaca + in-mem DB)
├── regression/
│   ├── engine-global-drift.test.js
│   ├── below-vwap-hard-block.test.js
│   ├── ema-hard-block.test.js
│   └── committee-absent-signal-scoring.test.js
└── fixtures/
    └── *.json                      (shared bar fixtures)
```

### Test Categories (per strategy)

| Category | Count | Purpose |
|---|---|---|
| Normal cases | 3–5 | Typical valid inputs |
| Boundary cases | 5–8 | Threshold edges (just in / just out) |
| Malformed cases | 3–5 | null context, NaN bars, negative volume |
| Adversarial cases | 2–3 | Flat ranges, single bar, huge bar count |
| killedBy reporting | 5+ | Every rejection path emits specific killedBy string |
| Time window | 2–3 | Rejects outside declared window |

### Regression Tests

One per previous bug:
- **engine-global-drift.test.js** — verifies both runtime paths produce identical candidates for same input
- **below-vwap-hard-block.test.js** — verifies VWAP Reversal fires on below-VWAP stocks
- **ema-hard-block.test.js** — verifies strategies with declared regime can fire without uptrend EMA
- **committee-absent-signal-scoring.test.js** — verifies committee treats absent signals as 0 not 0.5

### Test Execution

- **Pre-commit:** `cd services/signals && npx jest` (unit tests only, ~1s)
- **PR/push:** `npx jest services/signals/` (unit + integration + regression, ~5s)
- **Post-deploy smoke:** existing smoke test step in `.github/workflows/deploy.yml`

---

## Migration Path

Incremental rollout, each step deployable independently, each step reversible.

### Phase 0 — Prerequisites (no bot changes)

1. Create Postgres tables (historical_bars_cache, backtest_results, shadow_signals, strategy_enabled)
2. Build strategy-context.js + unit tests
3. Build strategy-registry.js + unit tests (with empty strategies)
4. Build backtest harness + data loader + gate validators + unit tests
5. Seed strategy_enabled with all existing strategies in 'disabled' state
6. **Deployable:** YES — no bot behavior change, just new tables + new services/signals code

### Phase 1 — Port ORB strategy

1. Create `services/signals/strategies/stock-orb.js` by porting existing ORB logic
2. Full test suite (~20 tests)
3. Run backtest against 60 days of data → verify passes Gate A
4. Promote ORB from 'disabled' to 'shadow' via admin endpoint
5. **Deployable:** YES — shadow mode, no real trades affected

### Phase 2 — Port VWAP Reversal

1. Create `services/signals/strategies/stock-vwap-reversal.js` by porting global path logic
2. Full test suite
3. Backtest + Gate A
4. Promote to shadow
5. **Deployable:** YES

### Phase 3 — Stock bot opts in to shared module

1. Add feature flag `USE_UNIFIED_STRATEGIES=true` in stock bot
2. Modify `analyzeMomentumForEngine()` to call `runStrategies()` when flag is on
3. Regression test: `engine-global-drift.test.js` verifies parity with existing inline logic
4. Deploy with flag ON in Railway env
5. Verify scan diagnostics show per-strategy data
6. **Deployable:** YES — feature-flagged, rollback = flip flag to false

### Phase 4 — Stock live promotion

1. Review 5-7 days of shadow signals for ORB and VWAP Reversal
2. For each strategy with positive shadow P&L and sufficient sample: promote to 'live'
3. Monitor first 10 real trades per strategy
4. **Deployable:** YES — one strategy at a time

### Phase 5 — Port remaining stock strategies

1. RSI(2) Mean Reversion → backtest → shadow → live
2. Momentum (re-enable with tighter gates) → backtest → shadow → live
3. **Deployable:** YES

### Phase 6 — Forex strategies

1. Create `services/signals/strategies/forex-london-breakout.js` + tests
2. Backtest → shadow
3. Create forex-bb-rsi-meanrev.js + tests + backtest + shadow
4. Create forex-asian-box.js + tests + backtest + shadow
5. Forex bot opts in to shared module (feature flag)
6. Unpause forex bot with shadow strategies
7. Review shadow P&L → promote to live
8. **Deployable:** YES

### Phase 7 — Crypto (optional, out of this spec's scope)

Deferred — crypto bot is currently working. Only migrate if operational reasons arise.

### Rollback Strategy

- **Full rollback:** Set `USE_UNIFIED_STRATEGIES=false` in Railway env for stock/forex bots. Bot falls back to existing inline code.
- **Per-strategy rollback:** Set strategy state to 'disabled' via admin endpoint. Takes effect within 60s (cache TTL).
- **Emergency kill:** Existing kill switch in agent pipeline remains in place. If activated, all live strategies stop executing trades.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Unified code has subtle behavior differences from inline code | Medium | Could miss valid signals | Regression test (`engine-global-drift.test.js`) + shadow mode verification before live |
| Strategy auto-disable triggers on transient errors | Low | Strategy silently stops | Auto-disable only triggers on ≥5 errors / 10 min; Telegram alert on auto-disable |
| DB cache stale beyond 60s TTL | Low | Strategy change doesn't take effect immediately | Documented — operator expects 60s delay |
| Backtest cache becomes very large | Medium | DB size grows | Daily cleanup job deletes bars older than 180 days |
| Shadow runner falls behind (5-min cycle too slow) | Low | Shadow P&L delayed | Monitoring on shadow_signals open count; alert if > 100 open |
| User adds strategy to code but forgets DB row | Medium | Strategy never loads | Startup check: warn if code strategy has no DB row |
| OANDA historical data unavailable for forex backtest | High | Can't validate forex strategies | Fallback: use live bars during market hours, accumulate cache over time |

---

## Success Criteria

Definition of done for this spec:

1. ✅ Spec committed to `docs/superpowers/specs/2026-04-11-multi-strategy-signal-unification-design.md`
2. ✅ Spec reviewed and approved by spec-document-reviewer subagent
3. ✅ Spec approved by user
4. ✅ Implementation plan written (by `writing-plans` skill) based on this spec

After implementation:

1. Stock bot executing ≥ 1 trade per market day on average across 5 consecutive days
2. At least 2 strategies in 'live' state for stock bot
3. Forex bot executing ≥ 1 trade per market day (or confirmed to be correctly sitting out based on validated regime routing)
4. Per-strategy diagnostics visible via /api/scan/diagnostics
5. Signal module test coverage ≥ 90% on new code
6. Zero regressions in existing passing tests (`cd services/signals && npx jest` still green)
7. No CARL trading-safety rule violations

---

## Out of Scope

Explicitly NOT addressed in this spec (future work):

- Real-time strategy parameter auto-tuning (current auto-optimizer stays as-is)
- Multi-user strategy preferences (all users run the same strategy set)
- Strategy marketplace / user-submitted strategies
- Visual backtest dashboard
- Forward-testing during market holidays
- Cross-bot correlation strategies
- Sub-minute interval strategies (tick data)
- Machine learning strategy generation
- Crypto bot migration (deferred to Phase 7 if/when needed)

---

## References

- CARL trading-safety decision: Anti-churning non-negotiable after SMX incident (2025-12-05)
- Engineering standards: `/Users/theophilusogieva/.claude/rules/engineering-standards.md`
- Previous investigation: systematic-debugging session 2026-04-11 identified engine/global path drift as root cause
- Historical trade analysis: 75 stock trades, all ORB tier, 36.9% WR, P&L -$6.37 (near breakeven)
- Git commits: `b466092` (April 2 momentum disable), `abf0dd7` (March 31 VWAP Reversal add to global only), `dd101758` (March 9 ORB hard-block filters)
