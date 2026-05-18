# ADR-0007: Never use JSON files for persistence on Railway; use Postgres for all state

- **Status:** Accepted
- **Date:** 2026-04
- **Owner:** all services
- **Related:** ADR-0003 (Railway rootDirectory), ADR-0005 (bridge state in Postgres), ADR-0009 (asyncpg TIMESTAMPTZ)
- **Tags:** persistence, railway

## Context

Railway containers have ephemeral filesystems: every redeploy starts a new container, and any files written to `/app/` (or anywhere else) are gone. Early versions of the platform wrote operational state to JSON files: `scanDiagnostics.json`, `agent_lessons.json`, in-memory caches dumped to disk on shutdown. Every redeploy silently wiped this state. The loss only surfaced when operators noticed that diagnostic history "reset itself" after every push — by which point weeks of data had been thrown out.

Memory note `feedback_railway_filesystem.md` captures the lesson explicitly: **never use JSON files for persistence on Railway**.

## Decision

1. **All persistent state goes to Postgres.** Tables, not files. Examples:
   - `scan_diagnostics` table replaces `scanDiagnostics.json` (commit `fdb4381`)
   - Agent lessons, decision logs, bandit contexts all in strategy-engine database tables (ADR-0005)
   - Bot state, kill-switches, user credentials — all DB-backed
2. **JSON files are allowed only for:**
   - Static configuration (`package.json`, `vite.config.ts`, etc.)
   - In-memory caches whose loss is acceptable (and which are rehydrated from Postgres on cold start)
   - One-shot artifacts that are uploaded somewhere durable (e.g. test reports uploaded to GitHub Actions artifacts)
3. **In-memory + DB fallback** is the canonical pattern: keep the hot path in memory (a `Map` or `Set`), write through to Postgres on update, hydrate from Postgres on startup. Never assume the file you wrote yesterday is still there.

## Consequences

- **Positive:** State survives redeploys. Multi-week diagnostic history, learning curves, and decision logs are all queryable across deploys.
- **Positive:** State is observable via SQL. Not buried in a JSON file in a container that may no longer exist.
- **Positive:** State is single-source: in-memory caches always agree with Postgres because Postgres is the source.
- **Cost:** Adds DB round-trips to every write. Almost all writes are fire-and-forget async, so this is invisible on the hot path.
- **Cost:** Cold-start hydration slows down service warmup. Mitigated by hydrating only recent data (e.g. last 24h of scan diagnostics, not the full history).
- **Cost:** Schema migrations become a real concern (currently informally tracked). See ADR-0005 open questions.

## Implementation pointers

- `deploy/stock-bot/unified-trading-bot.js` — `scanDiagnostics._loadFromDB()` at startup (line ~8088), `/api/stock/diagnose` returns DB-backed history (~lines 7564–7632)
- `services/strategy-engine/strategy_bridge.py` — lesson/pattern/bandit hydration on startup
- Related commits: `fdb4381` (scanDiagnostics → DB), `ddfc310` / `a9bff9f` (bridge persistence fixes), `b90558f` (decision_run_id persistence), `2ae144f` (signal schema init helper)

## Open questions

- For *very* hot data (e.g. per-tick last-price cache), is Postgres write-through too slow? Currently the answer is "no, async writes hide the latency", but if write volume grows, may need Redis in the middle.
- Backup strategy. Currently relying on Railway's automatic Postgres backups; should formalize a manual-restore runbook.
