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

---

## Gate results

### Candidate C — SPAC trust-value floor: **FAIL** (2026-06-10)

Market-structure evidence, three independent sources, all pointing the same
direction — the redemption floor is fully crowded, so open-market discounts
meeting the bar do not exist at scale:

1. **The 2026 SPAC market is "arbitrage-dominated":** aggregate redemption
   rates frequently exceed 95%; institutions run SPAC trusts as cash
   management at 5–7% annual — that return includes IPO-unit/warrant
   economics retail open-market buyers cannot access (ARC Group, 2026;
   89 SPAC IPOs / $16.28B YTD as of May 20 2026).
2. **Common trades at/above trust, not below:** SPACs with 100% trust show
   average first-day VWAP **+$0.07 above NAV** — the discount pool the bar
   requires (≥10 names ≥ T-bill + 2%) is arbitraged away on day one.
3. **Best-case professional ceiling:** the CrossingBridge Pre-Merger SPAC
   ETF returned 6.85% in 2025 vs 4.87% for the ICE BofA 0–3yr Treasury
   index — ~+2 pts over Treasuries *with* IPO allocations and unit
   splitting. Open-market common-only retail strictly underperforms that.

Caveat recorded honestly: a per-name screen was not run (free screeners are
now paywalled — spactrack.net redirects to listingtrack.io, HTTP 403).
Verdict stands on market structure; reopening requires producing an actual
screen showing ≥10 names at open-market net yield ≥ T-bill + 2%. The bar
itself does not move.

Sources: [ARC Group — trust overfunding in a deal-starved SPAC market](https://arc-group.com/trust-overfunding-deal-starved-spac-market/),
[CrossingBridge Pre-Merger SPAC ETF](https://www.crossingbridgefunds.com/spac-etf),
[Boardroom Alpha SPAC statistics](https://www.boardroomalpha.com/spac-statistics/).

### Candidate A — odd-lot tender arbitrage: queued (next)
### Candidate B — listing-announcement events: queued
