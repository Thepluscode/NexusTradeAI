# ADR-0008: Kill-switch table populated by cron but not yet enforced — shadow mode

- **Status:** Accepted
- **Date:** 2026-05-10
- **Owner:** GHA cron + (future) all bots
- **Related:** ADR-0006 (introspection-first), ADR-0007 (DB persistence)
- **Tags:** safety, observability, governance

## Context

Some strategy/regime combinations have been losing money for 30+ days but remain active. The operator's anti-tinkering rules (`feedback_stop_patching.md`) discourage manually toggling strategies based on gut feel. The need: an automated, statistically-grounded mechanism to flag stale strategies — but with a phase-in that doesn't accidentally disable everything.

The CI-Lower-Bound approach: for each `(bot, strategy, regime)` cohort with `n >= 30` trades over a 30-day window, compute a 95% confidence interval on `avg_pnl_pct`. If the upper bound of the CI is `< 0` (statistically significantly losing), mark it as a candidate for kill.

But automation that auto-kills is scary. Mistakes are silent (a strategy stops trading and nobody notices for days). The mitigation: ship the observation layer before the enforcement layer.

## Decision

1. **Table:** `strategy_kill_switches(bot, strategy, market_regime, n_trades, total_pnl_usd, avg_pnl_pct, pnl_pct_ci_upper, disabled_at, expires_at, reason, window_days, UNIQUE(bot, strategy, market_regime))`.
2. **GHA cron** (`.github/workflows/auto-disable-stale-strategies.yml`) — runs daily at **06:00 UTC**:
   - `POST /api/admin/refresh-kill-switches` with `Authorization: Bearer ${NEXUS_API_SECRET}` and `{window: 30, minN: 30}` body
   - Endpoint computes the CI per cohort, upserts rows where `ci_upper < 0`, deletes expired rows
3. **Read endpoint** (`GET /api/kill-switches`, public): returns the current state of the table for operator inspection.
4. **Shadow mode** — the bots do **not** yet read the kill-switch table at signal time. The table populates and is visible; bots continue to trade normally. The gate wiring is the next step, gated on operator approval after observing the table for ~2 weeks.

## Consequences

- **Positive:** Decouples observation (low risk) from enforcement (real impact). Operator can review proposed kills before they take effect.
- **Positive:** Enables an A/B-style validation: observe which strategies would be disabled, sanity-check against trader intuition, only enable enforcement once the proposed kills look right.
- **Positive:** Fits the operator's stated process (`feedback_introspection_first.md`): build the diagnostic before the action.
- **Cost:** Two-phase rollout has a "shadow mode" period where the system has both the inertia of "still trading everything" and the temptation to flip the gate prematurely.
- **Cost:** The 06:00 UTC cron cadence means if a strategy goes bad at 07:00 UTC, it has ~23 hours before the next refresh. Acceptable for a 30-day-window decision; not acceptable if the policy ever moves to a shorter window.
- **Risk if violated:** Enforcement wired without sufficient shadow observation could disable strategies that have already turned around, causing a fundamental regret pattern.

## Implementation pointers

- `.github/workflows/auto-disable-stale-strategies.yml` — daily cron job
- `deploy/stock-bot/unified-trading-bot.js` (or equivalent) — `POST /api/admin/refresh-kill-switches` endpoint, requires `Bearer NEXUS_API_SECRET`
- Memory note `project_may10_status` (in MEMORY.md) — confirms verified end-to-end via manual trigger
- Future commit (not yet written): the bot-side gate wiring that actually consults the table at signal time

## Open questions

- The flip from shadow to enforcement is a major commit. Should require: (a) operator review of current table contents, (b) a feature flag (env var) for gradual rollout, (c) an alert if a strategy gets killed.
- Should the table TTL (`expires_at`) be longer than `window_days`? Currently set to keep entries through the next refresh cycle. Worth revisiting once we observe enforcement behaviour.
