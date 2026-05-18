# NexusTradeAI — Service Reference

The "**if X breaks, look here**" reference. One row per Railway service. Use alongside `docs/ARCHITECTURE.md` (the map) and `docs/adr/` (the why).

> **Caution (2026-05):** The repo root contains stale top-level Node files (`automation-server.js`, `trading-service.js`, `enhanced-integration-server.js`, `enhanced-market-data-server.js`, etc.) that are **not** the live services. They are unused legacy entrypoints. The live services are listed below.

---

## Service inventory (5 services, single Railway project)

| Railway service | Role | Deploy root | Entry | Healthcheck | Stack |
|---|---|---|---|---|---|
| `nexus-stock-bot` | Equities scanner + executor; **hosts JWT auth** | `deploy/stock-bot` | `node bot.js` → `unified-trading-bot.js` | `/health` | Node + Express + Alpaca |
| `nexus-forex-bot` | Forex scanner + executor | `deploy/forex-bot` | `node bot.js` → `unified-forex-bot.js` | `/health` | Node + Express + OANDA v20 |
| `nexus-crypto-bot` | Crypto scanner + executor | `deploy/crypto-bot` | `node bot.js` → `unified-crypto-bot.js` | `/health` | Node + Express + Kraken |
| `nexus-strategy-bridge` | Committee scoring, bandit, lessons engine | `services/strategy-engine` | `uvicorn strategy_bridge:app --host 0.0.0.0 --port $PORT` | `/health` | Python + FastAPI + asyncpg |
| `nexus-dashboard` | Static SPA host (built React) | `deploy/dashboard` | `node server.js` (Express static) | `/` | Node + Express + Vite-built React |

**Production URLs (baked into dashboard bundle, asserted by CI):**

- `https://nexus-stock-bot-production.up.railway.app`
- `https://nexus-forex-bot-production.up.railway.app`
- `https://nexus-crypto-bot-production.up.railway.app`
- `https://nexus-strategy-bridge-production.up.railway.app`
- `https://nexus-dashboard-production-e6e6.up.railway.app`

**Port assignment:** every service uses Railway-assigned `$PORT`. Do not hardcode.

---

## nexus-stock-bot

**Role.** Scans equities (ORB strategy primary). Hosts the single canonical `/api/auth/login` and `/api/auth/refresh` for the whole platform — see ADR-0001.

| Field | Value |
|---|---|
| Deploy root | `deploy/stock-bot` |
| Source-of-truth | `clients/bot-dashboard/unified-trading-bot.js` (synced by CI) |
| Entry | `bot.js` (thin Railway loader → `require('./unified-trading-bot')`) |
| Port | `$PORT` (Railway-assigned) |
| Healthcheck | `GET /health` (30s timeout) |
| Restart | `on_failure`, max 5 retries (Railway-managed; **not** PM2) |

**Required env vars:**

| Var | Purpose | Notes |
|---|---|---|
| `DATABASE_URL` | Postgres connection | Railway-injected |
| `JWT_SECRET` | JWT signing/verification (shared across all bots) | Must match crypto-bot, forex-bot. Drift = silent 401s on cross-service requests. |
| `JWT_REFRESH_SECRET` | Refresh-token signing | Shared with the other bots. |
| `NEXUS_API_SECRET` | Bearer for admin endpoints | Must match the value used by GHA workflows (`refresh-kill-switches`). |
| `CREDENTIAL_ENCRYPTION_KEY` | AES-256-GCM key for encrypted broker creds | 64 hex chars; falls back to `sha256(JWT_SECRET)` if missing (weaker). |
| `ALPACA_API_KEY`, `ALPACA_SECRET_KEY` | Per-user creds usually live in DB; these are fallbacks | Encrypted in `user_credentials` per user. |

**Endpoints (selected):**

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /health` | public | Railway healthcheck |
| `GET /api/trading/status` | `requireJwt` | Dashboard's "Stock" page hits this |
| `GET /api/trading/diagnose` | public | Gate-block diagnostic — introspection-first (ADR-0006) |
| `POST /api/auth/login` | public | Returns `{ accessToken, refreshToken }` |
| `POST /api/auth/register` | public | |
| `POST /api/auth/refresh` | public (refresh JWT in body) | The single refresh endpoint for the platform |
| `POST /api/auth/dev-login` | public (when no Auth service) | Local-dev fallback |
| `POST /api/admin/refresh-kill-switches` | `Bearer NEXUS_API_SECRET` | Called by GHA cron at 06:00 UTC |
| `POST /api/admin/trades/assign-user` | `Bearer NEXUS_API_SECRET` | One-shot backfill for legacy `user_id IS NULL` trades |

**Background loops:**

- Scan loop (interval driven; emits decisions → bridge → DB)
- Outcome worker (poll Alpaca for fills, write `trades` row with `decision_run_id` linkage)
- Orphan-cover loop (detect dangling positions, attempt safe close)
- Time-stop loop (close positions held past the strategy's max hold)

**Outbound:** Alpaca REST + websocket, strategy-bridge over HTTP, Postgres via `pg`.

**Restart command (operator):**
```bash
railway redeploy --service nexus-stock-bot
```

---

## nexus-forex-bot

**Role.** Forex scanner: London Breakout + BB+RSI mean reversion (v20.0). OANDA v20 broker.

| Field | Value |
|---|---|
| Deploy root | `deploy/forex-bot` |
| Source-of-truth | `clients/bot-dashboard/unified-forex-bot.js` |
| Entry | `bot.js` → `unified-forex-bot.js` |
| Port | `$PORT` |
| Healthcheck | `GET /health` |

**Required env vars:**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Must match stock-bot |
| `NEXUS_API_SECRET` | Admin Bearer |
| `OANDA_ACCOUNT_ID`, `OANDA_ACCESS_TOKEN`, `OANDA_PRACTICE` | v20 API (per-user encrypted equivalents in DB) |

**Endpoints (selected):**

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /api/forex/status` | `requireJwt` | Dashboard "Forex" page |
| `GET /api/forex/engine/status` | `requireJwt` | Deep engine state |
| `GET /api/forex/diagnose` | public | Gate-block diagnostic |

**Background loops:** scan, outcome, orphan-cover, time-stop. Captures `volume_ratio` since PR #13 — query `trades.volume_ratio` once 30+ forex trades close.

---

## nexus-crypto-bot

**Role.** Crypto scanner: momentum + box-reversion. Kraken broker.

| Field | Value |
|---|---|
| Deploy root | `deploy/crypto-bot` |
| Source-of-truth | `clients/bot-dashboard/unified-crypto-bot.js` |
| Entry | `bot.js` → `unified-crypto-bot.js` |
| Port | `$PORT` |
| Healthcheck | `GET /health` |

**Required env vars (additions over the shared set):**

| Var | Purpose | Notes |
|---|---|---|
| `KRAKEN_API_KEY`, `KRAKEN_API_SECRET` | Broker fallback | Per-user encrypted in DB |
| `CRYPTO_HIGH_VOL_FILTER` | Opt-in vol filter | Default off; set to `true` on Railway to enable (ADR-0010) |

**Endpoints (selected):**

| Method + Path | Auth | Notes |
|---|---|---|
| `GET /api/crypto/status` | public | Lightweight status — was the route in the recent 401 inspection |
| `GET /api/crypto/engine/status` | `requireJwt` | Full engine state |
| `GET /api/crypto/diagnose` | public | Gate-block diagnostic |
| `GET /api/crypto/decision-trace` | public | Per-symbol decision trace through all gates |
| `GET /api/crypto/futures/account` | `requireJwtOrApiSecret` | Account snapshot |
| `POST /api/crypto/futures/dry-run-order` | `requireJwtOrApiSecret` | Order preview |
| `GET /api/crypto/evaluations` | public | Recent signal evaluations |
| `GET /api/crypto/alpha-signal` | public | Bot's alpha-signal output |

**Background loops:** scan (every 5 min default), outcome, orphan-cover, time-stop. **Open issue:** orphan-cover uses a stop-loss-style limit price for buy-to-cover; in flat/up markets it never fills and orphans persist 14h+. Pending fix after hands-off (see `pending_2026_05_24_post_handsoff_backlog.md`).

---

## nexus-strategy-bridge

**Role.** Python service: Committee scoring, multi-armed bandit, lesson promotion, edge-attribution. The only persistence-aware brain that survives bot redeploys (ADR-0005).

| Field | Value |
|---|---|
| Deploy root | `services/strategy-engine` |
| Source-of-truth | same (no sync — deploys in place) |
| Entry | `uvicorn strategy_bridge:app --host 0.0.0.0 --port $PORT` |
| Port | `$PORT` |
| Healthcheck | `GET /health` (60s timeout — longer because cold start hydrates state from DB) |

**Required env vars:**

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres |
| `NEXUS_API_SECRET` | If bridge admin routes are protected |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` | If AI advisor enabled |

**Endpoints (selected):**

| Method + Path | Notes |
|---|---|
| `GET /health` | Health |
| `POST /agent/decide` | Called by every bot at signal time; returns bandit-arm + lessons_applied |
| `POST /agent/outcome` | Called by outcome worker after a trade closes |
| `GET /agent/decisions` | Recent decisions |
| `GET /agent/rankings` | Analyst rankings |
| `GET /agent/portfolio` | Cross-bot portfolio view |
| `GET /agent/bandit/stats` | Per-arm statistics |
| `GET /agent/bandit/context` | Context-bandit selection by `(regime, asset_class, tier)` |

**Outbound:** Postgres only (no broker calls).

**Critical operational note:** `asyncpg` rejects ISO strings for `TIMESTAMPTZ` columns and the rejection is hidden by try/except. Pass `datetime` objects or use SQL `NOW()`. Bridge persistence broke for weeks because of this — see ADR-0009.

---

## nexus-dashboard

**Role.** Express static-file server. Serves the pre-built React bundle from `dist/`. **No business logic** runs here — it's a thin SPA host.

| Field | Value |
|---|---|
| Deploy root | `deploy/dashboard` |
| Source-of-truth | React source in `clients/bot-dashboard/src/`; built dist committed to `deploy/dashboard/dist/` by CI (ADR-0004) |
| Entry | `node server.js` (`startCommand = "npm run start"`) |
| Port | `$PORT` |
| Healthcheck | `GET /` (returns 200 with `index.html`) |

**Required env vars:** none — the bundle has Railway URLs baked in at build time. `VITE_*_URL` overrides can be set at build time only.

**Endpoints:**

| Path | Notes |
|---|---|
| `/assets/index-<hash>.js` | Hashed bundle, cached 1y immutable |
| `/assets/<chunk>-<hash>.js` | Code-split route chunks |
| `/*` | Falls back to `index.html` (SPA routing) |

**Token lifecycle (dashboard side):**

- JWT stored as `localStorage['nexus_access_token']`, refresh as `localStorage['nexus_refresh_token']`
- All cross-service axios calls add `Authorization: Bearer <token>` via a single request interceptor in `clients/bot-dashboard/src/services/api.ts`
- 401 → response interceptor calls stock-bot's `/api/auth/refresh` once, retries the original request
- Proactive refresh: a timer fires `tryRefreshToken()` 60s before `exp` so the user never sees a console 401 on the normal expiry path (ADR-0002)
- Cross-tab `storage` event listener cancels stale timers when a sibling tab refreshes first

**Outbound:** none from `server.js` itself; the browser bundle calls the four bot/bridge services directly.

---

## Inter-service trust model

| Edge | Auth | Header / payload |
|---|---|---|
| Browser → any service | JWT (HS256 with shared `JWT_SECRET`) | `Authorization: Bearer <accessToken>` |
| Browser → stock-bot `/api/auth/refresh` | Refresh JWT | `{ refreshToken }` in body |
| GHA cron → stock-bot `/api/admin/*` | API secret | `Authorization: Bearer ${NEXUS_API_SECRET}` |
| Bot → strategy-bridge | None today (intra-Railway network) | Plain HTTP |
| Any → Postgres | DB role | `DATABASE_URL` (TLS) |
| Bot → external broker | Per-user encrypted creds | Per-broker auth (Alpaca key+secret, OANDA bearer, Kraken HMAC) |

**Cross-cutting verification (verified 2026-05-16):** `JWT_SECRET` SHAs match across stock-bot, forex-bot, crypto-bot. Drift = silent 401s on every cross-service request. The Bash one-liner that verifies this:

```bash
for svc in nexus-stock-bot nexus-crypto-bot nexus-forex-bot; do
  railway variables --service $svc --json \
    | jq -r '.JWT_SECRET' | shasum \
    | awk -v s=$svc '{print s ": " $1}'
done
```

Three identical hashes = good. Any drift = the bug.

---

## Postgres tables — ownership matrix

| Table | Writer(s) | Reader(s) | Notes |
|---|---|---|---|
| `users` | stock-bot (auth) | all bots | `user_id=1` is owner |
| `user_credentials` | all bots (settings page) | all bots | AES-256-GCM, IV per row |
| `positions` | respective bot | respective bot + dashboard | One row per open position |
| `trades` | respective bot (outcome worker) | all bots + bridge | `pnl_pct` ALWAYS decimal (not %) |
| `decisions` | respective bot (scan loop) | bridge + dashboard | `decision_run_id` is the join key |
| `scan_diagnostics` | respective bot | dashboard | Persisted across redeploys (ADR-0011) |
| `signal_evaluations` | respective bot | bridge | Per-strategy signal snapshots |
| `lessons` | strategy-bridge | bridge | Promoted from observations |
| `patterns` | strategy-bridge | bridge | Failure-mode patterns |
| `bandit_contexts` | strategy-bridge | bridge | `(regime, asset_class, tier) → arm` |
| `analyst_rankings` | strategy-bridge | dashboard | Updated by nightly training cycle |
| `strategy_kill_switches` | GHA cron job | dashboard + (future) bots | Shadow mode today (ADR-0008) |
| `market_regime` history | each bot | bridge | 4-state classifier output |

---

## Deploy pipeline (single workflow)

`.github/workflows/deploy.yml` — fires on every push to `main`.

1. **build-dashboard** — re-builds only if `clients/bot-dashboard/src/`, `index.html`, `vite.config.ts`, or `package.json` changed since the last real (non-`[skip ci]`) commit. Asserts no localhost URLs in the bundle and all 5 Railway production URLs present. Commits `deploy/dashboard/dist/` with `[skip ci]`.
2. **sync-bot-files** — copies `clients/bot-dashboard/unified-*-bot.js` and shared modules into each `deploy/*-bot/` leaf.
3. **(Railway auto-deploys)** — Railway's GitHub integration picks up the new commit and rebuilds each of the 5 services.
4. **smoke-test** — `GET /health` on the four backend services, `GET /` on the dashboard, and `GET /assets/<bundle-hash>.js` to confirm the new bundle is being served. Fails the workflow if any service is stale ~3 min after deploy.

**Concurrency.** `concurrency: deploy-production` with `cancel-in-progress: false`. Deploys are queued, never cancelled.

**Other scheduled workflows:**

| File | Cadence | Purpose |
|---|---|---|
| `auto-disable-stale-strategies.yml` | daily 06:00 UTC | Refreshes `strategy_kill_switches` |
| `nightly-strategy-health.yml` | daily | Promotion + cohort jobs |
| `morning-briefing.yml` | daily | Telegram summary |
| `ci.yml` | every PR | Lint + type + jest |
| `security.yml` | weekly + push | Dep audit |

---

## Operational runbook (quick reference)

| Symptom | Where to look |
|---|---|
| Dashboard shows transient 401 on first page load | Reactive 401 → refresh path (ADR-0002). Not a bug if it auto-recovers. |
| Cross-service 401 persists | Verify `JWT_SECRET` matches across all bots (cmd above) |
| Bot stopped trading | `GET /api/<asset>/diagnose` — read gate-block counts. Then `GET /api/kill-switches` to confirm shadow-mode entries (informational only, not enforced yet) |
| Strategy bridge brain reset to zero | Postgres connection lost during cold start, or `asyncpg` TIMESTAMPTZ error swallowed (ADR-0009) |
| Railway deploy failed | Check GHA `deploy.yml` logs, then Railway service logs. Most common: `JWT_SECRET` unset on a new service. |
| Stale dashboard bundle served | Hard refresh (Cmd+Shift+R). Bundle hash in served HTML should change after every dashboard source push. |
| Orphan positions in flat market | Crypto-bot orphan-cover limit-price bug — known, deferred until post-2026-05-24 |

---

## What does **not** live here

- New feature design → write an ADR in `docs/adr/`, not in this file
- Strategy tuning numbers → those live in the bot source itself (the operator's domain, not the architecture layer)
- Memory entries about active state → those live in `~/.claude/projects/.../memory/MEMORY.md` (auto-loaded by Claude Code, not for human navigation)
