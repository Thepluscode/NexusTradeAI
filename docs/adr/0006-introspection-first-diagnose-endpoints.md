# ADR-0006: Build per-bot `/diagnose` and `/decision-trace` endpoints before guessing at filters

- **Status:** Accepted
- **Date:** 2026-04
- **Owner:** all three bots
- **Related:** ADR-0008 (kill-switch uses similar introspection pattern)
- **Tags:** observability, debugging

## Context

Early in the project, troubleshooting cycles often went: "the bot stopped trading, must be a filter — let me tweak the regime gate." Tweaks were made on intuition and either masked the real problem or made it worse. Memory note `feedback_introspection_first.md` records the lesson: build a per-symbol diagnostic endpoint **before** guessing at filters. PR #15 (no specific commit captured) surfaced two multi-week bugs in 30 minutes once the endpoint existed.

The diagnostic information that matters: for each candidate symbol in the latest scan, which gate (regime, alpha, committee, risk, kill-switch, etc.) blocked the trade, and how the aggregate gate-block counts distributed across recent cycles.

## Decision

Every bot exposes two read-only, **public** endpoints:

1. **`GET /api/<asset>/diagnose`** — Gate-block aggregator. Returns:
   - Last scan cycle's per-symbol gate decisions
   - Aggregate gate-block distribution over the last N cycles
   - Global state: SPY trend (for stock), BTC trend (for crypto), DXY (for forex), active regime, circuit breaker status
   - Interpretation guide mapping internal gate names to operator-friendly explanations (e.g. `regime_trending_down` → "4-state regime detector says market is in downtrend; momentum strategies blocked")
2. **`GET /api/<asset>/decision-trace`** — Per-decision audit trail. Returns the gate-by-gate trace for the most recent N decisions, plus aggregate counts of where signals died in the gate cascade.

Both endpoints are intentionally **unauthenticated**:
- Information they reveal is operator-facing diagnostic only, not user data
- They're called by hand during debugging via `curl`; auth would slow down what's already a high-friction workflow
- The information is also visible in the bot's logs; the endpoint is a more accessible projection

Internal gate names and thresholds are exposed. This trades some "competitive secret" risk for an order-of-magnitude debug speedup. The operator is the only consumer; trade is worth it.

## Consequences

- **Positive:** Operator can answer "why no trades?" in seconds: hit `/diagnose`, read the gate-block counts, see which filter is doing the rejecting.
- **Positive:** New gates added later automatically surface in aggregate views, as long as the gate increments `scanDiagnostics.gateBlocks[gateName]` (or appends to `_decisionTrace`).
- **Positive:** Pattern scales: introspection-first is now the default for any new gate (e.g. kill-switch shadow mode in ADR-0008 is built on the same primitive).
- **Cost:** Internal gate names leak into the public response. If the bot ever serves multi-tenant traffic, these endpoints need to move behind auth.
- **Cost:** Requires every gate to instrument itself; a forgotten `gateBlocks[gateName]++` makes that gate invisible in diagnostics. Mitigation: code review checklist + a follow-up "all gates accounted for" assertion.

## Implementation pointers

- `deploy/stock-bot/unified-trading-bot.js` — `/api/trading/diagnose` (gate-block aggregator)
- `deploy/forex-bot/unified-forex-bot.js` — `/api/forex/diagnose`
- `deploy/crypto-bot/unified-crypto-bot.js` — `/api/crypto/diagnose`, `/api/crypto/decision-trace`
- `scanDiagnostics` object — persisted across redeploys via `scan_diagnostics` Postgres table (see ADR-0007)
- Related commit: `fdb4381` ("feat(stock): persist scanDiagnostics across redeploys via DB")

## Open questions

- Should `/diagnose` move behind `requireJwt` once multi-tenant becomes a real possibility? For now: no, single-operator system.
- A "diff between latest and previous scan" view would help spot sudden regime shifts. Not yet built.
