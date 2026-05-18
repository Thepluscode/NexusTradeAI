# Directory restructure proposal

**Status:** Draft for review. No changes yet. This document is the spec; execution is gated on operator approval.

**Hard constraint (do not violate):** Railway `rootDirectory` paths are pinned in the Railway UI for the 5 services. They cannot move without re-configuring every service:

- `deploy/stock-bot`
- `deploy/forex-bot`
- `deploy/crypto-bot`
- `deploy/dashboard`
- `services/strategy-engine`

The deploy workflow (`.github/workflows/deploy.yml`) also copies/syncs into these paths. Any restructure that touches them must also update the workflow. **Phases 1–3 below avoid touching them entirely.**

---

## 1. What's wrong today

A scan of the repo root (excluding `.git/`, `node_modules/`) reveals:

| Category | Count | Examples |
|---|---|---|
| Root-level `.md` files | 37 | `PHASE_1_COMPLETE.md`, `PHASE_2_WEEK_5_PROGRESS.md`, `README_70PCT_PROFITABILITY.md`, `30_DAY_STOCK_BOT_CHALLENGE.md`, `WHY_NO_TRADES_YET.md`, `WEEKEND_ACTION_PLAN.md`, `NEW_STRATEGY_IMPLEMENTED.md` |
| Root-level `.sh` scripts | 12+ | `START_BOT.sh`, `START_BOT_MANAGED.sh`, `START_BOT_PM2.sh`, `START_ALL_3_BOTS.sh`, `RESTART_BOT.sh`, `STOP_ALL_SERVICES.sh`, `CHECK_STATUS.sh` |
| Root-level `.js` files | ~48 | `automation-server.js`, `enhanced-integration-server.js`, `trading-service.js`, `mock-market-data-server.js`, `test-*.js` (10), `track-trades.js`, `check-orders.js`, `platform-demo.js` |
| Top-level dirs | 37 | live + half-built + dead + business artifacts interleaved |

### Specific problems

1. **Root noise drowns the live entry points.** Reading the project root, a newcomer (or future-you after a context break) can't tell what's load-bearing. The actual live services are five files inside `deploy/*-bot/bot.js` and `deploy/dashboard/server.js`, but the root is dominated by historical progress reports.

2. **Multiple stale "servers" sit at root.** `automation-server.js`, `enhanced-integration-server.js`, `enhanced-market-data-server.js`, `mock-market-data-server.js`, `trading-service.js`, `status-dashboard.js`, `trading-server.js`. **None of these are referenced** by `deploy.yml`, `clients/bot-dashboard/`, or `services/strategy-engine/`. Copies of most also exist in `legacy/`. They mislead any tool that scans the repo.

3. **`legacy/` is genuinely dead.** Two commits in the last 16 months. Zero inbound imports from live code. Currently sitting at the top level, signalling more importance than it has.

4. **Five competing "client" directories.** `clients/` contains: `bot-dashboard/` (live source-of-truth), `web-app/`, `mobile-app/`, `desktop-app/`, `pro-terminal/`, `react-dashboard/`. Only `bot-dashboard/` is touched by the deploy workflow. The other four are either half-built or unused.

5. **`services/` is sprawling.** ~50 subdirectories, only one of which (`services/strategy-engine/`) is a deployed service. Others (`services/signals/`) are synced into `deploy/*-bot/` by CI. The rest are scaffolding or earlier microservice plans that never materialised.

6. **Phase reports stack up forever.** `PHASE_1_COMPLETE.md` through `PHASE_3_WEEK_11_COMPLETE.md` (~8 files) plus all `*70PCT*.md` (5 files) are historical milestones. They're useful as a record but not as root-level navigation.

7. **`ai-ml/`, `infrastructure/`, `optimization/`, `partnerships/`, `sales/`, `marketing/`, `distribution/`, `archive/`, `analysis/`, `demo/`, `tests/`, `src/`, `web-app/`, `data-infrastructure/`, `deployment/`, `implementation/`** all sit at the root. Most are either half-built scaffolding, business artifacts (slide decks, pitch docs), or empty shells. They consume mental bandwidth every time the operator runs `ls`.

8. **Shell script variants.** `START_BOT.sh`, `START_BOT_MANAGED.sh`, `START_BOT_PM2.sh`, `START_ALL_SERVICES.sh`, `START_ALL_SERVICES_MANAGED.sh`, `START_ALL_3_BOTS.sh`, `RESTART_BOT.sh`. Some are PM2-era (deprecated; Railway is the runtime now). Some are local-dev. None are documented as a set.

---

## 2. Target layout

The goal is a root that fits on one screen and tells a clear story: live services at the top, source-of-truth for those services, docs, and explicitly-marked archives. Nothing else.

```
NexusTradeAI/
├── README.md                  # 1-page overview + "where to start"
├── CLAUDE.md                  # Agent context (current)
├── AGENTS.md                  # Agent definitions
├── FEATURE_TRACKER.md         # Live status (kept at root — operator's daily board)
├── package.json
├── package-lock.json
├── .github/                   # CI/CD (deploy.yml + cron workflows)
├── .gitignore
├── .env.example
│
# ─── Live deployable services (Railway leaves — DO NOT RENAME) ───
├── deploy/
│   ├── stock-bot/
│   ├── forex-bot/
│   ├── crypto-bot/
│   ├── dashboard/
│   └── shared/                # shared-by-deploy artifacts
│
# ─── Source-of-truth for the above (synced into deploy/ by CI) ───
├── clients/
│   └── bot-dashboard/         # Bot source + React dashboard source
│       ├── src/               # React app
│       ├── unified-trading-bot.js
│       ├── unified-forex-bot.js
│       ├── unified-crypto-bot.js
│       └── shared/auth.js
│
├── services/
│   ├── strategy-engine/       # Live Python service (Railway)
│   └── signals/               # Signal modules synced into deploy/
│
# ─── Docs (one folder, structured) ───
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SERVICES.md
│   ├── RESTRUCTURE_PROPOSAL.md (this file)
│   ├── adr/
│   │   ├── README.md
│   │   ├── 0000-template.md
│   │   └── 00NN-*.md
│   ├── runbooks/              # Operator guides (Telegram, SMS, crypto setup, ...)
│   ├── archive/               # Historical: phase reports, 70PCT journey, old legacy code
│   └── reference/             # Infrastructure docs, k8s/terraform reference
│
# ─── Operator scripts ───
├── scripts/
│   ├── README.md              # What runs when, and why
│   ├── ops/                   # Live production helpers (verify-production.sh, deploy.sh)
│   └── local/                 # Local-dev startup helpers
│
# ─── Top-level dotfiles unchanged ───
├── .base/  .carl/  .claude/  .husky/
```

### What's gone from the root

- All `PHASE_*_COMPLETE.md` files (→ `docs/archive/phase-reports/`)
- All `*70PCT*.md` files (→ `docs/archive/70pct-journey/`)
- `30_DAY_STOCK_BOT_CHALLENGE.md`, `WEEKEND_ACTION_PLAN.md`, `WHY_NO_TRADES_YET.md`, `WHAT_CHANGED_SUMMARY.md`, `NEW_STRATEGY_IMPLEMENTED.md`, `PROVEN_EDGE_OPTIONS.md`, `TRADING_BOT_IMPROVEMENTS_DIFFS.md`, `CURRENT_STATUS_SNAPSHOT.md`, `COMMERCIAL_GRADE_ROADMAP.md`, `GAP_ANALYSIS_70PCT.md`, `IMPLEMENTATION_CHECKLIST_70PCT.md` (→ `docs/archive/`)
- `INTEGRATION_GUIDE.md`, `PM2_MANAGEMENT_GUIDE.md`, `CRYPTO_TRADING_SETUP_GUIDE.md`, `SMS_ALERTS_SETUP_GUIDE.md` (→ `docs/runbooks/`)
- `AGENT.md` (duplicate of `AGENTS.md` — deleted)
- All root-level `automation-server.js`, `enhanced-*.js`, `mock-*.js`, `trading-service.js`, `trading-server.js`, `status-dashboard.js`, `platform-demo.js`, `simple-status.js`, `track-trades.js`, `check-orders.js`, `test-*.js` (→ `docs/archive/legacy-js/`)
- `ecosystem.config.js` (PM2 config — Railway is the runtime now, → archive)
- `legacy/` directory contents (→ `docs/archive/legacy/`)
- `analysis/` directory contents (→ `docs/archive/analysis/`)
- All PM2 / managed shell variants (→ `scripts/local/` or `docs/archive/scripts/`)

### What stays at the root

- `README.md`, `CLAUDE.md`, `AGENTS.md`, `FEATURE_TRACKER.md`
- `package.json`, `package-lock.json`, `.env.example`
- `.github/`, `.gitignore`, plus the live source directories

That's it. ~8 files + 4 live source dirs + dotfiles. The root tells a story.

---

## 3. Phased migration plan

Four phases. Each phase is independently mergeable: after each, all 5 Railway services keep deploying without intervention.

### Phase 1 — Archive historical docs (zero risk)

**Goal:** Get 30+ historical `.md` files out of the root without touching code.

**Steps:**

1. `mkdir -p docs/archive/phase-reports docs/archive/70pct-journey docs/archive/notes`
2. `git mv` all 8 `PHASE_*_COMPLETE.md` → `docs/archive/phase-reports/`
3. `git mv` all 5 `*70PCT*.md` → `docs/archive/70pct-journey/`
4. `git mv` `30_DAY_STOCK_BOT_CHALLENGE.md`, `WEEKEND_ACTION_PLAN.md`, `WHY_NO_TRADES_YET.md`, `WHAT_CHANGED_SUMMARY.md`, `NEW_STRATEGY_IMPLEMENTED.md`, `PROVEN_EDGE_OPTIONS.md`, `TRADING_BOT_IMPROVEMENTS_DIFFS.md`, `COMMERCIAL_GRADE_ROADMAP.md`, `GAP_ANALYSIS_70PCT.md`, `IMPLEMENTATION_CHECKLIST_70PCT.md` → `docs/archive/notes/`
5. `mkdir -p docs/runbooks`
6. `git mv INTEGRATION_GUIDE.md PM2_MANAGEMENT_GUIDE.md CRYPTO_TRADING_SETUP_GUIDE.md SMS_ALERTS_SETUP_GUIDE.md docs/runbooks/`
7. `git rm AGENT.md` (duplicate of `AGENTS.md`)
8. Add `docs/archive/README.md` explaining what's archived and why
9. `npm test` and `git status` — no code changes, expect clean
10. Commit: `chore(docs): archive historical phase reports and runbooks`

**Validation:** push to a feature branch, watch `ci.yml` pass, do NOT merge to main yet.

**Risk:** very low. Verified `deploy.yml` does not reference any of these files.

---

### Phase 2 — Remove dead root-level Node files (low risk)

**Goal:** Remove the ~24 orphaned `.js` files at the root that mislead any reader/scanner.

**Steps:**

1. `mkdir -p docs/archive/legacy-js`
2. `git mv` to `docs/archive/legacy-js/`:
   - `automation-server.js`, `enhanced-integration-server.js`, `enhanced-market-data-server.js`, `mock-market-data-server.js`
   - `trading-service.js`, `trading-server.js`, `status-dashboard.js`, `simple-status.js`, `platform-demo.js`
   - `track-trades.js`, `check-orders.js`
   - All `test-*.js` at root (10 files)
3. **Before deleting**, run a final import-grep to confirm nothing live references them:
   ```bash
   for f in automation-server.js enhanced-integration-server.js ...; do
     echo "=== $f ===" && grep -rn "require.*${f%.js}\|from.*${f%.js}\|import.*${f%.js}" \
       --include="*.js" --include="*.ts" --include="*.tsx" \
       clients/ services/ deploy/ .github/ 2>/dev/null
   done
   ```
4. `git mv ecosystem.config.js docs/archive/legacy-js/` (PM2 config; Railway doesn't use it)
5. `git mv legacy/ docs/archive/legacy/`
6. `git mv analysis/ docs/archive/analysis/`
7. Commit: `chore(repo): archive orphaned root-level Node servers and legacy/ directory`

**Validation:**
- Run `ci.yml` on a feature branch (lint + type + jest must pass)
- Deploy to a Railway preview environment if available, smoke-test all 5 services
- Only merge once smoke tests pass

**Risk:** low. The grep gate above must return empty for every file. Memory note `feedback_railway_filesystem.md` confirms these scripts pre-date the move to Railway-as-runtime.

---

### Phase 3 — Tidy shell scripts (low risk)

**Goal:** Move startup variants into `scripts/local/` and keep one canonical script in each direction.

**Steps:**

1. `mkdir -p scripts/local scripts/ops`
2. Triage each `*.sh` at the root:
   - **Keep at root** (none — they all move)
   - **Move to `scripts/local/`** (active local-dev helpers): `START_BOT.sh`, `START_ALL_SERVICES.sh`, `CHECK_STATUS.sh`, `STOP_ALL_SERVICES.sh`, `RESTART_BOT.sh`
   - **Move to `docs/archive/scripts/`** (PM2-era, superseded): `START_BOT_PM2.sh`, `START_BOT_MANAGED.sh`, `START_ALL_SERVICES_MANAGED.sh`, `STOP_SERVICES_PM2.sh`, `START_ALL_3_BOTS.sh`, `START_ORB_BOT.sh`
3. Move existing `scripts/*.sh` (deploy.sh, verify-production.sh) → `scripts/ops/`
4. Write `scripts/README.md`:
   - `scripts/ops/` — production helpers
   - `scripts/local/` — local-dev startup
   - `docs/archive/scripts/` — historical, kept for reference only
5. Update any document or memory file that references the old paths (grep first)
6. Commit: `chore(scripts): consolidate startup scripts into scripts/local and scripts/ops`

**Validation:** none of these scripts are called by `deploy.yml`. Confirmed by `grep -rn "\.sh" .github/workflows/`. Risk is purely operator muscle memory.

**Risk:** very low.

---

### Phase 4 — Audit half-built top-level directories (deferred)

**Goal:** Decide the fate of `ai-ml/`, `infrastructure/`, `optimization/`, `partnerships/`, `sales/`, `marketing/`, `distribution/`, `archive/`, `demo/`, `tests/`, `src/`, `web-app/`, `data-infrastructure/`, `deployment/`, `implementation/`.

**This phase is deferred until after the 2026-05-24 hands-off period ends** — it requires investigation per directory, and the operator may want to keep some of these as personal reference even if they're not load-bearing.

**Per-directory action template (apply individually):**

For each candidate directory `X/`:

1. Grep for inbound references from live code:
   ```bash
   grep -rn "from ['\"]\\./X\|from ['\"]X/\|require.*['\"]./X\|require.*['\"]X/" \
     --include="*.js" --include="*.ts" --include="*.tsx" --include="*.py" \
     clients/ services/ deploy/ .github/
   ```
2. Check git log for recency: `git log --since=6.months -- X/`
3. Categorise:
   - **Keep**: live references found OR recent commits AND clear ownership
   - **Reference**: no live refs but contains useful operator knowledge (e.g. `infrastructure/` Terraform may be aspirational reference)
   - **Archive**: no live refs, no recent activity → `docs/archive/<name>/`
   - **Delete**: dead and not worth archiving (empty scaffolding)

**Specific likely outcomes** (subject to verification):

| Directory | Likely fate |
|---|---|
| `ai-ml/` | Archive — 35 subdirs of Python ML scaffolding, no inbound references from live bots |
| `infrastructure/` | Move to `docs/reference/infrastructure/` — Terraform/k8s files documenting a pre-Railway plan |
| `optimization/` | Delete — empty except `revenue/` |
| `partnerships/`, `sales/`, `marketing/`, `distribution/` | Move to a separate business-artifacts repo or external storage — not code |
| `archive/` | Merge into `docs/archive/` (collision risk: be careful) |
| `demo/`, `tests/`, `src/`, `web-app/`, `data-infrastructure/`, `deployment/`, `implementation/` | Audit individually; most likely archive |
| `clients/web-app/`, `clients/mobile-app/`, `clients/desktop-app/`, `clients/pro-terminal/`, `clients/react-dashboard/` | These live under `clients/` — only `bot-dashboard/` is live. Others are aspirational and could move to `docs/archive/clients/` |

**Risk:** medium. Mostly low per-directory, but the volume of decisions makes it appropriate to do post-hands-off, one directory per commit.

---

## 4. What this proposal does NOT touch

To keep risk low, the proposal explicitly leaves alone:

- `deploy/stock-bot/`, `deploy/forex-bot/`, `deploy/crypto-bot/`, `deploy/dashboard/`, `deploy/shared/`
- `services/strategy-engine/`, `services/signals/`
- `clients/bot-dashboard/`
- `.github/workflows/`
- Any file in any of the above

These are the load-bearing parts of the system. They have their own structure (working as designed) and any reorganization there should be its own ADR + proposal.

---

## 5. Verification checklist (after each phase)

```
[ ] git status — only the expected files moved/deleted
[ ] grep -rn "<moved-path>" clients/ services/ deploy/ .github/ — no broken refs
[ ] npm test passes
[ ] ci.yml on a feature branch goes green
[ ] (preview) Railway preview deploy of all 5 services succeeds (if preview env exists)
[ ] (production) After merge to main, smoke-test step in deploy.yml passes
```

---

## 6. Execution

This document is the spec. **Execution requires explicit operator approval** because:

1. The 14-day hands-off period (2026-05-10 → 2026-05-24) restricts bot code changes. Phases 1–3 are doc/script moves, not bot code changes, and are technically within scope — but they're noisy commits. Operator preference: hold until post-hands-off.
2. Phase 4 requires per-directory investigation and operator input on what counts as "useful reference" vs "delete".

**Suggested order:**

- Phase 1 — anytime (zero risk)
- Phase 2 — anytime after Phase 1 (low risk; grep gate is the protection)
- Phase 3 — anytime after Phase 2 (very low risk)
- Phase 4 — after 2026-05-24 (deferred by policy, not by technical risk)

---

## Appendix — files to be moved (full inventory)

To be generated when execution is approved. The inventory above is illustrative; the executor (you or an agent) should produce the exact list via `ls` and verify with the grep gates before any `git mv`.
