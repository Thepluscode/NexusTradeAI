# New-Edge Candidate Register — 2026-06-10 (pre-registration)

> Companion to `EDGE_FINDINGS.md` and the binding reopening rules in
> `theplus-bot/EDGE_FINDINGS.md` ("Operating rules going forward").
> This document is the **pre-registration step** those rules require:
> each candidate is a NEW edge source (not among the 5 closed hypotheses),
> has a free/cheap kill-gate, and a pass/fail bar written down BEFORE any
> backtest is run. No candidate may be promoted past its gate by optimism,
> and no gate's bar may be lowered after seeing data.

**Posture:** per closure rule 3, primary energy stays on the
honesty-detector product. These are strictly-gated side bets, to be run
one at a time, cheapest gate first. Expected base rate of success: low —
the meta-insight (free public edge space is exhausted) applies to these
too; the difference is each has a *structural* reason it could persist.

---

## Candidate A — Odd-lot tender-offer arbitrage

**Edge source class:** capacity-constrained structural niche (qualifying).
**Why it could persist:** tender offers with an odd-lot preference clause
accept ≤99-share holders without proration. The cap makes the trade
worthless to institutions — the moat is the capacity constraint itself,
not an unmined signal.

**Kill-gate ($0, SEC EDGAR full-text search):** pull 3–5 years of
SC TO-I / SC TO-T / 13E-4 filings containing odd-lot preference language.
Measure: events/year, median net spread (announcement price → tender
price, minus commissions), completion rate, time-to-cash per event.

**Pre-registered PASS bar (all required):**
- ≥ 8 qualifying events/year on average
- median net spread ≥ 2% per event at 99-share size
- ≥ 80% of events complete with odd-lot acceptance honored
- implied ≥ $400/year at single-account retail size (else: real-but-not-worth-it,
  the Candidate-#5 reconstitution verdict)

**FAIL handling:** archive with numbers; do not retest with looser filters.

## Candidate B — Crypto exchange listing-announcement events

**Edge source class:** event/flow anomaly with a structural cause (forced
new demand at listing), same family as index reconstitution — NOT a
price-pattern (entry is dated by an external announcement, not by price).
**Honest prior:** heavily mined since 2021; expect the #5 decay shape.
Cheap to kill, so it earns a gate before dismissal.

**Kill-gate ($0):** scrape Coinbase + Kraken historical listing
announcements (public blogs/status APIs), join to free OHLC. Event study:
announcement → +24h/+72h returns, net of taker fees + realistic slippage,
cluster-robust t across events, chronological 2021–2023 IS / 2024–2026 OOS
split. Pre-registered before looking at any returns.

**Pre-registered PASS bar:** OOS (2024–2026) cohort net mean return > 0
with cluster-robust t ≥ 2, and economically ≥ 1% net per event. The
in-sample era does not count for anything except the decay comparison.

**FAIL handling:** archive; no per-venue or per-coin re-slicing to hunt a
surviving subgroup (that is goalpost-moving).

## Candidate C — SPAC trust-value floor

**Edge source class:** structural floor (redemption right at trust value).
**Honest prior:** the 2020–2022 window is gone; the 2026 SPAC universe is
thin and spreads likely ≤ T-bills. Gate exists to confirm cheaply, not
because we expect a pass.

**Kill-gate ($0–trivial):** current universe of pre-deal SPACs below trust
value; compute annualized yield-to-redemption vs 3-month T-bill.

**Pre-registered PASS bar:** ≥ 10 names with net yield ≥ T-bill + 2% and
intact redemption rights. Anything less: closed.

---

## Refusals (recorded so the discipline is auditable)

Explicitly NOT candidates, because they fail reopening rule 2:
- **Order-flow imbalance / FVG / committee re-weighting** on existing bots
  — derivatives of the same price/volume stream; "another price-pattern."
- **LLM/news sentiment overlays** (incl. routing more weight to the
  strategy-bridge AI evaluator) — an LLM-tuned backtest is named as
  non-qualifying in the closure rules.
- **Altcoin funding arb / cross-exchange basis** — closed hypothesis #2's
  bounded caveat: non-retail sophistication with worse retail economics.
- **Any parameter or exit-geometry change on momentum / ORB / v20 forex**
  — closed; see `EDGE_FINDINGS.md` appendix (mathematically cannot create
  expectancy on a no-signal base).

## Execution order

C (hours) → A (a day) → B (1–2 days). One at a time; a FAIL is final at
this register's bars. Any PASS graduates to the existing harness standard
(walk-forward, real costs, pre-registered promotion criteria) before any
paper-trading module is built.
