# CLAUDE.md — NexusTradeAI

**Version:** 4.0
**Last Updated:** April 2, 2026
**Status:** Paper trading, 3 bots live on Railway

---

## What This Project Is

Automated trading platform running 3 independent bots on Railway. Each bot is a single Node.js/Express monolith that scans markets, evaluates signals, and executes paper trades via broker APIs. A strategy bridge service provides AI-assisted signal evaluation.

**This is NOT production-ready.** Paper trading only. No real money.

---

## Live Services (Railway)

| Service | Port | Broker | Pairs | Status |
|---------|------|--------|-------|--------|
| **Stock Bot** | 8080 | Alpaca (paper) | ~135 US equities | Active — ORB strategy |
| **Forex Bot** | 8080 | OANDA (practice) | 4 pairs (restricted) | Active — v20 strategies wired, no real signals since Mar 9 (correctly gated by session/range conditions) |
| **Crypto Bot** | 8080 | Kraken (paper) | 25 crypto pairs | Active — momentum strategy |
| **Strategy Bridge** | 8080 | — | — | Active — AI evaluation |

All services use port 8080 on Railway (Railway routes externally). Local dev uses 3002/3005/3006/3004.

### Railway URLs
- Stock: `nexus-stock-bot-production.up.railway.app`
- Forex: `nexus-forex-bot-production.up.railway.app`
- Crypto: `nexus-crypto-bot-production.up.railway.app`
- Bridge: `nexus-strategy-bridge-production.up.railway.app`
- Dashboard: `nexus-dashboard-production-e6e6.up.railway.app`

---

## Active Strategies (April 2026)

### Stock Bot — ORB (Opening Range Breakout)
- **File:** `deploy/stock-bot/bot.js`
- **Win rate:** 36.9% (nearly breakeven at -$6.37)
- **Momentum strategy:** DISABLED (30% WR, -$43.84 over 10 trades)
- Scans ~135 stocks every 60s during market hours (9:30 AM–4:00 PM EST)
- Anti-churning: 15 trades/day, 3/symbol, 10-min cooldown

### Forex Bot — v20.0 Evidence-Based (ACTIVE, awaiting market conditions)
- **File:** `clients/bot-dashboard/unified-forex-bot.js` (deploy wrapper at `deploy/forex-bot/bot.js`)
- **boxBreakout (London Breakout):** GBP/USD, USD/CHF only — Asian box → London session breakout, H4 200-SMA trend filter. Inline at `unified-forex-bot.js:~2640-2780`. Signals tagged `strategy: 'boxBreakout'`.
- **meanReversion (BB+RSI):** EUR/USD, EUR/GBP only — H4 ADX < 30 ranging filter, BB extreme + RSI extreme entry. Inline at `unified-forex-bot.js:~2780-2890`. Signals tagged `strategy: 'meanReversion'`.
- `BOT_PAUSED` env var on Railway is **false**. `signals/strategies/forex-london-breakout.js` is dead code — registry never invoked.
- Last real-signal entry: **2026-03-09** (`pullbackContinuation`, legacy v17 path). Recent open positions tagged `trendContinuation` are orphan recoveries (`entry_context.session = "restored"`), not new signals.
- **Introspection:** `GET /api/forex/diagnose` returns per-pair eligibility, current H4 state, current blockers, and **cumulative rejection counters since boot** (key: `pair|strategy|reason`). Use this before guessing at filter values — see `feedback_introspection_first.md`.
- Disabled (legacy): trendFollowing / momentum / pullback (all `0% WR over 70+ trades`).

### Crypto Bot — Momentum + BTC Gate
- **File:** `clients/bot-dashboard/unified-crypto-bot.js` (deploy wrapper at `deploy/crypto-bot/bot.js`)
- **Win rate:** 47.7% (+$8.35 net) per dashboard 2026-05-07.
- **Trend Pullback:** DISABLED (9.1% WR, -$17.94 over 11 trades).
- BTC SMA50 gate: blocks all altcoin longs when BTC is below its 50-period SMA.
- Trades 24/7, 25 pairs on Kraken.
- **Exit-tuning env knobs (default OFF / unchanged behaviour):**
  - `CRYPTO_HARD_TIMESTOP_MIN` (default `480`) — hard close at this many minutes. Drop to `240` to halve the worst loss-runs that the dashboard shows dominate "Time Stop" exits at 481 min.
  - `CRYPTO_SOFT_TIMESTOP_MIN` (default `240`) — when to trail stop to breakeven.
  - `CRYPTO_MOMENTUM_FADE_EXIT` (default `false`). When `true`: any position with `|price - entry| / entry < CRYPTO_MOMENTUM_FADE_PCT` (default `0.003` = 0.3%) after `CRYPTO_MOMENTUM_FADE_AFTER_MIN` minutes (default `60`) is closed as `Momentum Fade Exit`. Targets the "entered but didn't follow through" pattern.
  - **Backtest before flipping any of these on**; they change live exit behaviour.

---

## Deploy Pipeline

```
git push main → GitHub Actions CI → Railway auto-deploy
```

**CI pipeline (.github/workflows/ci.yml):**
1. `test` — Jest signal module tests (20 suites, 129 tests) + shared auth tests (18 tests)
2. `dashboard-build` — lint, typecheck, Vite build (needs: test)
3. `smoke-tests` — health checks + API contract validation on all 5 Railway services

**Railway:** Each service has its own Railway project. Deploy dirs contain thin loaders (16 lines) that `require()` the source files from `clients/bot-dashboard/`. Railway clones the full repo, so all paths resolve. Filesystem is ephemeral — never use JSON files for persistence (use PostgreSQL).

---

## Key Files

### Bot Engines (single source of truth)
| File | Lines | What it does |
|------|-------|-------------|
| `clients/bot-dashboard/unified-trading-bot.js` | ~7,000 | Stock trading engine + Express API |
| `clients/bot-dashboard/unified-forex-bot.js` | ~5,300 | Forex trading engine + Express API |
| `clients/bot-dashboard/unified-crypto-bot.js` | ~5,100 | Crypto trading engine + Express API |

### Deploy Entry Points (thin loaders — DO NOT edit directly)
| File | Loads |
|------|-------|
| `deploy/stock-bot/bot.js` | `../../clients/bot-dashboard/unified-trading-bot.js` |
| `deploy/forex-bot/bot.js` | `../../clients/bot-dashboard/unified-forex-bot.js` |
| `deploy/crypto-bot/bot.js` | `../../clients/bot-dashboard/unified-crypto-bot.js` |

**Only edit `clients/bot-dashboard/` files. Deploy loaders are 16-line wrappers that set NODE_PATH and require the source.**

### Dashboard Frontend
- `clients/bot-dashboard/src/` — React 18 + TypeScript + Vite + MUI
- `clients/bot-dashboard/src/pages/Dashboard.tsx` — main view
- `clients/bot-dashboard/src/services/api.ts` — API client

### Shared Modules
- `services/signals/` — 22 signal modules (momentum, order-flow, FVG, indicators, normalizers, etc.)
- `services/signals/indicators.js` — RSI, EMA, SMA, MACD, Bollinger Bands
- `services/signals/normalizers.js` — Bar format adapters (crypto/forex/stock)
- `services/signals/compat.js` — Backward-compatible wrappers for inline function interfaces
- `services/signals/health-monitor.js` — Pure health-check primitives (scan/error/trading/memory) behind `/health`
- `services/signals/health-pnl.js` — DB-backed P&L/trade/position summary behind `/api/health/detailed` (read-only, never throws)
- `services/signals/kill-switch.js` — signal-time enforcement of `strategy_kill_switches` (opt-in via `ENFORCE_KILL_SWITCHES`; cached, fail-open)
- `services/signals/backtest/kill-switch-oos.js` — out-of-sample walk-forward evaluation of kill-switch enforcement (the evidence gate)
- `services/signals/engine-registry-summary.js` — per-user engine rollup + `operationalStatus` for `/api/health/detailed` (real trading is per-user, not the global env-cred engine)
- `clients/bot-dashboard/shared/auth.js` — Auth middleware, encryption, JWT, auth routes
- `services/trading/monte-carlo-sizer.js` — Monte Carlo position sizing

### Tests
- `services/signals/__tests__/` — 46 test suites, 561 tests (incl. `health-pnl.test.js` — 24 tests)
- `clients/bot-dashboard/shared/__tests__/` — 1 test suite, 18 tests (auth)
- `tests/unit/anti-churning.test.js` — 32 tests (anti-churning protection)
- `tests/unit/monte-carlo-sizer.test.js` — 28 tests (position sizer)
- Run: `npx jest tests/unit/ --config='{}'` or `cd services/signals && npx jest`

---

## Database

PostgreSQL on Railway (shared across all bots).

**Key tables:**
- `trades` — all trade records (`bot` column: 'stock', 'forex', 'crypto')
- `engine_state` — bot running state per user
- `users` — user accounts
- `strategy_regime_performance` — strategy performance by regime
- `evaluations` — AI signal evaluations from strategy bridge

**Query trades:**
```sql
SELECT * FROM trades WHERE bot='stock' AND status='closed' ORDER BY exit_time DESC LIMIT 20;
```

---

## Anti-Churning Protection (CRITICAL — do not modify without understanding)

**Location:** Each bot.js, ~lines 500-600 for constants, `canTrade()` function ~line 2500

**Rules:**
- Max 15 trades/day across all symbols
- Max 3 trades/symbol/day
- 10-min cooldown between trades on same symbol
- 60-min cooldown after stop-loss hit
- 1.5x cooldown for direction flips (buy→sell→buy)
- Profit-protect re-entry bypasses cooldowns (except daily limit)

**Background:** Dec 5, 2025 — bot executed 20 trades in 2 hours on SMX, losing ~$300. This system prevents that.

---

## Environment Variables

**Broker credentials (Railway env vars, never in code):**
- `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` — stock bot
- `OANDA_ACCOUNT_ID`, `OANDA_ACCESS_TOKEN` — forex bot
- `CRYPTO_API_KEY`, `CRYPTO_API_SECRET` — crypto bot (Kraken)

**Bot control:**
- `BOT_PAUSED=true` — pauses forex bot (survives Railway deploys)
- `MAX_TRADES_PER_DAY=15` — daily trade limit
- `CORS_ORIGIN` — comma-separated allowed origins
- `ENFORCE_KILL_SWITCHES=true` — **opt-in, per bot, default OFF.** When on, the bot skips signals whose `(strategy, market_regime)` bucket the daily auto-disable scanner flagged as statistically losing (`strategy_kill_switches`: n≥30, 95% CI upper < 0). Fail-open (a DB error never blocks); anti-churning `canTrade()` is unaffected. OOS evidence: `services/signals/backtest/kill-switch-oos.js` + EDGE_FINDINGS.md. Verify per bot via `/api/health/detailed → enforceKillSwitches`, and `GET /api/kill-switches → mode` (shadow|enforcing). **Currently only the `crypto/momentum/MEAN_REVERTING` bucket is flagged**, so turning it on mainly gates crypto momentum while in that regime; flags auto-expire in 7 days and re-evaluate daily.

**Infrastructure:**
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — auth tokens
- `NEXUS_API_SECRET` — API auth for config endpoints
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — alerts

---

## Common Operations

### Check bot health
```bash
# Fast liveness probe (scan/error/trading/memory status — Railway healthcheck uses this)
curl -s https://nexus-stock-bot-production.up.railway.app/health
curl -s https://nexus-forex-bot-production.up.railway.app/health
curl -s https://nexus-crypto-bot-production.up.railway.app/health
```

### Monitor performance without auth (P&L + positions + trades)
`GET /api/health/detailed` — **unauthenticated** monitoring view on each bot. Returns
DB-backed P&L (today + all-time), trade counts, win rate, and the live in-memory
position list. Built for uptime monitors, alerting, and accountability reporting
without digging into logs or the DB. Full contract: `docs/health-detailed-endpoint.md`.
```bash
curl -s https://nexus-crypto-bot-production.up.railway.app/api/health/detailed | jq
curl -s https://nexus-stock-bot-production.up.railway.app/api/health/detailed | jq '.pnl, .trades, .positions.live'
curl -s https://nexus-forex-bot-production.up.railway.app/api/health/detailed | jq
```
Numbers match `GET /api/trades/summary` exactly (same `status='closed'`,
NaN-guarded `pnl_usd` aggregation). Source: `services/signals/health-pnl.js`.

### Pull trade data
```bash
curl -s 'https://nexus-stock-bot-production.up.railway.app/api/trades?limit=50' -o /tmp/stock_trades.json
```

### Pause/unpause forex bot
Set `BOT_PAUSED=true` or `BOT_PAUSED=false` in Railway env vars for the forex service, or:
```bash
curl -X POST https://nexus-forex-bot-production.up.railway.app/api/trading/pause
```

### Run tests
```bash
cd services/signals && npx jest                    # signal tests
npx jest tests/unit/ --config='{}'                 # unit tests
```

### Deploy
```bash
git push origin main    # triggers CI → Railway auto-deploy
gh run list --limit 1   # check CI status
```

---

## Known Architectural Debt

1. **Monolith bot files** — 5,100–7,000 lines each, mixing API server + trading engine + signal processing. Auth, indicators, and signal analysis have been extracted to shared modules, but the core engine loop + route handlers are still inline.

2. **~~Triple duplication~~ RESOLVED** — deploy/ now uses thin loaders (16 lines each) that require the source from `clients/bot-dashboard/`. No more manual syncing. Railway watchPatterns must include `clients/bot-dashboard/**` and `services/signals/**`.

3. **Committee scorers + regime detectors still inline** — Each bot has custom committee scoring and regime detection that can't be trivially unified (different signal components, strategy routing, regime adjustments). `services/signals/committee-scorer.js` exists but bots use their own versions.

4. **Root jest.config.js broken** — references missing `tests/setup/custom-matchers.js`. Use `--config='{}'` to bypass.

5. **Signal-module loading is local-first on Railway** — Railway serves each bot from `deploy/<bot>/`, so `require('../../services/signals/X')` does **not** resolve in production. Modules that must work in prod use the dual pattern `require('./signals/X')` first (deploy.yml syncs them into `deploy/<bot>/signals/`), then fall back to `../../services/signals/X` for local dev. The big shared `try { require('../../services/signals/…') }` block at the top of each bot only loads in dev; in prod those names fall to their inline stubs/fallbacks. When adding a shared module a bot needs **at runtime in prod**, (a) add it to the deploy.yml sync list, and (b) load it local-first — not only inside the shared block. `health-monitor` and `health-pnl` follow this pattern.

---

## Rules for Making Changes

1. **Read the code before changing it.** These are 5,000+ line files — don't guess.
2. **Only edit `clients/bot-dashboard/` files.** Deploy dirs have thin loaders — never edit `deploy/*/bot.js` directly.
3. **Don't touch anti-churning** without reading the full `canTrade()` function and understanding the SMX incident.
4. **Don't increase position sizes or disable safety limits** without explicit approval.
5. **Verify after deploy.** "CI passed" ≠ "feature works." Check Railway logs.
6. **Never use JSON file persistence on Railway** — filesystem is ephemeral. Use PostgreSQL.
7. **Never commit .env files.** Credentials are in Railway env vars only.
8. **Run tests before committing.** `cd services/signals && npx jest` must pass.
9. **Railway watchPatterns** must include `clients/bot-dashboard/**` and `services/signals/**` for bot services — deploy/ dirs no longer change on code pushes.

---

## Performance Baselines (June 2, 2026)

| Bot | Trades | Win Rate | Net P&L | Best Strategy |
|-----|--------|----------|---------|---------------|
| Stock | 90 | 36.7% | -$82.79 | ORB (37.2% WR, -$10.67) — no signal since 2026-04-22 (regime gate: MEAN_REVERTING) |
| Forex | 30 | 0% | -$744.87 | All legacy disabled. v20.0 (boxBreakout + meanReversion) deployed but zero real signals since deploy — correctly gated |
| Crypto | 213 | 35.7% | -$28.67 | Momentum (37.1% WR, -$10.73) — flagged negative_edge in MEAN_REVERTING regime. Auto-disable cron fired (shadow mode, not enforcing) |

**Total across all bots:** 333 closed trades, all net-negative. The bots execute correctly — the strategies have no demonstrated edge (see EDGE_FINDINGS.md).

**Key issues:**
- Stock ORB silent since 2026-04-22 (regime gate blocks unless TRENDING_UP)
- Crypto momentum exits via Momentum Fade at ~60min with negligible PnL ($0.10 wins, -$0.03 losses)
- Forex v20.0 needs market conditions that haven't occurred since deploy
- Edge hunt CLOSED 2026-05-26 — no strategy tuning without overturning audit evidence
