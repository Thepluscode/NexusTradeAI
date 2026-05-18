# ADR-0010: New filters and gates are opt-in via env vars; default off; easy revert

- **Status:** Accepted
- **Date:** 2026-04
- **Owner:** all bots
- **Related:** ADR-0008 (kill-switch shadow mode is the bigger expression of this pattern)
- **Tags:** safety, deployment

## Context

The operator iterates on filters constantly: "block crypto trades when `volume_ratio > 3`", "skip stock entries during the first 5 minutes after open", etc. Each new filter is a hypothesis. Most hypotheses are wrong on first try. Shipping a filter that's wrong and then having to redeploy to revert is slow and increases the chance of further mistakes mid-revert.

The pattern that emerged: ship the filter **off by default**, controlled by an environment variable. Test it by flipping the env var on a single service in the Railway UI (no commit, no redeploy needed — Railway restarts the service automatically). If it's wrong, flip it back. If it's right, leave it on and bake the default into a follow-up commit later.

Memory notes capture this as `feedback_phased_verified_execution.md` (research → plan → phased tests → deploy → log-verify) and `feedback_stop_patching.md` (don't add filters without verifying root cause).

## Decision

1. **Every new filter / gate** is wrapped in an env-var check that defaults OFF:
   ```js
   const HIGH_VOL_FILTER_ON = process.env.CRYPTO_HIGH_VOL_FILTER === 'true';
   if (HIGH_VOL_FILTER_ON && volumeRatio > 3.0) {
     scanDiagnostics.gateBlocks['high_vol_filter']++;
     return null; // block signal
   }
   ```
2. **Env var naming convention:** `<ASSET>_<FEATURE>_<MODE>` — uppercase, descriptive enough that the operator knows what it does without reading code.
3. **Default is `false`** (or `''`, anything that doesn't match the truthy literal). New filters must not change behaviour on deploy unless explicitly enabled.
4. **Toggle via Railway UI**, not via redeploy. The operator flips the var, Railway restarts the service, the filter activates. Reverting is the same flip.
5. **Document in `/diagnose` interpretation guide.** Filter name and trigger condition shown in the per-bot diagnostic endpoint (ADR-0006).
6. **Sunset eventually:** Once a filter has proven itself for several weeks, either bake the default into the code (and remove the env-var gate) or remove the filter entirely. Leaving 20+ filters as "experimental forever" creates configuration sprawl.

## Consequences

- **Positive:** New filters ship at zero risk. No more "merged + deployed + broken in production + rushed revert PR."
- **Positive:** A/B comparison is easy: run the filter on for a week, off for a week, compare PnL via the edge-attribution endpoint.
- **Positive:** Configuration drift between services is observable in the Railway dashboard.
- **Cost:** Stale env-vars accumulate. Every filter that survives the trial period either needs to be promoted (env-var removed, default baked in) or removed entirely. Without periodic cleanup, the env-var surface grows indefinitely.
- **Cost:** No formal feature-flag tooling (no LaunchDarkly etc.). For a single-operator system, env vars are simpler than a hosted flag service.
- **Risk:** An env-var name typo means the filter silently does nothing. Mitigation: log the resolved boolean at startup (`console.log('CRYPTO_HIGH_VOL_FILTER:', HIGH_VOL_FILTER_ON)`) so the operator can grep Railway logs for the value.

## Implementation pointers

- `deploy/crypto-bot/unified-crypto-bot.js` — `CRYPTO_HIGH_VOL_FILTER` example
- `/diagnose` interpretation guide entries — list active feature-flags and their conditions
- Memory: `feedback_phased_verified_execution.md`, `feedback_stop_patching.md`

## Open questions

- A formal feature-flag service (Unleash, LaunchDarkly) would give better observability (which user/percentage has which flag). Not justified at single-operator scale; revisit if multi-tenant becomes real.
- Should there be a recurring monthly job that lists all `process.env.X_FILTER` references and the operator audits for cleanup? Could be a simple grep + manual review during weekly reviews.
