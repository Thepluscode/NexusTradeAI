# Item 4 — decision_run_id linkage fix plan (FREEZE-SAFE PREP — DO NOT DEPLOY before 2026-05-25)

**Status:** investigated + patch specified 2026-05-18 during the hands-off freeze. **No code changed, nothing deployed.** Execute on/after 2026-05-25 per `pending_2026_05_24_post_handsoff_backlog.md`.

## Production evidence (read-only, 2026-05-18)

Real (per-user) vs shadow (user_id NULL) `decision_run_id` coverage:

| bot | real trades | real w/ drid | shadow | shadow w/ drid |
|---|---|---|---|---|
| crypto | 95 | **0 (0%)** | 84 | 30 (36%) |
| forex | 10 | **0 (0%)** | 20 | 0 (0%) |
| stock | 86 | **2 (2%)** | 4 | 0 (0%) |

Outcome/edge-attribution learning is therefore blind to ~99% of real money trades.

## Root cause — TWO layers (do not conflate)

### Layer A — crypto per-user INSERT drops the column (CERTAIN, surgical, high-impact)

`deploy/crypto-bot/unified-crypto-bot.js`:
- Trade open dispatch (line ~3433): `const openTrade = this._dbOpen ? this._dbOpen.bind(this) : dbCryptoOpen;`
- AI eval sets it correctly (line ~4198): `signal.decisionRunId = aiResult.decision_run_id || null;` — runs on the same engine/`signal` before the open.
- Shadow `dbCryptoOpen` (line ~805) INSERT **includes** `decision_run_id` + param `signal.decisionRunId || null`. ✅
- Per-user `userEngine._dbOpen` (line ~5636) INSERT **omits `decision_run_id` from both the column list and the params array**. ❌ → `signal.decisionRunId` is populated but thrown away at insert. This is why crypto real = 0% while crypto shadow = 36%.

**Patch (crypto only):** in `userEngine._dbOpen` make the INSERT match `dbCryptoOpen`:
- column list: append `,decision_run_id`
- VALUES: append `,$17` (currently ends at `$16` / momentum_pct)
- params array: append `signal.decisionRunId || null`

Mirror the identical change in `clients/bot-dashboard/unified-crypto-bot.js:5636` (CI-synced source mirror — keep deploy/ and clients/ in lockstep per the repo's sync convention).

### Layer B/C — decision_runs are sparsely created (ALL bots; deeper; NOT a copy-paste fix)

Stock per-user INSERT (`deploy/stock-bot/unified-trading-bot.js:6384`) and forex per-user INSERT (`deploy/forex-bot/unified-forex-bot.js:5382`) **already bind `signal.decisionRunId` correctly** — yet stock real = 2%, forex real = 0%, and even shadow is 0% for both. So fixing Layer A alone lifts crypto from 0% only to ~the rate decision_runs are actually created (crypto shadow shows that ceiling is ~36%, not 100%).

Root of the ceiling: `signal.decisionRunId` is only set from `aiResult.decision_run_id` (crypto line ~4198) when `queryAIAdvisor` returns one. It frequently does not: AI-advisor **cache hits** reuse a prior decision without minting a fresh decision_run (see crypto lines ~2158-2163, the "cache hit but APPROVED — re-evaluating for fresh decision_run_id" workaround), bridge-offline/error sources, and forex apparently almost never produces a decision_run at all (0/20 shadow). This lives in the strategy bridge (`services/strategy-engine/strategy_bridge.py`) + the per-bot `queryAIAdvisor`.

**Layer B/C is a scoped follow-up investigation, not part of the Layer A patch.** Do not attempt both as one change. Layer A is the safe, high-confidence win (crypto is the dominant volume); Layer B/C requires its own diagnosis of when/why decision_runs are minted vs reused, across the bridge and all three bots.

## Backfill (historical real trades) — bounded coverage, draft only

For closed real trades lacking a drid, copy from the matching shadow trade (same bot+symbol+direction, entry_time within a tight window). Coverage is inherently capped by how few shadow rows themselves have a drid (crypto ~36%, forex/stock ~0%) — so backfill recovers only a minority and is mostly a crypto exercise. Draft (review before running; verify the time window against real data first):

```sql
-- DRY-RUN FIRST: SELECT the candidate pairs and eyeball them before UPDATE.
WITH src AS (
  SELECT bot, symbol, direction, entry_time, decision_run_id
  FROM trades
  WHERE user_id IS NULL AND decision_run_id IS NOT NULL
)
SELECT t.id, t.bot, t.symbol, t.entry_time, s.decision_run_id
FROM trades t
JOIN src s
  ON s.bot = t.bot AND s.symbol = t.symbol AND s.direction = t.direction
 AND t.entry_time BETWEEN s.entry_time - interval '90 seconds'
                      AND s.entry_time + interval '90 seconds'
WHERE t.user_id IS NOT NULL AND t.decision_run_id IS NULL;
-- Only after reviewing the above, convert to UPDATE ... FROM with the same join.
```

Risk: a shadow row can fan to multiple users at slightly different entry_times; the 90s window must be validated against actual fan-out spacing (observed ~5-40s between user rows of one signal). Tighten/loosen empirically. Idempotent (only fills NULLs).

## Verification after deploy (per feedback_verify_in_production)

1. Re-run the per-bot coverage query above; crypto real drid% should jump from 0 toward the shadow ceiling (~36%), not stay 0.
2. Confirm a brand-new crypto per-user trade row has a non-null `decision_run_id` (live Railway log + DB row).
3. Confirm shadow vs per-user counts unchanged (multi-tenant fan-out intact — do NOT "fix" the fan-out; it is by design, see backlog).
4. Only after Layer A verified, scope Layer B/C separately.

## Hard constraints

- **Freeze:** no deploy before 2026-05-24 ends; action 2026-05-25. This doc is prep only.
- Layer A only on the first pass. Resist bundling Layer B/C or the backfill into one PR.
- Multi-tenant fan-out (one signal → one trade per user) is **correct**; never collapse it to one-trade-per-signal.
