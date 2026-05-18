# ADR-0005: Strategy bridge persists lessons / patterns / bandit contexts in Postgres

- **Status:** Accepted
- **Date:** 2026-04
- **Owner:** nexus-strategy-bridge
- **Related:** ADR-0007 (Postgres-only persistence), ADR-0009 (asyncpg TIMESTAMPTZ)
- **Tags:** persistence, ml

## Context

The strategy bridge runs a multi-armed bandit and a lesson-promotion pipeline. Both maintain state over weeks of trading:

- **Lessons** — high-level observations promoted from raw trade outcomes (e.g. "regime=trending_down + strategy=momentum + asset=crypto: avoid")
- **Patterns** — failure-mode signatures keyed by feature combinations
- **Bandit contexts** — per `(regime, asset_class, tier)` arm distributions

Without persistence, every Railway redeploy hydrates the bridge to zero state — weeks of learning erased in seconds. JSON-file persistence is disqualified by ADR-0007 (Railway filesystem is ephemeral). In-memory only is unviable.

Earlier diagnostic incidents (memory `project_apr26_outcome_loop_fixed.md`) showed that even fire-and-forget INSERTs were sometimes silently failing due to asyncpg `TIMESTAMPTZ` issues — see ADR-0009. The decision here predates that fix but the storage choice was correct.

## Decision

1. **All bridge state lives in Postgres tables**:
   - `lessons` — promoted observations with confidence + applicable-context
   - `patterns` — failure-mode signatures
   - `bandit_contexts` — context-bandit arm distributions
   - `analyst_rankings` — per-analyst accuracy over time
   - `decisions` (shared with bots) — written by bots, joined by bridge for outcome attribution
2. **Async writes, fire-and-forget**, never block the bots' decision path:
   - Bot calls `POST /agent/decide`, gets a synchronous response
   - Bridge spawns an `asyncio.create_task()` to persist the decision context, never blocks the response
3. **Hydrate on cold start**: bridge `startup` event re-reads recent decisions, patterns, and bandit context from Postgres to repopulate in-memory caches.
4. **Decision ↔ outcome linkage**: every `decisions` row has a unique `decision_run_id` that the bot's outcome worker copies into the `trades` row on close. This is the join key for the lesson-promotion pipeline.

## Consequences

- **Positive:** Multi-week learning curves survive redeploys. The bridge improves over time.
- **Positive:** Cross-table joins live in the bridge, not in the bots. Bots remain thin.
- **Positive:** State is queryable: ad-hoc SQL can answer "what does the bandit think about momentum in BTC during a trending_down regime?" — no in-memory inspection needed.
- **Cost:** Database round-trip per decision adds latency to the persistence path. Mitigated by async background writes; the decision-response itself is unaffected.
- **Cost:** Cold-start latency: bridge takes longer to be useful after redeploy because it must hydrate caches. The Railway healthcheck timeout is set to 60s (vs 30s for the bots) for this reason.
- **Risk:** If a write silently fails (see ADR-0009), state silently desyncs. Mitigation: ADR-0009 hardened the asyncpg path; periodic reconciliation jobs catch any remaining drift.

## Implementation pointers

- `services/strategy-engine/strategy_bridge.py` — the FastAPI app, schema management, decide/outcome endpoints
- `services/strategy-engine/agents/supervisor_bandit.py` — bandit context selection, queried via `/agent/bandit/context`
- Endpoint surface:
  - `POST /agent/decide` (called by bots at signal time)
  - `POST /agent/outcome` (called by outcome workers)
  - `GET /agent/decisions`, `/agent/rankings`, `/agent/portfolio`, `/agent/bandit/stats`, `/agent/bandit/context`
- Related commits: `fdb4381` (persist scanDiagnostics), `b90558f` (decision_run_id persistence), `ddfc310` / `a9bff9f` (bridge persistence fixes)

## Open questions

- Schema is currently informally tracked via Python code (no explicit migrations). Worth introducing Alembic once the schema stabilizes.
- The lesson-promotion pipeline runs nightly. Could be event-driven (on trade close) — design intentionally deferred until the nightly cadence proves insufficient.
