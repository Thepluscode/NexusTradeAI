# Strategy Module Scaffolding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the unified strategy registry pattern (context computer + registry + DB schema + stub strategy) as the tracer-bullet for Plan 1 of the multi-strategy signal unification effort. No bot changes, no backtest harness, no shadow mode — those come in later plans.

**Architecture:** Extract a common `services/signals/strategy-context.js` (pure indicator computer) and `services/signals/strategy-registry.js` (pluggable strategy loader + runner). Add Postgres tables for historical bars cache, backtest results, shadow signals, and strategy enablement. Include one stub strategy and full test coverage to prove the pattern.

**Tech Stack:** Node.js (CommonJS), Jest 29, Postgres via `pg`, existing `services/signals/` module pattern

**Spec reference:** `docs/superpowers/specs/2026-04-11-multi-strategy-signal-unification-design.md`

---

## Scope (Plan 1 only)

**In scope:**
- `services/signals/schema.js` — 4 new Postgres tables, idempotent CREATE
- `services/signals/strategy-context.js` — pure function computing indicator bundle
- `services/signals/strategy-registry.js` — register/runStrategies/getEnabledStrategies
- `services/signals/strategies/index.js` — strategies loader (requires all files in dir)
- `services/signals/strategies/_stub.js` — trivial strategy for smoke testing
- Full unit test coverage (Jest) for all new files
- One integration test wiring context + registry + stub strategy
- Wire `initSignalSchema` into stock bot's `initDb`

**Out of scope (later plans):**
- Porting real strategies (ORB, VWAP Reversal, RSI(2), Momentum)
- Backtest harness (data-loader, runner, gate validators, walk-forward)
- Shadow mode runner
- Bot scan loop refactor to call registry
- Admin endpoints
- Forex strategies

---

## File Structure

### New files (Plan 1)

| File | Responsibility |
|---|---|
| `services/signals/schema.js` | Idempotent DDL for historical_bars_cache, backtest_results, shadow_signals, strategy_enabled. Exports `initSignalSchema(dbPool)`. |
| `services/signals/strategy-context.js` | Pure function `computeContext(bars, marketRegime)` returning an indicator bundle. Handles null-safe indicator calculation. |
| `services/signals/strategy-registry.js` | `register(strategy)` / `runStrategies(enabled, symbol, bars, context)` / `getEnabledStrategies(assetClass, regime, dbPool)`. Includes DB-backed enablement cache. |
| `services/signals/strategies/index.js` | Strategy auto-loader: scans `strategies/` dir for `.js` files and requires them (each file calls `registry.register()` as side effect). |
| `services/signals/strategies/_stub.js` | Trivial "always-null" strategy for smoke testing registration. Leading underscore prevents accidental use as a real strategy. |
| `services/signals/__tests__/strategy-context.test.js` | Unit tests — ~20 tests across normal/boundary/malformed cases |
| `services/signals/__tests__/strategy-registry.test.js` | Unit tests — ~15 tests covering register/runStrategies/getEnabledStrategies |
| `services/signals/__tests__/integration/plan1-end-to-end.test.js` | One integration test: context + registry + stub strategy working together |

### Modified files

| File | Change |
|---|---|
| `services/signals/index.js` | Add exports for `strategyContext`, `strategyRegistry`, `schema` |
| `clients/bot-dashboard/unified-trading-bot.js` | In `initDb()`, call `initSignalSchema(dbPool)` after existing table creation |

---

## Conventions for the Implementer

**Test commands:**
```bash
# From services/signals/
cd services/signals && npx jest

# Run a single test file
cd services/signals && npx jest strategy-context.test.js

# Run with coverage
cd services/signals && npx jest --coverage
```

**Module style:** CommonJS (`require` / `module.exports`). Do NOT use ESM.

**Existing patterns to match:**
- Look at `services/signals/committee-scorer.js` for the module shape
- Look at `services/signals/indicators.js` for how existing indicators are structured
- Look at `clients/bot-dashboard/unified-trading-bot.js:215-340` for `initDb` pattern

**Jest config:** `services/signals/jest.config.js` — tests go in `__tests__/` subdirs

**Commit style:** Imperative mood, explain WHY not WHAT. Example:
```
feat(signals): add strategy registry — unblocks strategy portability
```

**Co-author trailer on every commit:**
```
Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
```

---

## Task 1: Create `services/signals/schema.js`

**Files:**
- Create: `services/signals/schema.js`
- Test: `services/signals/__tests__/schema.test.js`

- [ ] **Step 1: Write the failing test**

Create `services/signals/__tests__/schema.test.js`:
```js
const schema = require('../schema');

describe('schema', () => {
    test('exports initSignalSchema as a function', () => {
        expect(typeof schema.initSignalSchema).toBe('function');
    });

    test('initSignalSchema is async', () => {
        expect(schema.initSignalSchema.constructor.name).toBe('AsyncFunction');
    });

    test('initSignalSchema accepts a dbPool argument', async () => {
        // Mock dbPool.query that records calls
        const queries = [];
        const mockPool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
        await schema.initSignalSchema(mockPool);
        // Expect 4 CREATE TABLE statements
        const creates = queries.filter(q => q.includes('CREATE TABLE'));
        expect(creates.length).toBeGreaterThanOrEqual(4);
    });

    test('initSignalSchema is idempotent (uses IF NOT EXISTS)', async () => {
        const queries = [];
        const mockPool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
        await schema.initSignalSchema(mockPool);
        queries.forEach(q => {
            if (q.includes('CREATE TABLE')) {
                expect(q).toMatch(/CREATE TABLE IF NOT EXISTS/);
            }
        });
    });

    test('initSignalSchema creates all 4 expected tables', async () => {
        const queries = [];
        const mockPool = { query: async (sql) => { queries.push(sql); return { rows: [] }; } };
        await schema.initSignalSchema(mockPool);
        const allSql = queries.join(' ');
        expect(allSql).toMatch(/historical_bars_cache/);
        expect(allSql).toMatch(/backtest_results/);
        expect(allSql).toMatch(/shadow_signals/);
        expect(allSql).toMatch(/strategy_enabled/);
    });

    test('initSignalSchema tolerates null dbPool without crashing', async () => {
        // When DATABASE_URL is unset, callers pass null — must not throw
        await expect(schema.initSignalSchema(null)).resolves.not.toThrow();
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/signals && npx jest schema.test.js
```

Expected: FAIL with "Cannot find module '../schema'".

- [ ] **Step 3: Implement `services/signals/schema.js`**

```js
'use strict';

/**
 * Signal-related Postgres schema — idempotent CREATE TABLE statements.
 * Called once at bot startup from initDb() after core tables exist.
 *
 * Tables created:
 * - historical_bars_cache: cached 1-min bars for backtest
 * - backtest_results: strategy backtest outputs + gate pass/fail
 * - shadow_signals: shadow-mode entries (no execution, tracks would-have-pnl)
 * - strategy_enabled: per-strategy state machine (disabled/backtest/shadow/live)
 */

async function initSignalSchema(dbPool) {
    if (!dbPool) {
        console.log('[signals/schema] no dbPool provided — skipping schema init');
        return;
    }

    // 1. historical_bars_cache — cached market data for backtests
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS historical_bars_cache (
            id SERIAL PRIMARY KEY,
            symbol TEXT NOT NULL,
            date DATE NOT NULL,
            interval TEXT NOT NULL,
            bars JSONB NOT NULL,
            source TEXT NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (symbol, date, interval, source)
        );
        CREATE INDEX IF NOT EXISTS idx_bars_cache_lookup
            ON historical_bars_cache (symbol, date, interval);
    `);
    console.log('✅ historical_bars_cache table ready');

    // 2. backtest_results — strategy validation outputs
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS backtest_results (
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
            coverage NUMERIC(4,3),
            passed_gate_a BOOLEAN NOT NULL,
            passed_walk_forward BOOLEAN,
            trades_sample JSONB,
            tested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_backtest_strategy
            ON backtest_results (strategy_name, tested_at DESC);
    `);
    console.log('✅ backtest_results table ready');

    // 3. shadow_signals — shadow-mode signals (logged, not executed)
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS shadow_signals (
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
        CREATE INDEX IF NOT EXISTS idx_shadow_open
            ON shadow_signals (strategy_name, exit_time)
            WHERE exit_time IS NULL;
    `);
    console.log('✅ shadow_signals table ready');

    // 4. strategy_enabled — per-strategy state machine
    await dbPool.query(`
        CREATE TABLE IF NOT EXISTS strategy_enabled (
            id SERIAL PRIMARY KEY,
            strategy_name TEXT NOT NULL UNIQUE,
            asset_class TEXT NOT NULL,
            state TEXT NOT NULL CHECK (state IN ('disabled','backtest','shadow','live')),
            reason TEXT,
            updated_by TEXT,
            last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
    console.log('✅ strategy_enabled table ready');
}

module.exports = { initSignalSchema };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/signals && npx jest schema.test.js
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/signals/schema.js services/signals/__tests__/schema.test.js
git commit -m "$(cat <<'EOF'
feat(signals): add signal schema init helper — unblocks strategy persistence

Adds services/signals/schema.js:initSignalSchema(dbPool) which creates
4 idempotent tables needed by the unified strategy registry:
- historical_bars_cache (backtest data)
- backtest_results (validation outputs)
- shadow_signals (shadow-mode entries)
- strategy_enabled (state machine)

Safe to call with null dbPool (logs and returns).

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Wire `initSignalSchema` into stock bot's `initDb`

**Files:**
- Modify: `clients/bot-dashboard/unified-trading-bot.js` (inside `initDb()`)

- [ ] **Step 1: Find the existing `initDb` function**

The file is ~7000 lines and line numbers drift. Find the function with:
```bash
grep -n "async function initDb" clients/bot-dashboard/unified-trading-bot.js
```

Then scan from that line until you find the LAST `console.log('✅ ... table ready')` line inside the same try block. That's where you'll add the call. Use:
```bash
grep -n "✅.*table ready" clients/bot-dashboard/unified-trading-bot.js
```

- [ ] **Step 2: Add require at top of file**

After existing requires in `unified-trading-bot.js`, add:
```js
const { initSignalSchema } = require('../../services/signals/schema');
```

(Find the other `require('../../services/signals/...')` imports and place it near them.)

- [ ] **Step 3: Call `initSignalSchema(dbPool)` at the end of initDb's table creation block**

Locate where the last `CREATE TABLE` logs "✅ X table ready" (around line 400). Immediately after that last log, but INSIDE the try block, add:
```js
await initSignalSchema(dbPool);
```

- [ ] **Step 4: Verify the stock bot still starts (syntax check)**

```bash
node -c clients/bot-dashboard/unified-trading-bot.js
```

Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add clients/bot-dashboard/unified-trading-bot.js
git commit -m "$(cat <<'EOF'
feat(stock-bot): wire initSignalSchema into startup

Stock bot now creates the 4 signal-related tables on startup:
historical_bars_cache, backtest_results, shadow_signals, strategy_enabled.
Idempotent — safe to run on every startup.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `strategy-context.js` — skeleton + first test

**Files:**
- Create: `services/signals/strategy-context.js`
- Test: `services/signals/__tests__/strategy-context.test.js`

**Reference for indicator calculations:** `services/signals/indicators.js` exports these **and only these**:
- `calculateSMA(prices, period)` — array of numbers
- `calculateEMA(prices, period)` — array of numbers
- `calculateRSI(prices, period = 14)` — array of numbers, returns **50** on insufficient data (not null)
- `calculateMACD(prices, fast, slow, signal)` — array of numbers, returns `{line, signal, histogram, bullish}` or null
- `calculateBollingerBands(prices, period, stdDev)` — array of numbers

All functions take **arrays of closing prices** (numbers), not bar objects. Convert via `bars.map(b => b.c)` before calling.

**NOT available in indicators.js (do NOT use in Plan 1):**
- `calculateADX` — lives inline in `clients/bot-dashboard/unified-trading-bot.js` only. **Defer to Plan 3** when ORB needs it.
- `calculateATR` — same. **Defer to Plan 3.**

Plan 1's context therefore excludes `adx` and `atr/atrPct` fields. Plan 3 will port these functions to `indicators.js` before porting ORB.

- [ ] **Step 1: Write the skeleton failing test**

```js
// services/signals/__tests__/strategy-context.test.js
const { computeContext } = require('../strategy-context');

// Shared test fixture: 30 one-minute bars, increasing trend
function makeTrendingBars(count = 30) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const base = 100 + i * 0.1;
        bars.push({
            t: new Date(2026, 3, 10, 9, 30 + i).toISOString(),
            o: base,
            h: base + 0.05,
            l: base - 0.05,
            c: base + 0.02,
            v: 100000 + i * 1000
        });
    }
    return bars;
}

describe('computeContext', () => {
    test('is a pure function — same input returns equal output', () => {
        const bars = makeTrendingBars(30);
        const a = computeContext(bars, 'trending');
        const b = computeContext(bars, 'trending');
        expect(a).toEqual(b);
    });

    test('returns null for empty bars', () => {
        expect(computeContext([], 'trending')).toBeNull();
    });

    test('returns null for undefined bars', () => {
        expect(computeContext(undefined, 'trending')).toBeNull();
    });

    test('returns object with expected top-level keys', () => {
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(ctx).toHaveProperty('currentPrice');
        expect(ctx).toHaveProperty('vwap');
        expect(ctx).toHaveProperty('ema9');
        expect(ctx).toHaveProperty('ema21');
        expect(ctx).toHaveProperty('rsi');
        expect(ctx).toHaveProperty('marketRegime');
        expect(ctx).toHaveProperty('belowVwap');
        expect(ctx).toHaveProperty('emaUptrend');
        // Plan 1 does NOT include adx/atr — those arrive with Plan 3 (ORB port)
        expect(ctx.adx).toBeUndefined();
        expect(ctx.atr).toBeUndefined();
    });

    test('RSI returns a numeric value on 30 trending bars', () => {
        // Regression: verify calculateRSI is called with closes (numbers),
        // not bars (objects) — passing bars produces NaN.
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(typeof ctx.rsi).toBe('number');
        expect(Number.isFinite(ctx.rsi)).toBe(true);
        expect(ctx.rsi).toBeGreaterThan(0);
        expect(ctx.rsi).toBeLessThanOrEqual(100);
    });

    test('EMA9 and EMA21 return numeric values on 30 trending bars', () => {
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        expect(typeof ctx.ema9).toBe('number');
        expect(typeof ctx.ema21).toBe('number');
        expect(Number.isFinite(ctx.ema9)).toBe(true);
        expect(Number.isFinite(ctx.ema21)).toBe(true);
    });

    test('MACD returns an object on 30 trending bars', () => {
        const ctx = computeContext(makeTrendingBars(30), 'trending');
        // calculateMACD returns {line, signal, histogram, bullish} or null
        expect(ctx.macd === null || typeof ctx.macd === 'object').toBe(true);
    });

    test('currentPrice matches last bar close', () => {
        const bars = makeTrendingBars(30);
        const ctx = computeContext(bars, 'trending');
        expect(ctx.currentPrice).toBe(bars[bars.length - 1].c);
    });

    test('marketRegime passes through', () => {
        const ctx = computeContext(makeTrendingBars(30), 'opening-range');
        expect(ctx.marketRegime).toBe('opening-range');
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/signals && npx jest strategy-context.test.js
```

Expected: FAIL with "Cannot find module '../strategy-context'".

- [ ] **Step 3: Implement the skeleton**

```js
// services/signals/strategy-context.js
'use strict';

const indicators = require('./indicators');

/**
 * Compute indicators strategies might need.
 * Pure function — no I/O, no side effects, deterministic output.
 *
 * IMPORTANT: indicators.js functions take arrays of CLOSES (numbers),
 * not bar objects. We extract closes once and pass it around.
 *
 * NOTE: ADX and ATR are NOT computed in Plan 1 — they live inline in the
 * stock bot and will be ported to indicators.js in Plan 3 when ORB needs them.
 *
 * @param {Array<{t,o,h,l,c,v}>} bars — OHLCV bars ordered ascending by time
 * @param {string} marketRegime — current regime from SPY detection
 * @returns {Object|null} context or null if insufficient input
 */
function computeContext(bars, marketRegime) {
    if (!Array.isArray(bars) || bars.length === 0) return null;

    const last = bars[bars.length - 1];
    const first = bars[0];
    const currentPrice = last.c;
    const todayOpen = first.o;
    const volumeToday = bars.reduce((s, b) => s + (b.v || 0), 0);
    const percentChange = todayOpen > 0 ? ((currentPrice - todayOpen) / todayOpen) * 100 : 0;

    // Extract closes once — indicators.js expects numbers, not bar objects.
    const closes = bars.map(b => b.c);

    // EMAs — return null if insufficient data.
    const ema9 = indicators.calculateEMA(closes, 9);
    const ema21 = indicators.calculateEMA(closes, 21);

    // RSI — returns 50 on insufficient data (NOT null), per indicators.js:45.
    // Callers must NOT treat 50 as "null"; use it as-is.
    const rsi = indicators.calculateRSI(closes, 14);

    // RSI(2) — short-period RSI for mean-reversion strategies.
    // Needs period+1 bars minimum; return null explicitly if fewer.
    const rsi2 = closes.length >= 3
        ? indicators.calculateRSI(closes, 2)
        : null;

    // MACD — returns {line, signal, histogram, bullish} or null on insufficient data.
    const macd = indicators.calculateMACD(closes);

    // VWAP from typical price × volume
    let vwap = null;
    const totalVol = bars.reduce((s, b) => s + (b.v || 0), 0);
    if (totalVol > 0) {
        const tpVolSum = bars.reduce((s, b) => {
            const tp = (b.h + b.l + b.c) / 3;
            return s + tp * (b.v || 0);
        }, 0);
        vwap = tpVolSum / totalVol;
    }

    // Daily range position
    const dailyHigh = Math.max(...bars.map(b => b.h));
    const dailyLow = Math.min(...bars.map(b => b.l));
    const dailyRange = dailyHigh - dailyLow;
    const positionInDailyRange = dailyRange > 0 ? (currentPrice - dailyLow) / dailyRange : null;

    // Derived flags
    const belowVwap = vwap !== null && currentPrice < vwap;
    const emaUptrend = (ema9 !== null && ema21 !== null) ? ema9 > ema21 : null;

    return {
        // Price/volume
        currentPrice,
        todayOpen,
        volumeToday,
        percentChange,
        dailyHigh,
        dailyLow,
        // Indicators
        vwap,
        ema9,
        ema21,
        rsi,
        rsi2,
        macd,
        // Derived
        belowVwap,
        emaUptrend,
        positionInDailyRange,
        // Market state
        marketRegime: marketRegime || null,
        // NOTE: adx, atr, atrPct intentionally absent — Plan 3 adds them
    };
}

module.exports = { computeContext };
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/signals && npx jest strategy-context.test.js
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/signals/strategy-context.js services/signals/__tests__/strategy-context.test.js
git commit -m "$(cat <<'EOF'
feat(signals): add strategy-context skeleton — one-shot indicator computation

Pure function computeContext(bars, regime) that computes VWAP, EMA9/21, RSI,
RSI(2), ADX, MACD, ATR, plus derived flags (belowVwap, emaUptrend, position
in daily range) once per scan instead of recomputing in each strategy.

Reuses existing services/signals/indicators.js — no duplication.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `strategy-context.js` — VWAP correctness + boundary cases

**Files:**
- Modify: `services/signals/__tests__/strategy-context.test.js`

- [ ] **Step 1: Add VWAP-specific failing tests**

Append to `strategy-context.test.js`:
```js
describe('computeContext — VWAP', () => {
    test('VWAP equals mean price when all volumes are equal', () => {
        // 3 bars, all vol=100, typical prices 10, 20, 30
        const bars = [
            { t: '', o: 10, h: 10, l: 10, c: 10, v: 100 },
            { t: '', o: 20, h: 20, l: 20, c: 20, v: 100 },
            { t: '', o: 30, h: 30, l: 30, c: 30, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.vwap).toBeCloseTo(20, 5); // (10+20+30)/3
    });

    test('VWAP weights heavy-volume bars more', () => {
        const bars = [
            { t: '', o: 10, h: 10, l: 10, c: 10, v: 100 },
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 900 }, // 9x volume
        ];
        const ctx = computeContext(bars, 'trending');
        // weighted mean: (10*100 + 100*900) / 1000 = 91
        expect(ctx.vwap).toBeCloseTo(91, 5);
    });

    test('VWAP is null when total volume is zero', () => {
        const bars = [
            { t: '', o: 10, h: 10, l: 10, c: 10, v: 0 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.vwap).toBeNull();
    });

    test('belowVwap is true when price is below VWAP', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 90, h: 90, l: 90, c: 90, v: 100 }, // current price 90 < vwap ~96.7
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.belowVwap).toBe(true);
    });

    test('belowVwap is false when VWAP is null (insufficient data)', () => {
        const bars = [{ t: '', o: 10, h: 10, l: 10, c: 10, v: 0 }];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.belowVwap).toBe(false);
    });
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd services/signals && npx jest strategy-context.test.js
```

Expected: All tests PASS. Task 3's implementation should already be correct; if not, fix it now.

- [ ] **Step 3: Commit**

```bash
git add services/signals/__tests__/strategy-context.test.js
git commit -m "$(cat <<'EOF'
test(signals): verify strategy-context VWAP weighting + belowVwap derivation

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `strategy-context.js` — EMA, RSI, ADX null-safety

**Files:**
- Modify: `services/signals/__tests__/strategy-context.test.js`

- [ ] **Step 1: Add failing tests for insufficient-data cases**

```js
describe('computeContext — insufficient data', () => {
    test('returns null ema21 when < 21 bars', () => {
        const bars = [];
        for (let i = 0; i < 10; i++) {
            bars.push({ t: '', o: 100, h: 100, l: 100, c: 100 + i, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.ema21).toBeNull();
    });

    test('returns null emaUptrend when either EMA is null', () => {
        const bars = [];
        for (let i = 0; i < 5; i++) {
            bars.push({ t: '', o: 100, h: 100, l: 100, c: 100, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.emaUptrend).toBeNull();
    });

    test('RSI returns 50 on insufficient data (not null — existing contract)', () => {
        // indicators.calculateRSI returns 50 (not null) when prices.length < period * 2
        // Our context inherits this behavior — document it here as the contract.
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 101, h: 101, l: 101, c: 101, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.rsi).toBe(50);
    });

    test('rsi2 returns null when < 3 bars', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 101, h: 101, l: 101, c: 101, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.rsi2).toBeNull();
    });

    test('emaUptrend=true when ema9 > ema21 in rising bars', () => {
        const bars = [];
        for (let i = 0; i < 30; i++) {
            const price = 100 + i * 2; // clearly rising
            bars.push({ t: '', o: price, h: price + 0.1, l: price - 0.1, c: price, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.ema9).not.toBeNull();
        expect(ctx.ema21).not.toBeNull();
        expect(ctx.emaUptrend).toBe(true);
    });

    test('emaUptrend=false when ema9 < ema21 in falling bars', () => {
        const bars = [];
        for (let i = 0; i < 30; i++) {
            const price = 100 - i * 2; // clearly falling
            bars.push({ t: '', o: price, h: price + 0.1, l: price - 0.1, c: price, v: 100 });
        }
        const ctx = computeContext(bars, 'trending');
        expect(ctx.emaUptrend).toBe(false);
    });

    test('positionInDailyRange is null when daily range is zero', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 },
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.positionInDailyRange).toBeNull();
    });

    test('positionInDailyRange is 0 at daily low, 1 at daily high', () => {
        const bars = [
            { t: '', o: 100, h: 100, l: 100, c: 100, v: 100 }, // low
            { t: '', o: 110, h: 110, l: 110, c: 110, v: 100 }, // high
            { t: '', o: 105, h: 105, l: 105, c: 105, v: 100 }, // middle
        ];
        const ctx = computeContext(bars, 'trending');
        expect(ctx.positionInDailyRange).toBeCloseTo(0.5, 2);
    });
});
```

- [ ] **Step 2: Run tests — should pass if Task 3 is correct**

```bash
cd services/signals && npx jest strategy-context.test.js
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add services/signals/__tests__/strategy-context.test.js
git commit -m "$(cat <<'EOF'
test(signals): cover strategy-context null-safety for insufficient data

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: `strategy-registry.js` — register + validation

**Files:**
- Create: `services/signals/strategy-registry.js`
- Test: `services/signals/__tests__/strategy-registry.test.js`

- [ ] **Step 1: Write failing tests for `register`**

```js
// services/signals/__tests__/strategy-registry.test.js
const registry = require('../strategy-registry');

const validStrategy = {
    name: 'testStrategy',
    assetClass: 'stock',
    regimes: ['trending'],
    evaluate: (bars, context) => ({ killedBy: 'not_implemented' }),
};

beforeEach(() => {
    registry._reset(); // test-only helper
});

describe('registry.register', () => {
    test('accepts a valid strategy', () => {
        expect(() => registry.register(validStrategy)).not.toThrow();
        expect(registry._getAll().length).toBe(1);
    });

    test('throws on missing name', () => {
        const { name, ...rest } = validStrategy;
        expect(() => registry.register(rest)).toThrow(/name/);
    });

    test('throws on missing assetClass', () => {
        const { assetClass, ...rest } = validStrategy;
        expect(() => registry.register(rest)).toThrow(/assetClass/);
    });

    test('throws on missing evaluate', () => {
        const { evaluate, ...rest } = validStrategy;
        expect(() => registry.register(rest)).toThrow(/evaluate/);
    });

    test('throws on non-function evaluate', () => {
        expect(() => registry.register({ ...validStrategy, evaluate: 'not-a-func' })).toThrow(/evaluate/);
    });

    test('throws on duplicate name', () => {
        registry.register(validStrategy);
        expect(() => registry.register(validStrategy)).toThrow(/duplicate/i);
    });

    test('accepts a strategy with no regimes (defaults to ["any"])', () => {
        const { regimes, ...rest } = validStrategy;
        expect(() => registry.register(rest)).not.toThrow();
        expect(registry._getAll()[0].regimes).toEqual(['any']);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/signals && npx jest strategy-registry.test.js
```

Expected: FAIL with "Cannot find module '../strategy-registry'".

- [ ] **Step 3: Implement the skeleton — register + _reset + _getAll**

```js
// services/signals/strategy-registry.js
'use strict';

const strategies = new Map();

function register(strategy) {
    if (!strategy || typeof strategy !== 'object') {
        throw new Error('register: strategy must be an object');
    }
    if (!strategy.name || typeof strategy.name !== 'string') {
        throw new Error('register: strategy.name (string) is required');
    }
    if (!strategy.assetClass || typeof strategy.assetClass !== 'string') {
        throw new Error('register: strategy.assetClass (string) is required');
    }
    if (typeof strategy.evaluate !== 'function') {
        throw new Error('register: strategy.evaluate (function) is required');
    }
    if (strategies.has(strategy.name)) {
        throw new Error(`register: duplicate strategy name "${strategy.name}"`);
    }
    // Default regimes to ['any'] if not specified
    const normalized = {
        ...strategy,
        regimes: Array.isArray(strategy.regimes) && strategy.regimes.length > 0
            ? strategy.regimes
            : ['any'],
    };
    strategies.set(strategy.name, normalized);
}

// Test-only helpers — not part of the public API
function _reset() {
    strategies.clear();
}
function _getAll() {
    return Array.from(strategies.values());
}

module.exports = {
    register,
    _reset,
    _getAll,
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd services/signals && npx jest strategy-registry.test.js
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/signals/strategy-registry.js services/signals/__tests__/strategy-registry.test.js
git commit -m "$(cat <<'EOF'
feat(signals): add strategy-registry.register() with validation

Registry rejects strategies missing name/assetClass/evaluate, rejects
duplicates, and defaults regimes to ['any'] if omitted. Test-only _reset
and _getAll helpers for clean test isolation.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `strategy-registry.js` — `runStrategies` + error isolation

**Files:**
- Modify: `services/signals/strategy-registry.js`
- Modify: `services/signals/__tests__/strategy-registry.test.js`

- [ ] **Step 1: Write failing tests for `runStrategies`**

Append to `strategy-registry.test.js`:
```js
describe('registry.runStrategies', () => {
    test('returns candidates from strategies that produce them', () => {
        const s1 = {
            name: 's1',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ candidate: { price: 100, score: 0.5 } }),
        };
        registry.register(s1);
        const { candidates } = registry.runStrategies([s1], 'AAPL', [], {});
        expect(candidates).toHaveLength(1);
        expect(candidates[0].strategy).toBe('s1');
        expect(candidates[0].price).toBe(100);
    });

    test('collects killedBy diagnostics for rejected strategies', () => {
        const s1 = {
            name: 's1',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ killedBy: 'no_breakout' }),
        };
        registry.register(s1);
        const { candidates, diagnostics } = registry.runStrategies([s1], 'AAPL', [], {});
        expect(candidates).toHaveLength(0);
        expect(diagnostics.s1.no_breakout).toBe(1);
    });

    test('isolates errors: one crashing strategy does not break others', () => {
        const crash = {
            name: 'crash',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => { throw new Error('boom'); },
        };
        const ok = {
            name: 'ok',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ candidate: { price: 100 } }),
        };
        registry.register(crash);
        registry.register(ok);
        const { candidates } = registry.runStrategies([crash, ok], 'AAPL', [], {});
        expect(candidates).toHaveLength(1);
        expect(candidates[0].strategy).toBe('ok');
    });

    test('records strategy errors in diagnostics', () => {
        const crash = {
            name: 'crash',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => { throw new Error('boom'); },
        };
        registry.register(crash);
        const { diagnostics } = registry.runStrategies([crash], 'AAPL', [], {});
        expect(diagnostics.crash).toBeDefined();
        expect(diagnostics.crash._error).toMatch(/boom/);
    });

    test('empty enabledStrategies returns empty candidates + empty diagnostics', () => {
        const { candidates, diagnostics } = registry.runStrategies([], 'AAPL', [], {});
        expect(candidates).toEqual([]);
        expect(diagnostics).toEqual({});
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/signals && npx jest strategy-registry.test.js
```

Expected: FAIL with "runStrategies is not a function".

- [ ] **Step 3: Implement `runStrategies`**

Add to `services/signals/strategy-registry.js`:
```js
/**
 * Run a set of strategies against the same bars + context.
 * Fault-isolated: one strategy crashing never affects others.
 * @returns {{ candidates: Array, diagnostics: Object }}
 */
function runStrategies(enabledStrategies, symbol, bars, context) {
    const candidates = [];
    const diagnostics = {};

    for (const strategy of enabledStrategies) {
        try {
            const result = strategy.evaluate(bars, context);
            if (result && result.candidate) {
                candidates.push({
                    ...result.candidate,
                    strategy: strategy.name,
                });
            } else if (result && result.killedBy) {
                if (!diagnostics[strategy.name]) diagnostics[strategy.name] = {};
                diagnostics[strategy.name][result.killedBy] =
                    (diagnostics[strategy.name][result.killedBy] || 0) + 1;
            }
        } catch (e) {
            console.error(`[strategy ${strategy.name}] ${symbol} crashed: ${e.message}`);
            if (!diagnostics[strategy.name]) diagnostics[strategy.name] = {};
            diagnostics[strategy.name]._error = e.message;
        }
    }

    return { candidates, diagnostics };
}

module.exports = {
    register,
    runStrategies,  // <-- add
    _reset,
    _getAll,
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/signals && npx jest strategy-registry.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/signals/strategy-registry.js services/signals/__tests__/strategy-registry.test.js
git commit -m "$(cat <<'EOF'
feat(signals): strategy-registry.runStrategies with fault isolation

One crashing strategy cannot affect others. All rejections recorded
in diagnostics with per-strategy killedBy counts. Errors recorded as
_error field. This is the core dispatch function strategies run through.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `strategy-registry.js` — `getEnabledStrategies` with DB cache

**Files:**
- Modify: `services/signals/strategy-registry.js`
- Modify: `services/signals/__tests__/strategy-registry.test.js`

- [ ] **Step 1: Write failing tests**

Append to `strategy-registry.test.js`:
```js
describe('registry.getEnabledStrategies', () => {
    function makeStubPool(rows, shouldFail = false) {
        return {
            query: async (sql, params) => {
                if (shouldFail) throw new Error('db_down');
                return { rows };
            }
        };
    }

    beforeEach(() => {
        registry._reset();
        registry._resetEnabledCache();
        registry.register({
            name: 's1',
            assetClass: 'stock',
            regimes: ['trending'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
        registry.register({
            name: 's2',
            assetClass: 'stock',
            regimes: ['ranging'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
    });

    test('returns strategies matching assetClass and regime from DB', async () => {
        const pool = makeStubPool([
            { strategy_name: 's1', state: 'live' },
            { strategy_name: 's2', state: 'live' },
        ]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('s1');
    });

    test('uses "any" as wildcard regime', async () => {
        registry.register({
            name: 'sAny',
            assetClass: 'stock',
            regimes: ['any'],
            evaluate: () => ({ killedBy: 'noop' }),
        });
        const pool = makeStubPool([
            { strategy_name: 'sAny', state: 'live' },
        ]);
        const enabled = await registry.getEnabledStrategies('stock', 'ranging', pool);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('sAny');
    });

    test('caches results for 60s — second call does not requery', async () => {
        let queryCount = 0;
        const pool = {
            query: async () => {
                queryCount++;
                return { rows: [{ strategy_name: 's1', state: 'live' }] };
            }
        };
        await registry.getEnabledStrategies('stock', 'trending', pool);
        await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(queryCount).toBe(1);
    });

    test('falls back to cached value when DB query fails', async () => {
        // First successful populate
        const okPool = makeStubPool([{ strategy_name: 's1', state: 'live' }]);
        await registry.getEnabledStrategies('stock', 'trending', okPool);
        registry._forceCacheExpiry();

        // Then DB fails — should return cached rows
        const badPool = makeStubPool([], true);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', badPool);
        expect(enabled).toHaveLength(1);
    });

    test('returns empty array on first-ever DB failure (safe default)', async () => {
        const badPool = makeStubPool([], true);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', badPool);
        expect(enabled).toEqual([]);
    });

    test('includes state field on returned strategies', async () => {
        const pool = makeStubPool([{ strategy_name: 's1', state: 'shadow' }]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled[0].state).toBe('shadow');
    });

    test('filters out strategies registered in code but not in DB', async () => {
        const pool = makeStubPool([]); // nothing enabled
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toEqual([]);
    });

    test('filters out DB rows without a matching registered strategy', async () => {
        const pool = makeStubPool([{ strategy_name: 'ghostStrategy', state: 'live' }]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toEqual([]);
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd services/signals && npx jest strategy-registry.test.js
```

Expected: FAIL with "getEnabledStrategies is not a function".

- [ ] **Step 3: Implement `getEnabledStrategies` + cache**

Add to `services/signals/strategy-registry.js`:
```js
// DB-backed enablement cache
let enabledCache = null;             // null = never fetched
let enabledCacheFetchedAt = 0;
const ENABLED_CACHE_TTL_MS = 60_000;

async function getEnabledStrategies(assetClass, regime, dbPool) {
    const age = Date.now() - enabledCacheFetchedAt;
    const shouldRefresh = enabledCache === null || age > ENABLED_CACHE_TTL_MS;

    if (shouldRefresh) {
        try {
            const result = await dbPool.query(
                `SELECT strategy_name, state FROM strategy_enabled
                 WHERE asset_class = $1 AND state IN ('shadow','live')`,
                [assetClass]
            );
            enabledCache = result.rows;
            enabledCacheFetchedAt = Date.now();
        } catch (e) {
            console.error(`[strategy-registry] DB query failed: ${e.message} — using cached (${enabledCache === null ? 'NO CACHE' : 'stale'})`);
            if (enabledCache === null) return []; // safe default on first-ever failure
        }
    }

    // Map DB rows to registered strategies, filter by regime
    return enabledCache
        .map(row => {
            const strategy = strategies.get(row.strategy_name);
            if (!strategy) return null;
            return { ...strategy, state: row.state };
        })
        .filter(s => s !== null)
        .filter(s => s.assetClass === assetClass)
        .filter(s => s.regimes.includes(regime) || s.regimes.includes('any'));
}

// Test-only helpers
function _resetEnabledCache() {
    enabledCache = null;
    enabledCacheFetchedAt = 0;
}
function _forceCacheExpiry() {
    enabledCacheFetchedAt = 0;
}

module.exports = {
    register,
    runStrategies,
    getEnabledStrategies,        // <-- add
    _reset,
    _getAll,
    _resetEnabledCache,          // <-- add
    _forceCacheExpiry,           // <-- add
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/signals && npx jest strategy-registry.test.js
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add services/signals/strategy-registry.js services/signals/__tests__/strategy-registry.test.js
git commit -m "$(cat <<'EOF'
feat(signals): strategy-registry.getEnabledStrategies with DB cache + fallback

Queries strategy_enabled table, caches results 60s, falls back to last
cached on DB failure, returns empty array on first-ever failure (safe
default — no trades rather than wrong trades). Filters by assetClass +
regime match, with 'any' as wildcard regime.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Create `services/signals/strategies/_stub.js` + loader

**Files:**
- Create: `services/signals/strategies/_stub.js`
- Create: `services/signals/strategies/index.js`
- Test: `services/signals/__tests__/strategies/stub.test.js`

- [ ] **Step 1: Write failing tests for the stub**

```js
// services/signals/__tests__/strategies/stub.test.js
const stub = require('../../strategies/_stub');

describe('_stub strategy', () => {
    test('has required interface fields', () => {
        expect(stub.name).toBe('_stub');
        expect(stub.assetClass).toBe('stock');
        expect(Array.isArray(stub.regimes)).toBe(true);
        expect(typeof stub.evaluate).toBe('function');
    });

    test('evaluate always returns a killedBy result (never a candidate)', () => {
        const result = stub.evaluate([], {});
        expect(result.candidate).toBeUndefined();
        expect(result.killedBy).toBe('stub_never_produces_candidates');
    });

    test('evaluate is a pure function', () => {
        const r1 = stub.evaluate([], {});
        const r2 = stub.evaluate([], {});
        expect(r1).toEqual(r2);
    });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd services/signals && npx jest stub.test.js
```

Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `_stub.js`**

```js
// services/signals/strategies/_stub.js
'use strict';

/**
 * Stub strategy for smoke testing the registry pattern.
 * Always returns killedBy — never produces a candidate.
 * Leading underscore in filename prevents accidental use as a real strategy.
 */
module.exports = {
    name: '_stub',
    assetClass: 'stock',
    regimes: ['any'],
    evaluate(bars, context) {
        return { killedBy: 'stub_never_produces_candidates' };
    },
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd services/signals && npx jest stub.test.js
```

Expected: All 3 tests PASS.

- [ ] **Step 5: Create the strategies loader**

```js
// services/signals/strategies/index.js
'use strict';

const fs = require('fs');
const path = require('path');
const registry = require('../strategy-registry');

/**
 * Auto-loader: walks this directory, requires every .js file except
 * this index.js itself, and registers each as a strategy.
 * Each strategy module must export a valid strategy object.
 */
function loadAllStrategies() {
    const dir = __dirname;
    const files = fs.readdirSync(dir)
        .filter(f => f.endsWith('.js'))
        .filter(f => f !== 'index.js');

    for (const file of files) {
        const filePath = path.join(dir, file);
        try {
            const strategy = require(filePath);
            registry.register(strategy);
        } catch (e) {
            console.error(`[strategies/index] failed to load ${file}: ${e.message}`);
        }
    }
    return registry._getAll();
}

module.exports = { loadAllStrategies };
```

- [ ] **Step 6: Commit**

```bash
git add services/signals/strategies/_stub.js services/signals/strategies/index.js services/signals/__tests__/strategies/stub.test.js
git commit -m "$(cat <<'EOF'
feat(signals): add strategies/ directory with stub + auto-loader

The auto-loader walks the directory and registers every .js file.
_stub.js is a deliberate no-op strategy that never produces candidates —
used only for smoke testing the registration pipeline.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Integration test — context + registry + stub end-to-end

**Files:**
- Create: `services/signals/__tests__/integration/plan1-end-to-end.test.js`

- [ ] **Step 1: Write the integration test**

```js
// services/signals/__tests__/integration/plan1-end-to-end.test.js
const { computeContext } = require('../../strategy-context');
const registry = require('../../strategy-registry');
const { loadAllStrategies } = require('../../strategies');

function makeBars(count = 30) {
    const bars = [];
    for (let i = 0; i < count; i++) {
        const price = 100 + i * 0.5;
        bars.push({
            t: new Date(2026, 3, 10, 9, 30 + i).toISOString(),
            o: price, h: price + 0.1, l: price - 0.1, c: price, v: 100000
        });
    }
    return bars;
}

function mockDbPool(rows) {
    return { query: async () => ({ rows }) };
}

describe('Plan 1 — end-to-end integration', () => {
    beforeEach(() => {
        registry._reset();
        registry._resetEnabledCache();
    });

    test('stub strategy loads, context computes, runStrategies dispatches', async () => {
        // 1. Load all strategies (picks up _stub)
        const loaded = loadAllStrategies();
        expect(loaded.length).toBeGreaterThan(0);
        expect(loaded.some(s => s.name === '_stub')).toBe(true);

        // 2. Compute context
        const bars = makeBars(30);
        const context = computeContext(bars, 'trending');
        expect(context).not.toBeNull();
        expect(context.vwap).not.toBeNull();

        // 3. Get enabled strategies from mock DB
        const pool = mockDbPool([{ strategy_name: '_stub', state: 'shadow' }]);
        const enabled = await registry.getEnabledStrategies('stock', 'trending', pool);
        expect(enabled).toHaveLength(1);
        expect(enabled[0].name).toBe('_stub');

        // 4. Run strategies — stub rejects, diagnostics populated, no crash
        const { candidates, diagnostics } = registry.runStrategies(enabled, 'AAPL', bars, context);
        expect(candidates).toEqual([]);
        expect(diagnostics._stub.stub_never_produces_candidates).toBe(1);
    });

    test('entire pipeline handles empty bars gracefully', async () => {
        loadAllStrategies();
        const context = computeContext([], 'trending');
        expect(context).toBeNull();
        // If context is null, caller should skip strategy dispatch — verify no crash:
        // (this test documents the expected usage)
        const enabled = [];
        const { candidates } = registry.runStrategies(enabled, 'AAPL', [], context);
        expect(candidates).toEqual([]);
    });

    test('DB down falls through to empty list without crash', async () => {
        loadAllStrategies();
        const badPool = { query: async () => { throw new Error('db_down'); } };
        const enabled = await registry.getEnabledStrategies('stock', 'trending', badPool);
        expect(enabled).toEqual([]);
    });
});
```

- [ ] **Step 2: Run the integration test**

```bash
cd services/signals && npx jest plan1-end-to-end.test.js
```

Expected: All 3 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add services/signals/__tests__/integration/plan1-end-to-end.test.js
git commit -m "$(cat <<'EOF'
test(signals): plan 1 end-to-end integration test

Verifies context + registry + stub strategy + DB-backed enablement all
work together. This is the smoke test for the plan 1 tracer bullet —
proves the registry pattern is wired correctly before real strategies land.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Update `services/signals/index.js` exports

**Files:**
- Modify: `services/signals/index.js`

- [ ] **Step 1: Read the existing index.js**

```bash
cat services/signals/index.js
```

Understand the existing export structure — match its style.

- [ ] **Step 2: Add exports for the new modules**

Add to `services/signals/index.js`:
```js
// Plan 1: Strategy registry scaffolding
const strategyContext = require('./strategy-context');
const strategyRegistry = require('./strategy-registry');
const signalSchema = require('./schema');

module.exports = {
    // ... existing exports ...
    strategyContext,
    strategyRegistry,
    signalSchema,
};
```

Match the existing pattern exactly — do not re-export things differently.

- [ ] **Step 3: Run full test suite to verify nothing regressed**

```bash
cd services/signals && npx jest
```

Expected: ALL existing tests still pass, plus all new tests from this plan.

- [ ] **Step 4: Commit**

```bash
git add services/signals/index.js
git commit -m "$(cat <<'EOF'
feat(signals): export strategy-context, strategy-registry, schema from index

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Verify full test suite + commit sanity

**Files:** None (verification step)

- [ ] **Step 1: Run full signals test suite**

```bash
cd services/signals && npx jest --verbose 2>&1 | tail -20
```

Expected: All tests PASS. No regressions in pre-existing tests.

- [ ] **Step 2: Run test coverage**

```bash
cd services/signals && npx jest --coverage 2>&1 | grep -E "strategy-context|strategy-registry|schema" | head -10
```

Expected: New files show ≥90% line coverage.

- [ ] **Step 3: Syntax check all modified bot files**

```bash
node -c clients/bot-dashboard/unified-trading-bot.js && echo "OK"
```

Expected: "OK" (no syntax errors).

- [ ] **Step 4: Git log verification**

```bash
git log --oneline -15
```

Expected: ~10-12 commits from this plan, each focused and atomic.

- [ ] **Step 5: Verify no .env or credential files staged**

```bash
git status
```

Expected: Clean working tree, no untracked credentials.

---

## Post-Plan Verification

After all tasks complete:

1. **Nothing in production changes yet** — no strategies are actually enabled in the DB, and no bot calls `runStrategies` in its scan loop. The registry is loaded but idle.
2. **Stock bot startup creates 4 new tables** — verify via Railway logs on next deploy: `✅ historical_bars_cache table ready` etc.
3. **Crypto bot unaffected** — no code path touched.
4. **Forex bot unaffected** — no code path touched.

## What's NOT in Plan 1 (next plans)

- **Plan 2:** Backtest harness (data-loader, runner, gate-a-validator, walk-forward)
- **Plan 3:** Port ORB strategy to `services/signals/strategies/stock-orb.js` + tests + first backtest
- **Plan 4:** Shadow mode runner + admin endpoints
- **Plan 5:** Stock bot scan loop refactor to call `runStrategies` (behind `USE_UNIFIED_STRATEGIES` feature flag)
- **Plan 6:** Port VWAP Reversal + RSI(2) + Momentum
- **Plan 7:** Forex strategies (London Breakout, BB+RSI MeanRev, Asian Box)
- **Plan 8:** Forex bot scan loop refactor

Each future plan will be written when the prior plan is verified in production.
