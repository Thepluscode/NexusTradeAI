# NexusTradeAI — System Architecture

This is the authoritative architecture document. Operational details (env vars, endpoints, runbook entries) live in `docs/SERVICES.md`. Decision rationale lives in `docs/adr/`. This document is the **map**, not the **manual**.

---

## 1. Context (C4 Level 1)

NexusTradeAI is a personal multi-asset algorithmic trading platform run by a single operator. It scans equities, forex, and crypto markets continuously, decides whether to trade via a per-bot Committee scoring pipeline that consults a shared strategy bridge, places orders through external brokers, persists every decision/trade/outcome to Postgres, and surfaces state through a React dashboard.

```
                       ┌───────────────────────────────┐
                       │           Operator            │
                       │   (single-user, browser)      │
                       └──────────────┬────────────────┘
                                      │ HTTPS (JWT)
                                      ▼
                       ┌───────────────────────────────┐
                       │      nexus-dashboard          │
                       │  (Express + built React SPA)  │
                       └─────┬──────┬──────┬──────┬────┘
                             │      │      │      │   axios + Bearer JWT
              ┌──────────────┘      │      │      └────────────────┐
              ▼                     ▼      ▼                       ▼
   ┌──────────────────┐  ┌───────────────────┐  ┌────────────────────────┐
   │ nexus-stock-bot  │  │ nexus-forex-bot   │  │   nexus-crypto-bot     │
   │ Node + Express   │  │ Node + Express    │  │   Node + Express       │
   └──────┬───────────┘  └─────┬─────────────┘  └─────┬──────────────────┘
          │                    │                       │
          │      committee scoring + advisor calls     │
          └────────────┬───────┴───────────┬───────────┘
                       ▼                   ▼
              ┌──────────────────────────────────────┐
              │       nexus-strategy-bridge          │
              │   FastAPI / uvicorn (Python)         │
              │   Committee, bandit, lessons engine  │
              └──────┬────────────────────┬──────────┘
                     │                    │
                     ▼                    ▼
              ┌────────────────┐   ┌────────────────────────┐
              │ Postgres (Railway)│ │  External brokers     │
              │  (shared store)   │ │  Alpaca / OANDA /     │
              │                   │ │  Kraken (per bot)     │
              └────────────────┘   └────────────────────────┘
```

**External systems consumed:**

| System | Role | Used by |
|---|---|---|
| Alpaca | Stock execution + market data | stock-bot |
| OANDA v20 | Forex execution + ticks | forex-bot |
| Kraken | Crypto execution + klines | crypto-bot |
| Railway Postgres | Single shared OLTP store | all bots + strategy-bridge |
| GitHub (Actions) | Build, deploy, scheduled jobs | CI/CD |
| Telegram | Operator alerts | bots (optional) |

**Trust boundaries:**

- Browser ↔ services: JWT (`Authorization: Bearer <token>` signed with `JWT_SECRET`)
- Service ↔ service (admin-only routes): `NEXUS_API_SECRET` Bearer
- Service ↔ external brokers: per-broker API keys (per-user, encrypted at rest in Postgres via AES-256-GCM in `shared/auth.js#encryptCredential`)
- Service ↔ Postgres: `DATABASE_URL` injected by Railway

---

## 2. Containers (C4 Level 2)

Each container is one Railway service. All five share one repo and deploy via a single GitHub Actions workflow (`.github/workflows/deploy.yml`).

```
┌────────────────────────────────────────────────────────────────────────────┐
│                          GitHub repo (one branch: main)                    │
│                                                                            │
│   clients/bot-dashboard/                services/strategy-engine/          │
│   (React source — built in CI)          (Python — deployed in-place)       │
│           │ build (vite)                                                   │
│           ▼                                                                │
│   deploy/dashboard/dist/                 deploy/stock-bot/                 │
│   (built bundle — committed              deploy/forex-bot/                 │
│    by CI, served by Railway)             deploy/crypto-bot/                │
│                                          (bot source synced by CI from     │
│                                           clients/bot-dashboard/ —         │
│                                           see ADR-0003)                    │
└────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │  git push main triggers GHA
                                  ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                              Railway Platform                              │
│                                                                            │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐            │
│  │ nexus-stock-bot  │ │ nexus-forex-bot  │ │ nexus-crypto-bot │            │
│  │ rootDir:         │ │ rootDir:         │ │ rootDir:         │            │
│  │ deploy/stock-bot │ │ deploy/forex-bot │ │ deploy/crypto-bot│            │
│  │ port: $PORT      │ │ port: $PORT      │ │ port: $PORT      │            │
│  │ health: /health  │ │ health: /health  │ │ health: /health  │            │
│  └────────┬─────────┘ └─────┬────────────┘ └─────┬────────────┘            │
│           │                  │                    │                        │
│           └──────────────────┼────────────────────┘                        │
│                              │                                             │
│                              ▼                                             │
│  ┌──────────────────────────────────────┐  ┌──────────────────────────┐    │
│  │ nexus-strategy-bridge                │  │ nexus-dashboard          │    │
│  │ rootDir: services/strategy-engine    │  │ rootDir: deploy/dashboard│    │
│  │ uvicorn strategy_bridge:app          │  │ Express SPA host         │    │
│  │ port: $PORT  health: /health         │  │ port: $PORT  health: /   │    │
│  └──────────────────┬───────────────────┘  └──────────────────────────┘    │
│                     │                                                      │
│                     ▼                                                      │
│           ┌──────────────────────────┐                                     │
│           │ Postgres (Railway addon) │                                     │
│           │  DATABASE_URL injected   │                                     │
│           └──────────────────────────┘                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

**Why this shape:**

- One repo, one branch, one deploy pipeline (`deploy.yml`) — reduces coordination overhead for a single-operator system.
- Bot code is the **source-of-truth in `clients/bot-dashboard/`** and **synced** into each `deploy/*-bot/` leaf by CI. This is required because Railway's `rootDirectory` copies only the configured subdirectory to `/app/` and `../../` relative paths fail (ADR-0003).
- Dashboard is **built in GHA, committed as `deploy/dashboard/dist/`** with `[skip ci]` so Railway only serves the static bundle (ADR-0004).
- Strategy bridge is the only Python service. The bots call it over HTTP for committee scoring and to fetch ranked lessons.

---

## 3. Bot internals (C4 Level 3)

All three bots share the same internal shape. Differences are in the broker adapter and asset-class-specific signal modules.

```
                   ┌──────────────────────────────────────────┐
                   │              unified-<asset>-bot.js      │
                   │                                          │
                   │   Express app   ───┐                     │
                   │   ▲                ▼                     │
   HTTP (JWT) ─────┤   │       shared/auth.js                 │
                   │   │       (requireJwt, requireApiSecret) │
                   │   │                                      │
                   │   │       /api/<asset>/status            │
                   │   │       /api/<asset>/engine/{status,   │
                   │   │             start, stop, pause}      │
                   │   │       /api/<asset>/diagnose          │
                   │   │       /api/<asset>/decision-trace    │
                   │   │       /api/auth/{login,refresh,...}  │
                   │   │       /api/admin/...                 │
                   │                                          │
                   │   ┌────────────────────────────────────┐ │
                   │   │   Scan loop (setInterval)          │ │
                   │   │   ──────────────────────────────── │ │
                   │   │   1. Pull klines / quotes          │ │
                   │   │   2. Compute indicators            │ │
                   │   │   3. Per-strategy signal           │ │
                   │   │   4. Committee aggregator          │ │
                   │   │   5. Gate cascade (regime, risk,   │ │
                   │   │      kill-switch shadow, etc.)     │ │
                   │   │   6. POST to strategy-bridge       │ │
                   │   │   7. Place broker order            │ │
                   │   │   8. Log decision +                │ │
                   │   │      scanDiagnostics → Postgres    │ │
                   │   └────────────────────────────────────┘ │
                   │                                          │
                   │   ┌────────────────────────────────────┐ │
                   │   │  Outcome worker                    │ │
                   │   │  ─────────────────────────────     │ │
                   │   │  Polls open positions, detects     │ │
                   │   │  fills/closes, writes trade row    │ │
                   │   │  with decision_run_id linkage      │ │
                   │   └────────────────────────────────────┘ │
                   │                                          │
                   │   ┌────────────────────────────────────┐ │
                   │   │  Orphan-cover & time-stop loops    │ │
                   │   │  (handle dangling broker state)    │ │
                   │   └────────────────────────────────────┘ │
                   └──────────────────────────────────────────┘
                                       │
                                       ▼ axios
                            nexus-strategy-bridge
                            (committee, bandit, lessons)
                                       │
                                       ▼ asyncpg
                            Postgres (decisions, trades,
                            lessons, patterns, kill-switches,
                            scan_diagnostics, ...)
```

**Module map (consistent across bots):**

```
deploy/<asset>-bot/
├── bot.js                          # Thin Railway entry; loads unified bot
├── unified-<asset>-bot.js          # 7000–9000 LOC: Express + scan loop + outcomes
├── shared/auth.js                  # JWT/API-secret middleware, credential encryption
├── signals/                        # Asset-specific strategies (synced from services/signals/)
├── userCredentialStore.js          # Per-user encrypted broker creds
├── auto-optimizer.js               # Online weight nudging
├── signal-analytics.js             # Edge-attribution helpers
├── data/                           # Static config (symbol lists, regime params)
├── infrastructure/                 # DB pool, migration helpers
├── package.json                    # `node bot.js`
└── railway.toml                    # builder, startCommand, healthcheckPath
```

---

## 4. Data flow — trade lifecycle

```
   ┌─ scan tick ─────────────────────────────────────────────────────────────┐
   │ Bot                                                                     │
   │  1. Pull klines for symbol                                              │
   │  2. Compute features (ATR, VWAP, regime, volume_ratio, ...)             │
   │  3. Run per-strategy signal generators                                  │
   │  4. Aggregate via Committee (6-component score)                         │
   │  5. Apply gate cascade:                                                 │
   │       - global circuit breaker?                                         │
   │       - regime-permits-this-strategy?                                   │
   │       - portfolio heat OK?                                              │
   │       - kill_switches row says SKIP? (shadow-mode for now)              │
   │       - per-asset filters (e.g. CRYPTO_HIGH_VOL_FILTER)                 │
   │  6. POST /agent/decide → strategy-bridge                                │
   │       returns: bandit-arm, lessons_applied, confidence                  │
   │  7. INSERT decisions row (decision_run_id, gates, score, ...)           │
   │  8. If accepted: place broker order, INSERT positions row               │
   │  9. UPDATE scan_diagnostics (gateBlocks[gateName]++)                    │
   └─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (later, async)
   ┌─ outcome worker ────────────────────────────────────────────────────────┐
   │  1. Poll broker for fills / closes                                      │
   │  2. INSERT trades row with decision_run_id linkage                      │
   │  3. POST /agent/outcome → strategy-bridge                               │
   │       bridge updates lessons / patterns / bandit context tables         │
   │  4. UPDATE positions.status                                             │
   └─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
   ┌─ nightly (06:00 UTC, GHA cron) ─────────────────────────────────────────┐
   │  POST /api/admin/refresh-kill-switches (NEXUS_API_SECRET)               │
   │    → recomputes edge-attribution                                        │
   │    → upserts strategy_kill_switches rows where n≥30 AND CI_upper < 0    │
   │    → expires stale rows                                                 │
   │  (Bots OBSERVE the table but do not yet enforce — shadow mode, ADR-0008)│
   └─────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Sequence — operator login through to crypto status fetch

This is the exact flow exercised when the dashboard renders `/crypto`. Auth path was the subject of a recent incident (transient 401s); the proactive-refresh fix is documented in ADR-0002.

```
Operator        Dashboard (browser)         stock-bot           crypto-bot
   │                  │                        │                    │
   │  POST /api/auth/login (email, password)   │                    │
   │ ───────────────► │ ─────────────────────► │                    │
   │                  │                        │ verify password    │
   │                  │                        │ signTokens(JWT_SECRET)│
   │                  │ ◄───────────────────── │                    │
   │                  │ { accessToken, refreshToken }                │
   │                  │ localStorage.setItem('nexus_access_token')   │
   │                  │ scheduleProactiveRefresh()                   │
   │                  │   → setTimeout(exp - 60s) ─┐                 │
   │                  │                            │                 │
   │  navigate to /crypto                          │                 │
   │ ───────────────► │                            │                 │
   │                  │ GET /api/crypto/engine/status              │  │
   │                  │   Authorization: Bearer <accessToken>         │
   │                  │ ──────────────────────────────────────────► │
   │                  │                            │ requireJwt:      │
   │                  │                            │  verify(token,    │
   │                  │                            │   JWT_SECRET)     │
   │                  │ ◄───────────────────────────────────────── │  │
   │                  │ { isRunning, mode, positions, stats, ... }    │
   │                  │                            │                 │
   │ ... 23h59m later, proactive timer fires ─────►│                 │
   │                  │ POST {stockBot}/api/auth/refresh             │
   │                  │   body: { refreshToken }                     │
   │                  │ ─────────────────────► │                    │
   │                  │                        │ verify refresh JWT │
   │                  │                        │ signTokens()       │
   │                  │ ◄───────────────────── │                    │
   │                  │ { accessToken, refreshToken } (new pair)     │
   │                  │ localStorage updates                         │
   │                  │ scheduleProactiveRefresh()  (re-arm)         │
```

**Reactive 401 safety net:** if the proactive timer is throttled (tab in background, clock skew), the next request to any bot returns 401 → the response interceptor calls `/api/auth/refresh` → retries the original request with the fresh token (single retry only, gated by `original._retry`).

**Cross-tab coordination:** when one tab writes a new `nexus_access_token` to localStorage, sibling tabs receive a `storage` event and re-arm their timer against the new `exp`, preventing redundant concurrent refresh requests.

---

## 6. Data layer

One Postgres instance on Railway, shared by all five services. Some tables are written by one service and read by others — there is no service-owned schema isolation. This is intentional for a single-operator system; it trades isolation for query simplicity (cross-service joins live in the strategy bridge).

```
                 ┌─────────────────────────────────────────────┐
                 │              Postgres (Railway)             │
                 │                                             │
   Writes:       │  users                  ← stock-bot         │
   (one-way)     │  user_credentials       ← all bots          │
                 │  positions              ← respective bot    │
                 │  trades                 ← respective bot    │
                 │  decisions              ← respective bot    │
                 │  scan_diagnostics       ← respective bot    │
                 │  signal_evaluations     ← respective bot    │
                 │                                             │
                 │  lessons                ← strategy-bridge   │
                 │  patterns               ← strategy-bridge   │
                 │  bandit_contexts        ← strategy-bridge   │
                 │  analyst_rankings       ← strategy-bridge   │
                 │  strategy_kill_switches ← GHA cron job      │
                 │                                             │
   Reads:        │  All tables are read by any service that    │
   (any service) │  needs them. The strategy bridge does       │
                 │  most cross-table joins.                    │
                 └─────────────────────────────────────────────┘
```

**Key invariants:**

- `decisions.decision_run_id` is the join key linking a scan-tick decision to its eventual `trades` row, the `lessons` it applied, and the `bandit_contexts` arm it chose. **All four must remain populated** or the outcome-loop is broken (lesson: the 2026-04-26 outcome-loop fix).
- `trades.pnl_pct` is ALWAYS stored as a decimal (e.g. 0.014 = 1.4%), never as a percentage scalar. See `feedback_pnl_corruption.md`.
- `users.user_id = 1` is the admin/owner account. 71 legacy trades have `user_id=NULL` and need the one-shot backfill via `POST /api/admin/trades/assign-user`.
- `asyncpg` requires `datetime` objects for `TIMESTAMPTZ` columns. **Never pass an ISO string** — it silently fails inside a try/except and broke bridge persistence for weeks. See ADR-0009.

---

## 7. Deploy pipeline

Single GitHub Actions workflow at `.github/workflows/deploy.yml`. Triggers on every push to `main`.

```
push main
   │
   ▼
build-dashboard
   │  - skip if no clients/bot-dashboard/src/ changes since last real (non [skip ci]) commit
   │  - npm install + npm run build (Vite)
   │  - assert no localhost URLs in bundle
   │  - assert all 5 Railway prod URLs present in bundle
   │  - rm -rf deploy/dashboard/dist/assets
   │  - cp -r clients/bot-dashboard/dist/. deploy/dashboard/dist/
   │  - git commit -m "chore: sync deploy files (bot-only) [skip ci]"
   │  - git push (rebase-on-conflict)
   │
   ▼
sync-bot-files
   │  - copy clients/bot-dashboard/unified-*-bot.js and shared modules
   │    into deploy/{stock,forex,crypto}-bot/
   │  - same [skip ci] commit pattern
   │
   ▼
(Railway auto-deploys all 5 services from the new commit SHA)
   │
   ▼
smoke-test
   │  - GET /health on stock-bot, forex-bot, crypto-bot, strategy-bridge
   │  - GET / on dashboard
   │  - GET /assets/<bundle-hash>.js to confirm new bundle is served
   │  - fail loudly if any service is older than ~3 min after deploy
```

**Other scheduled GHA workflows:**

- `auto-disable-stale-strategies.yml` — daily 06:00 UTC; refreshes `strategy_kill_switches` table (shadow mode, ADR-0008).
- `nightly-strategy-health.yml` — daily; runs the lesson-promotion + cohort-stratification jobs.
- `morning-briefing.yml` — daily summary to Telegram.
- `ci.yml` — PR validation: lint, type-check, jest.
- `security.yml` — dep audit + scan.

---

## 8. What lives where (canonical paths)

| Concern | Path |
|---|---|
| Stock bot source-of-truth | `clients/bot-dashboard/unified-trading-bot.js` |
| Forex bot source-of-truth | `clients/bot-dashboard/unified-forex-bot.js` |
| Crypto bot source-of-truth | `clients/bot-dashboard/unified-crypto-bot.js` |
| Shared auth (synced) | `clients/bot-dashboard/shared/auth.js` |
| Signal modules (synced) | `services/signals/` |
| Strategy bridge | `services/strategy-engine/strategy_bridge.py` |
| Bandit supervisor | `services/strategy-engine/agents/supervisor_bandit.py` |
| Dashboard React source | `clients/bot-dashboard/src/` |
| Dashboard built bundle | `deploy/dashboard/dist/` (CI-generated) |
| Deploy leaves (do not edit by hand) | `deploy/{stock,forex,crypto}-bot/`, `deploy/dashboard/` |
| GitHub Actions | `.github/workflows/` |
| Architecture (this file) | `docs/ARCHITECTURE.md` |
| Operational service reference | `docs/SERVICES.md` |
| Decision rationale | `docs/adr/` |
| Restructure proposal | `docs/RESTRUCTURE_PROPOSAL.md` |
| Live feature board | `FEATURE_TRACKER.md` |
| Memory (auto-loaded by Claude) | `~/.claude/projects/.../memory/MEMORY.md` |

---

## 9. Active hands-off period (operator note)

While reading this document, note: there is an active 14-day hands-off period **2026-05-10 → 2026-05-24** on bot code changes (no tuning, no new strategies, no filter additions — bugs only). See `feedback_14_day_handsoff_2026_05_10.md` in memory. This architecture doc describes the **shape**; do not let it become a launch ramp for new features mid-hands-off.

---

## 10. Open architectural questions (intentionally unresolved)

These are flagged for future ADRs once they're decided:

1. **Schema isolation per service** — currently all bots share one Postgres. Worth splitting if any one bot's write volume becomes a noisy neighbor.
2. **Strategy bridge as the only Python service** — alternative: collapse into one of the bots, or keep separate for ML-library coexistence. Current answer: keep separate (different runtime, different deploy cadence).
3. **Single-tenant vs multi-tenant** — `users` table exists and per-user credentials are encrypted, but only `user_id=1` is real. Multi-tenant story is unwritten.
4. **Static-asset CDN for dashboard** — currently Railway serves the bundle directly. Cloudflare in front would cut first-byte latency.
5. **Kill-switch enforcement gate** — shadow mode today (ADR-0008). The bot-side gate code is the next merge once a few weeks of table observation validate the disable decisions.
