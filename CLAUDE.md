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
| **Forex Bot** | 8080 | OANDA (practice) | 4 pairs (restricted) | Paused (`BOT_PAUSED=true`) |
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

### Forex Bot — v20.0 Evidence-Based (PAUSED)
- **File:** `deploy/forex-bot/bot.js`
- **London Breakout:** GBP/USD, USD/CHF only — H4 200-SMA trend filter
- **BB+RSI Mean Reversion:** EUR/USD, EUR/GBP only — ADX < 25 ranging filter
- Previous strategies had 0% win rate across 70+ trades — all disabled
- Paused via `BOT_PAUSED=true` env var on Railway

### Crypto Bot — Momentum + BTC Gate
- **File:** `deploy/crypto-bot/bot.js`
- **Win rate:** 34% (+$20.49 net)
- **Trend Pullback:** DISABLED (9.1% WR, -$17.94 over 11 trades)
- BTC SMA50 gate: blocks all altcoin longs when BTC is below its 50-period SMA
- Trades 24/7, 25 pairs on Kraken

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
- `clients/bot-dashboard/shared/auth.js` — Auth middleware, encryption, JWT, auth routes
- `services/trading/monte-carlo-sizer.js` — Monte Carlo position sizing

### Tests
- `services/signals/__tests__/` — 20 test suites, 129 tests
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

**Infrastructure:**
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET`, `JWT_REFRESH_SECRET` — auth tokens
- `NEXUS_API_SECRET` — API auth for config endpoints
- `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` — alerts

---

## Common Operations

### Check bot health
```bash
curl -s https://nexus-stock-bot-production.up.railway.app/health
curl -s https://nexus-forex-bot-production.up.railway.app/health
curl -s https://nexus-crypto-bot-production.up.railway.app/health
```

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

## Performance Baselines (April 2, 2026)

| Bot | Trades | Win Rate | Net P&L | Best Strategy |
|-----|--------|----------|---------|---------------|
| Stock | 47 | 36.9% | -$6.37 | ORB (breakeven) |
| Forex | 70+ | 0% | -$200+ | All disabled, v20.0 untested |
| Crypto | 58 | 29.3% | +$2.55 | Momentum (+$20.49) |

**Total across all bots:** 159 trades, ~breakeven. The bots execute trades correctly — the strategies need improvement.
