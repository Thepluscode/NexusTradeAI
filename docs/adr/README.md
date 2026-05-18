# Architecture Decision Records (ADRs)

This directory captures **why** the system is shaped the way it is. Each file documents one decision in a fixed format so the rationale survives the original commit message and the operator's memory.

## When to write an ADR

Write one when:

- You make a choice that constrains future changes (e.g. "all bots share one JWT secret")
- You codify a recurring lesson (e.g. "never store state in JSON files on Railway")
- You commit to a workaround for an external constraint (e.g. "Railway `rootDirectory` only copies the configured subdir")
- A bug fix encodes a design principle that future code should follow

Skip an ADR for: small refactors, dependency bumps, bug fixes that don't change the design, and anything purely cosmetic.

## How to write one

1. Copy `0000-template.md` to the next free number: `0011-short-title-in-kebab-case.md`
2. Fill in all sections. Keep it short — 100–250 lines is normal.
3. Status starts as `Proposed`. Move to `Accepted` once the change ships and is verified in production. Use `Superseded by NNNN` when a later ADR overrides this one — never delete an ADR.
4. Link related ADRs, file paths (relative), and commit SHAs.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-shared-jwt-secret-across-bots.md) | Shared `JWT_SECRET` across stock/forex/crypto bots; stock-bot hosts `/api/auth/refresh` | Accepted | 2026-04-03 |
| [0002](0002-proactive-jwt-refresh-dashboard.md) | Dashboard proactively refreshes JWT 60s before expiry | Accepted | 2026-05-16 |
| [0003](0003-self-contained-railway-deploy-leaves.md) | Railway `rootDirectory` forces self-contained deploy leaves; CI syncs from source-of-truth | Accepted | 2026-04-03 |
| [0004](0004-dashboard-prebuilt-via-gha.md) | Dashboard `dist/` pre-built in GHA and committed; Railway only serves static files | Accepted | 2026-04 |
| [0005](0005-strategy-bridge-brain-in-postgres.md) | Strategy bridge persists lessons / patterns / bandit contexts in Postgres | Accepted | 2026-04 |
| [0006](0006-introspection-first-diagnose-endpoints.md) | Build per-bot `/diagnose` and `/decision-trace` endpoints before guessing at filters | Accepted | 2026-04 |
| [0007](0007-postgres-only-persistence-on-railway.md) | Never use JSON files for persistence on Railway; Postgres for all state | Accepted | 2026-04 |
| [0008](0008-kill-switch-shadow-mode.md) | Kill-switch table populated by cron but not yet enforced — shadow mode | Accepted | 2026-05-10 |
| [0009](0009-asyncpg-timestamptz-datetime-not-iso.md) | `asyncpg` `TIMESTAMPTZ` columns require `datetime` objects, not ISO strings | Accepted | 2026-04 |
| [0010](0010-feature-gating-via-env-vars.md) | New filters and gates are opt-in via env vars (default off, easy revert) | Accepted | 2026-04 |

## Notes

- File numbering is monotonically increasing; do not renumber. Gaps are OK.
- `Superseded` ADRs stay in the index but the title gets a strike-through.
- Memory notes in `~/.claude/projects/.../memory/` are operator-private. ADRs are the team-readable canonical record.
