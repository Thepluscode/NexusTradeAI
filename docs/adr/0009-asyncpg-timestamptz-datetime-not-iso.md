# ADR-0009: `asyncpg` `TIMESTAMPTZ` columns require `datetime` objects, not ISO strings

- **Status:** Accepted
- **Date:** 2026-04
- **Owner:** nexus-strategy-bridge
- **Related:** ADR-0005 (bridge persistence), ADR-0007 (Postgres-only)
- **Tags:** persistence, python, bug-fix

## Context

The strategy bridge (Python, FastAPI, `asyncpg`) persists decision and outcome records to Postgres tables with `TIMESTAMPTZ` columns. For weeks, bridge persistence "worked" in dev but silently failed in production. The bridge brain — lessons, patterns, bandit contexts — never accumulated state.

Root cause: code was passing ISO 8601 strings (e.g. `"2026-04-23T14:30:00.000Z"`) to `asyncpg` as parameter values for `TIMESTAMPTZ` columns. `asyncpg` rejects this — it requires `datetime` objects or expects the database itself to compute the time via SQL `NOW()`. The rejection raised an exception. The exception was caught by a broad `try / except` block that swallowed the error and continued.

Net effect: every persistence call appeared to succeed at the function-return level, but no row was actually inserted. Memory note `feedback_asyncpg_timestamptz.md` captures this lesson.

## Decision

1. **Never pass ISO strings to `asyncpg` for `TIMESTAMPTZ` columns.** Always pass:
   - A `datetime.datetime` object (with `tzinfo` set, ideally `datetime.now(timezone.utc)`)
   - **OR** use SQL `NOW()` directly: `INSERT INTO t (ts) VALUES (NOW())` rather than passing a parameter at all
2. **Never silently swallow asyncpg errors.** A broad `except Exception: pass` around persistence code is a code smell that must be replaced with `except Exception as e: logger.error("persist failed", exc_info=True)` at minimum. Better: let the exception propagate and use an outer-layer handler that logs and re-raises (or at minimum logs with full traceback).
3. **Add an integration test** that writes a row and reads it back, asserting the row count increased by 1. Any "we wrote it" code path that doesn't have this round-trip test is suspect.

## Consequences

- **Positive:** Bridge persistence is reliable. Lessons accumulate over weeks instead of being silently dropped.
- **Positive:** This decision generalises: silent failures are a known anti-pattern. Memory note `feedback_verify_in_production.md` and engineering rule "no silent failures" (rule #8) trace from this incident.
- **Cost:** Code review needs to flag any new `except Exception: pass` near persistence code.
- **Cost:** Every dev who picks up `asyncpg` has to learn this gotcha. ADR makes it discoverable.

## Implementation pointers

- `services/strategy-engine/strategy_bridge.py` — persistence helpers (use `datetime.now(timezone.utc)` or SQL `NOW()`)
- `services/strategy-engine/` test suite — integration tests that round-trip writes
- Related memory: `feedback_asyncpg_timestamptz.md`, `feedback_learn_from_mistakes.md`
- Related commits: `ddfc310`, `a9bff9f` — bridge persistence fixes
- Bot-side equivalent: the same pattern was applied to `scanDiagnostics` writes (commit `fdb4381`)

## Open questions

- Consider a project-wide lint rule (custom AST check) that flags `except Exception: pass` near `await conn.execute` or `conn.fetch`. Not implemented; manual code review is the current gate.
- Type-check the asyncpg parameter types. There are stubs that catch this at lint time; not yet adopted.
