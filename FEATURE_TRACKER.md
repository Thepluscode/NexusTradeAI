# Feature Tracker — NexusTradeAI

**Last verified:** 2026-05-22
**Verification method:** Live `/health` probes + `GET /api/trades?bot=<bot>&limit=1000` pulls + API endpoint probes against Railway production.
**Prior refresh:** 2026-05-13 (see Changelog at bottom for what moved).

> Status legend: `PLANNED` → `IN PROGRESS` → `DEPLOYED` → `VERIFIED` → `DISABLED` (intentionally off) → `BROKEN` (deployed but failing)
>
> **VERIFIED** requires production evidence (HTTP response, DB row, trade row, log). "CI passed" and "deploy succeeded" are NOT verification.

---

## Live Services (Railway)

| Service | URL | Status | Evidence (2026-05-22 09:57Z) |
|---|---|---|---|
| Stock Bot | `nexus-stock-bot-production.up.railway.app` | VERIFIED | `/health` → `{status:"ok", scan ok (lastScanMs 44s), errors 0/5m, positions:0, tradesToday:0, heapUsedMB:32}` |
| Forex Bot | `nexus-forex-bot-production.up.railway.app` | VERIFIED | `/health` → `{status:"ok"}` |
| Crypto Bot | `nexus-crypto-bot-production.up.railway.app` | VERIFIED | `/health` → `{status:"ok"}` |
| Strategy Bridge | `nexus-strategy-bridge-production.up.railway.app` | VERIFIED | `/health` → 200; strategies `[regime_momentum, volatility_arbitrage, pairs_trading]`; AI advisor available (`claude-sonnet-4-20250514`); 30 symbols cached, 12 active pairs |
| Dashboard | `nexus-dashboard-production-e6e6.up.railway.app` | VERIFIED | `/` → 200, React app renders |

> **Stale alias:** `nexus-dashboard-production.up.railway.app` (no `-e6e6`) returns **502**. Use the `-e6e6` host. Low severity — cosmetic/legacy alias.

---

## Trading Performance — Live (2026-05-22)

> All numbers from `GET /api/trades?bot=<bot>&limit=1000` against production. Win rate = trades with `pnl_usd > 0`. P&L = sum of `pnl_usd`. **0 open positions across all three bots.**

### Stock Bot — 90 closed trades

| Strategy | Status | Trades | Win Rate | Net P&L | Notes |
|---|---|---|---|---|---|
| openingRangeBreakout (ORB) | VERIFIED | 78 | 37.2% | **-$10.67** | Best stock strategy, near breakeven. **Last entry 2026-04-22 — no ORB signal in ~1 month.** |
| momentum | DISABLED? | 12 | 33.3% | **-$72.12** | ⚠️ Tracker claims disabled, but **one new momentum trade fired 2026-05-13** (WOLF, −$31.11). `last_entry=2026-05-13`. See Discrepancies. |

**Stock total: 90 closed, 36.7% WR, -$82.79 net.** (Was 89 / -$51.68 on 2026-05-13 — the single new momentum trade added −$31.11.)

### Forex Bot — 30 closed trades

| Strategy | Status | Trades | Win Rate | Net P&L | Notes |
|---|---|---|---|---|---|
| pullbackContinuation (legacy v17) | DISABLED | 22 | **0%** | **-$308.90** | Dead path. Last entry 2026-03-09. |
| trendContinuation (legacy) | DISABLED | 8 | **0%** | **-$435.97** | Orphan-recovery closeouts (`entry_context.session = "restored"`). One new closeout 2026-05-15 settled at **$0.00** (net unchanged). |
| boxBreakout (v20.0) | DEPLOYED | 0 | n/a | $0 | Code live, GBP/USD + USD/CHF. **Still zero real signals since deploy.** Correctly gated (Asian-box + H4 200-SMA). |
| meanReversion (v20.0) | DEPLOYED | 0 | n/a | $0 | Code live, EUR/USD + EUR/GBP. **Still zero real signals since deploy.** Correctly gated (H4 ADX < 30). |

**Forex total: 30 closed, 0% WR, -$744.87 net.** All losses from disabled legacy paths. v20.0 active strategies remain correctly gated — not broken, just no qualifying conditions.

### Crypto Bot — 213 closed trades

| Strategy | Status | Trades | Win Rate | Net P&L | Notes |
|---|---|---|---|---|---|
| momentum + BTC SMA50 gate | VERIFIED | 202 | 37.1% | **-$10.73** | ⚠️ **Flipped net-negative.** Was +$17.87 / 45.5% WR on 2026-05-13. +90 new trades since, WR dropped 8.4pts. Last entry 2026-05-20. Edge engine flags negative edge in MEAN_REVERTING regime (see below). |
| trendPullback | DISABLED | 11 | 9.1% | **-$17.94** | Confirmed disabled. Last entry 2026-03-23. |

**Crypto total: 213 closed, 35.7% WR, -$28.67 net.** (Was 123 / -$0.07 on 2026-05-13.) The platform's previously-only-profitable strategy is now net-negative all-time.

> **All three bots are net-negative all-time:** stock −$82.79, forex −$744.87, crypto −$28.67. Reported as outcome data only — strategy decisions are the founder's call (and the hands-off freeze runs through 2026-05-24).

---

## Edge Attribution & Auto-Disable (NEW verification 2026-05-22)

| Feature | Status | Evidence |
|---|---|---|
| `/api/edge-attribution` (forex-bot host) | **VERIFIED** | 200, real data. 30d window, min_n=5. Crypto momentum split by regime: `(pre-2026-05-09)` n=32 / 56.3% / +$5.9 / inconclusive; **`MEAN_REVERTING` n=107 / 30.8% / −$37.05 / `negative_edge`**. Only crypto momentum has n≥5 in 30d. |
| `/api/kill-switches` (forex-bot host) | **VERIFIED** | 200, `mode:"shadow"`, **1 active flag**: crypto/momentum/MEAN_REVERTING — `disabled_at 2026-05-22T07:19Z`, `expires 2026-05-29T07:19Z`, reason `n=107, pnl=$-37.05, 95%CI upper=-0.0013`. |
| Shadow-mode auto-disable cron | **VERIFIED** | **Fired for the first time 2026-05-22 07:19Z** — flagged crypto momentum (MEAN_REVERTING). Previously DEPLOYED-but-never-triggered. Shadow mode = observe-only; **bots do not enforce yet** (by design). |
| `/api/edge-attribution` **stats upgrade** — stationary-bootstrap CI + n_effective + regime fields + DSR (Item 3, PR #44) | **READY — NOT DEPLOYED** | Draft PR #44 (supersedes #43, which undercovered at the operational n). Local evidence only: 93–95% CI coverage at n=50/70/130 vs parametric 82–86% (`node services/signals/edge-stats-coverage.js`); full signals suite 537 tests green. **NOT verified — not merged, not deployed, zero prod evidence.** Verification gate ↓ |

> **Item 3 (PR #44) verification gate — do NOT mark VERIFIED until all of these:**
> 1. Freeze ended (≥2026-05-25). 2. **Item 4 (PR #37) merged + VERIFIED in prod first** (better stats on an unlinked dataset is still the wrong dataset). 3. Item 3 itself merged + deployed to the forex-bot service. 4. Live check: `curl -s '.../api/edge-attribution' ` returns `method:"stationary_bootstrap"` and per-bucket `n_effective` / `regime_counts` / `dominant_regime_share` / `sharpe` / `dsr` / `dsr_pvalue` with sane values, and `pnl_pct_ci_low/high` reflect the bootstrap. Only after observing (4) does this flip to VERIFIED. (Item 4 *deploying* alone is NOT verification of Item 3.)

> The loop works end-to-end: edge attribution detected negative edge → auto-disable cron flagged it in shadow mode. First real proof this system functions in production. Enforcement is still off by design.

---

## Core Trading Engine

| Feature | Status | Evidence |
|---|---|---|
| Anti-churning (`canTrade()`) — 15/day, 3/symbol, 10min cooldown | VERIFIED | Inline in each bot's `unified-*-bot.js`. 32 unit tests pass in `tests/unit/anti-churning.test.js`. |
| Paper-trading broker endpoints (Alpaca paper / OANDA practice / Kraken paper) | VERIFIED | Per CLAUDE.md trading-safety rules. Never switched to live. |
| Monte Carlo position sizer | VERIFIED | `services/trading/monte-carlo-sizer.js`. 28 unit tests pass. |
| Signal modules (22 modules) | VERIFIED | `services/signals/`. 20 test suites, 129 tests pass. |
| Shared auth (JWT, encryption, middleware) | VERIFIED | `clients/bot-dashboard/shared/auth.js`. 18 tests pass. |
| Committee scorer | DEPLOYED | `services/signals/committee-scorer.js` exists. Bots use inline versions (architectural debt). |
| Regime detection (System-1 4-state) | VERIFIED | Stamped on live trades; visible in `entry_context.marketRegime` and now driving edge/kill-switch regime splits. |
| Edge attribution endpoint | VERIFIED | `/api/edge-attribution` returns real prod data (2026-05-22). See dedicated section above. |
| Shadow-mode auto-disable cron | VERIFIED | Fired first flag 2026-05-22. See dedicated section above. |
| SMA50 tolerance band (crypto downtrend filter) | DEPLOYED | Default 0.2%. FP/FN impact still not measured. |

---

## Dashboard & APIs

| Feature | Status | Evidence |
|---|---|---|
| Dashboard React app (Vite + MUI) | VERIFIED | Loads at `-e6e6` host `/`, renders structured data. |
| `/api/trades` (cross-bot aggregator on stock-bot; `?bot=` to scope) | VERIFIED | Returns full trade rows with `pnl_usd`, `entry_context`, regime, `decision_run_id`. |
| `/api/intraday-equity` (realized P&L curves) | **VERIFIED** | 200, valid `{stock,forex,crypto}` 24h arrays (all zero now — quiet market, last trade 2026-05-20). SQL syntax confirmed fixed. |
| `/api/recent-trades` | **VERIFIED** | 200 on **forex-bot** and **dashboard-e6e6** hosts. **404 on stock-bot** (wrong host — not a bug). |
| Trade history page | DEPLOYED | UI exists. Not E2E verified in browser. |
| Backtest page | DEPLOYED | UI exists. Not E2E verified in browser. |
| WebSocket real-time updates | DEPLOYED | Code present. Not verified with real WS client. |

---

## Infrastructure

| Feature | Status | Evidence |
|---|---|---|
| Railway deployments (5 services) | VERIFIED | All `/health` endpoints 200 (2026-05-22). |
| PostgreSQL (shared across bots) | VERIFIED | Trade rows persist with `pnl_usd`, `entry_context`, regime, `decision_run_id`. |
| GitHub Actions CI pipeline | VERIFIED | `.github/workflows/ci.yml`. Recent runs green. |
| Deploy: thin-loader pattern (`deploy/*/bot.js` → `clients/bot-dashboard/*.js`) | VERIFIED | 16-line wrappers. |
| Gitleaks pre-commit secret scan | DEPLOYED | Per commit `4c66f1d` + `.gitleaks.toml` + `.husky/`. Hook installed; not yet verified to have blocked a real secret. |
| Telegram alerts | DEPLOYED | Env vars present. Not verified to fire on real events. |
| Manifest-driven module loading + observable stubs — crypto (RFC #46) | VERIFIED | 2026-06-10: prod `GET /api/health/detailed → sharedModules` = `{16 real (all local, fromServices:0), 7 stub}`; stub set exactly matches golden-parity prediction (big-block ×6 chain-broken at `api-handlers` + `monte-carlo-sizer`); kill-switch/health/normalizers REAL. 18 loader tests + parity + deploy.yml contract test in CI. Forex/stock migrations PLANNED. |
| `monte-carlo-sizer.js` tracked in git (was silently untracked) | DEPLOYED | Commit `968892f`: `services/trading/` blanket-gitignore swallowed it — CI/fresh clones ran the inline Kelly stub while its unit test was tracked. Found by the RFC #46 parity test. |

---

## Discrepancies — Investigated 2026-05-22 (read-only, freeze-safe)

| # | Discrepancy | Verdict | Action |
|---|---|---|---|
| 1 | Stock `momentum` marked DISABLED but a momentum trade fired 2026-05-13 (WOLF, −$31.11). | **CONFIRMED BUG** — two analyze paths drifted. The global/shadow scan `analyzeMomentum()` disabled momentum 2026-04-02 (`if (false && momentumAllowed)`, line 4150, commit `b466092`), but the per-user engine `analyzeMomentumForEngine()` still runs it (`if (momentumAllowed)`, line 7043, pushes `strategy:'momentum'` at 7092). Real-money per-user accounts kept trading the worst stock strategy. Silent path divergence (Rules 8/12). | One-line fix queued post-freeze: mirror the disable at line 7043 in `clients/` (+`deploy/`) with a `// SAFETY-REVIEWED` comment. **Draft-PR routine `trig_01DS5acW178pQVaPcpyjpk5H` fires 2026-05-27 08:00Z.** Backlog Item 8. |
| 2 | Crypto momentum flipped +$17.87 → −$10.73 (all-time); edge engine reports `negative_edge` in MEAN_REVERTING; kill-switch flagged it (shadow, not enforced). | Outcome, not an engineering bug. | Founder decision post-freeze (enforce flag / disable / leave). Trustworthy only after Item 4 (`decision_run_id` linkage) lands — fires 2026-05-25. |
| 3 | ORB no signal since 2026-04-22 (~1 month). | **WORKING AS DESIGNED** — the v25.0 regime gate (commit `5a91e8d`, 2026-04-22, the exact silence date) blocks ORB unless regime is `TRENDING_UP` (lines 1776-1786); the market has been MEAN_REVERTING (same regime that flipped crypto momentum negative). Narrow 9:45–11:00 AM ET window compounds it. | None — loosening the gate is a strategy call, not a fix. Backlog Item 9. |

---

## Known Gaps & Risk

| Gap | Severity | Impact | Next Step |
|---|---|---|---|
| Crypto momentum net-negative all-time + flagged negative_edge | HIGH | Platform has zero net-positive strategies right now | Founder strategy decision post-freeze (item 2 above) |
| Auto-disable cron is shadow-only — bots don't enforce flags | MEDIUM (by design) | A flagged negative-edge strategy keeps trading | Flip to enforce after observation window — founder call, post-freeze |
| Forex v20.0 untested with real market signals (zero entries since deploy) | HIGH | Cannot validate the strategies work — only that the gates work | Lower gate sensitivity in shadow mode / replay against historical data (post-freeze) |
| Only 1.1% of real per-user trades carry `decision_run_id` (per memory backlog) | HIGH | Learning/edge engine blind to ~99% of real-money trades | Post-freeze backlog item (2026-05-25) |
| Stock bot doubles as cross-bot `/api/trades` aggregator | LOW (design choice) | Callers must pass `?bot=` to scope | Optional refactor to dedicated dashboard backend |
| April 2 baselines in CLAUDE.md are stale | MEDIUM | Misleads sessions starting from CLAUDE.md | Update CLAUDE.md "Performance Baselines" or auto-pull from live API |
| Root `jest.config.js` references missing `tests/setup/custom-matchers.js` | LOW | Must use `--config='{}'` to bypass | Fix or remove the reference |

---

## Recent Deploys (last 10 commits on main)

| Commit | What | Verified? |
|---|---|---|
| `4c66f1d` | chore(security): gitleaks pre-commit secret-scan hook | PARTIAL — hook installed, not proven to block a real secret |
| `afbd0f4` | docs: archive pre-Railway legacy directory | N/A (docs) |
| `9908830` | docs: archive historical notes and runbooks | N/A (docs) |
| `677afc0` | docs: archive analysis/ | N/A (docs) |
| `ce1e725` | docs: architecture, services, restructure proposal, ADR scaffold | N/A (docs) |
| `c097114` | feat(dashboard): proactive JWT refresh 60s before exp | NO — needs browser/E2E check |
| `b009801` | fix(dashboard): isolate orphan positions on Stock bot page | NO — needs browser/E2E check |
| `52657aa`/`4d3b1a1`/`3df7644` | `/api/intraday-equity` + SQL fixes | **YES — endpoint 200, valid output (2026-05-22)** |
| `ec78125` | shadow-mode auto-disable cron | **YES — fired first flag 2026-05-22** |
| `ec6f657` | SMA50 tolerance band + `/api/edge-attribution` | **YES — edge endpoint returns prod data (2026-05-22)** |

---

## Changelog — what moved since 2026-05-13

- **Crypto momentum: +$17.87 → −$10.73** (+90 trades, WR 45.5% → 37.1%). Crypto total −$0.07 → −$28.67.
- **Stock: 89 → 90 closed**, −$51.68 → −$82.79 (one new momentum trade −$31.11 on 2026-05-13, despite "disabled").
- **Forex: 29 → 30 closed**, net unchanged (new orphan closeout settled $0).
- **Edge attribution endpoint VERIFIED** — was DEPLOYED/unverified.
- **Auto-disable cron VERIFIED (fired first flag)** — was DEPLOYED/never-triggered.
- **`/api/intraday-equity` VERIFIED** — was assumed-working/uncurl-verified.
- **`/api/recent-trades` VERIFIED** on correct hosts (forex-bot, dashboard-e6e6).
- **Verification debt: 7-of-9 → ~3-of-9** feature commits still lacking prod evidence.
- New: 0 open positions everywhere; ORB silent since 2026-04-22; `nexus-dashboard` (non-e6e6) alias 502s.

---

## Doctrine Reminders (from CLAUDE.md trading-safety rules)

- Never increase `MAX_TRADES_PER_DAY` above 15, `MAX_TRADES_PER_SYMBOL` above 3, or shorten cooldowns under 10 min without explicit approval in-prompt.
- Never modify `canTrade()` without reading the full function AND adding a `// SAFETY-REVIEWED: <reason>` comment.
- Never switch broker endpoints from paper to live.
- Never commit credentials.
- SMX incident reference: 2025-12-05, 20 trades / -$300 / 2 hours. The anti-churning system exists because of this.
