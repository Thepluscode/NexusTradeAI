# ADR-0003: Railway `rootDirectory` forces self-contained deploy leaves; CI syncs from source-of-truth

- **Status:** Accepted
- **Date:** 2026-04-03
- **Owner:** all 5 Railway services
- **Related:** ADR-0001 (shared auth is one of the synced modules), ADR-0004 (dashboard dist is the dashboard's variant of this pattern)
- **Tags:** deploy, infrastructure

## Context

Railway services configure a `rootDirectory` in the Railway UI (per-service). When Railway builds and deploys, **only that subdirectory is copied to `/app/`**. Relative paths like `../../shared/auth.js` from inside the deploy leaf fail at runtime because the parent directories don't exist in the container.

Initial deploy strategy used thin loaders in each `deploy/*-bot/bot.js` that `require('../../clients/bot-dashboard/unified-trading-bot.js')`. This worked locally and broke on Railway with `MODULE_NOT_FOUND`. Memory note `feedback_railway_rootdir.md` captures this lesson: Railway rootDirectory copies ONLY that subdir to `/app/`; `../../` paths fail.

The naive alternative — committing the bot source twice (once in `clients/bot-dashboard/` and once in `deploy/*-bot/`) — introduces drift risk: bug fixes applied to one copy and not the other.

## Decision

1. **Source-of-truth** for bot logic lives in `clients/bot-dashboard/`:
   - `unified-trading-bot.js`, `unified-forex-bot.js`, `unified-crypto-bot.js`
   - `shared/auth.js`
   - Any `signals/`, `infrastructure/`, `data/`, or helper modules the bots need
2. **Deploy leaves** under `deploy/*-bot/` are CI-generated copies. Each leaf is **self-contained**: every file the bot needs at runtime is inside that subdirectory.
3. **CI sync** is the only legitimate writer of `deploy/*-bot/*` files. The deploy workflow (`.github/workflows/deploy.yml`) has explicit copy steps that mirror the source files into each leaf, then commits the result with `[skip ci]`.
4. **No `../../` in deploy code.** Anything a deploy leaf needs must be inside the leaf. If a new dependency is added to the bot, the sync step must be updated.
5. Same pattern applies to the dashboard (see ADR-0004 for the dist-specific variant) and to `services/signals/` which is synced into the deploy leaves.

## Consequences

- **Positive:** Source-of-truth stays single. Operator edits one file in `clients/bot-dashboard/` and CI handles the rest.
- **Positive:** Each deploy leaf is reproducible — point Railway at the leaf and `node bot.js` works.
- **Positive:** Deterministic and grep-able: anything in `deploy/*-bot/` is by definition the prod copy. No "did this fix get deployed?" ambiguity.
- **Cost:** The repo size grows because deploy/ duplicates source code. Acceptable today; reconsider if it exceeds typical repo sizes.
- **Cost:** CI sync step is the single point of truth for what reaches production. Forgetting to add a new module to the sync list silently breaks the feature on Railway. Mitigation: a CI lint step that compares `clients/bot-dashboard/` source files against `deploy/*-bot/` and fails if a non-`[skip ci]` source push leaves them desynced.

## Implementation pointers

- `.github/workflows/deploy.yml` — `build-dashboard` job + bot-file sync step. Copies from `clients/bot-dashboard/` and `services/signals/` into `deploy/*-bot/`.
- `deploy/stock-bot/bot.js` — thin loader: `require('./unified-trading-bot')` (no `../../`)
- Commit `3ae3a17`: "fix: restore self-contained deploy dirs for Railway rootDirectory" — established this pattern

## Open questions

- Would a single Docker image with `WORKDIR` set per service simplify this? Probably yes, but Railway's nixpacks-based default builder is simpler to reason about than a custom Dockerfile for now.
- Could the source-of-truth move out of `clients/bot-dashboard/` (which is really the dashboard, not the bots)? Yes, but that's a separate restructure (see `docs/RESTRUCTURE_PROPOSAL.md` Phase 4).
