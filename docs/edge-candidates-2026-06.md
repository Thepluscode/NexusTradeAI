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

### Candidate A — odd-lot tender arbitrage: **REAL BUT MARGINAL** (2026-06-10)

Gate executed: `tools/oddlot_tender_gate.py` →
`reports/oddlot_tender_gate_20260610.json`. EDGAR FTS, 214 initial SC TO-I
filings mentioning odd lots (2021-06 → 2026-06), 133 with verified odd-lot
priority/proration-exemption language.

| Bar | Result | Verdict |
|-----|--------|---------|
| (a) ≥8 events/yr | **26.6/yr**, stable every year (17–29) | PASS |
| (b) median net spread ≥2% | all events: **−2.9%** (most trade above tender → non-trades for an opt-in arb); tradeable (positive-spread) events only: **+8.2%** median (ex-outlier), 34% of measured events | PASS on tradeable subset; the bar as drafted was ambiguous — both readings recorded |
| (c) completion ≥80% | **91.4%** price-convergence proxy — biased *low* for odd-lots (e.g. PMCB: market priced proration risk odd-lot holders are exempt from) | PASS |
| (d) ≥$400/yr at 99-sh size | measured-only: **$230–378/yr**; scaled to full qualifying universe (26% measurement coverage): **$875–1,436/yr** | BORDERLINE — hinges on extrapolation |

**Data-quality caveats (honest):** spread measured on only 35/133 events
(Yahoo 404s on delisted/OTC names; ~30 ticker-regex failures on filings with
no ticker in EDGAR display names — fixed in the tool but not re-run; a
repeating interval-fund quarterly repurchase may inflate the qualifying
count). A $/yr bug (suspect events leaking into the dollar sum) was found
and fixed; numbers above are corrected.

**Verdict: the anomaly is real and structurally protected (the ≤99-share
exemption IS the moat — institutions cannot harvest it), occurring ~9
tradeable times/yr at ~+2–19% spreads. But at odd-lot size it is worth
roughly $0.2–1.4k/yr per account, each event requiring a manual broker
tender instruction (and some brokers charge $0–38/tender, eating much of a
$50–400 event).** This is the Candidate-#5 shape again: real, persistent,
and too small to matter. NOT promoted to automation. Recorded as an optional
manual playbook: watch EDGAR FTS for SC TO-I + odd-lot priority language,
act only when market price < tender price by >2%.

Phase-2 (only if ever revisited): fix measurement coverage (delisted-ticker
price source, re-run with CIK-regex fix), verify per-event completion from
SC TO-I/A results amendments, net out per-broker tender fees.

### Candidate B — listing events: method note (2026-06-10, recorded BEFORE any returns computed)

Blog-announcement scraping (Coinbase/Kraken) is fragile and incomplete on free
data. Operationalization substituted, pre-registered here before measurement:
**event = first trade date of a new USD pair on Kraken** (detected as the
start of its daily OHLC history; Kraken's public API returns max 720 daily
candles, so the observable cohort is listings since ~2024-06 — which IS the
pre-registered OOS window). Hypothesis tested: post-listing drift on the
listing venue, the version actually tradeable by this platform's crypto bot
(buy first daily close, exit +1d / +3d close). Returns BTC-adjusted, net of
2× 0.26% taker + 0.3% slippage (0.82% round trip). Bars unchanged: OOS net
mean > 0 with cluster-robust t ≥ 2 AND ≥1% net per event. Left-censored pairs
(history starting at the API horizon) are excluded, not treated as listings.

### Candidate B — listing events: **FAIL** (2026-06-10) — significantly NEGATIVE

Gate executed: `tools/listing_event_gate.py` →
`reports/listing_event_gate_20260610.json`. Cohort: **438 new Kraken USD
listings** since 2024-06-20 (89 weekly clusters), BTC-adjusted, net of 0.82%
round-trip cost.

| Hold | n | net mean | median | win rate | clustered t |
|------|--:|---------:|-------:|---------:|------------:|
| +1d | 438 | **−4.02%** | −3.28% | 29% | **−4.39** |
| +3d | 438 | **−5.68%** | −5.31% | 29% | **−4.15** |

Not merely no-edge — post-listing drift on Kraken is *significantly negative*
(new listings dump). The long version of the listing effect is dead on this
venue with high statistical confidence. Bounded caveat (not hope): the
inverse (shorting day-0 listings) is statistically suggested but **not
retail-executable** — no borrow/margin availability on fresh pairs — and
testing it would be goalpost-moving; not pursued. Verdict final per register
rules: no per-venue or per-coin re-slicing.

---

## Register conclusion (2026-06-10) — all three gates executed

**C: FAIL. A: real but marginal (~$0.2–1.4k/yr, manual playbook only,
not automated). B: FAIL (significantly negative).** The meta-insight from
the joint edge hunt holds: the free, public, retail-accessible edge space
is exhausted. This register is CLOSED at the same standard as
`theplus-bot/EDGE_FINDINGS.md`; reopening requires a genuinely new edge
source (differentiated data, structural niche with non-trivial capacity, or
non-retail execution) with its own pre-registered free kill-gate. Energy
returns to the honest-evaluation harness as the product — which these three
gates again demonstrated working as designed.

---

# Register v2 — event-family expansion (pre-registered 2026-06-11, before any data)

Candidate A proved the *family*: corporate actions where ≤99-share size is
structurally privileged. v2 gates the adjacent classes with the same
discipline. Bars written before any query is run; FAIL is final at these bars;
no re-slicing after results.

## Candidate D — odd-lot provisions in THIRD-PARTY tenders & exchange offers (SC TO-T)

**Edge source class:** capacity-constrained structural niche (same moat as A).
Third-party/merger-related tenders are rarer than issuer self-tenders but
typically larger and better-priced; odd-lot preference clauses appear in the
same standard language.

**Kill-gate ($0):** EDGAR FTS, trailing 5 years, forms **SC TO-T**, same
method as Candidate A (`tools/oddlot_tender_gate.py` lineage, regexes from
`services/tender-scout/tender_lib.py` incl. the share-class guard): census of
filings with verified odd-lot priority language → tender price extraction →
spread vs market at filing date → completion proxy.

**Pre-registered PASS bars (all required):**
- ≥ 6 qualifying events/yr on average
- median tradeable (positive) spread ≥ 2% at 99-share size
- ≥ 70% completion proxy (third-party offers carry real deal risk — bar set
  lower than A's 80% deliberately, BEFORE seeing data)
- implied ≥ $300/yr at 99-share size (measured + scaled both reported)

**Refusals:** no per-acquirer/per-sector re-slicing after a FAIL; no merging
D's events into A's census to rescue either bar; suspect spreads (>50% or
class-mismatch) audited individually before counting.

## Candidate E — rights offerings with oversubscription privileges (gate design, runs after D)

**Edge source class:** structural niche — retail holders can oversubscribe at
the subscription price when others don't exercise; documented retail-favoring
structure. **Method sketch:** EDGAR census (S-1/S-3/424B + 8-K announcements)
of rights offerings with oversubscription clauses; measure subscription-price
discount vs market at expiry and fill rates. **Bars (frozen now):** ≥6
events/yr retail-accessible; median realized discount ≥ 3% net at
oversubscription fill; ≥ 70% completion. Gate harness to be built only after
D's verdict (one at a time).

### Candidate D result: **FAIL** (2026-06-11) — the clause barely exists in third-party tenders

Gate executed: `tools/oddlot_tot_gate.py` → `reports/oddlot_tot_gate_20260611.json`.
Five years of SC TO-T filings: **14 raw FTS hits** for "odd lots" (+10 for
"odd lot", overlapping — census completed with both phrase variants per the
registered same-method-as-A standard), **3 distinct initial filings**, and
exactly **1 with verified odd-lot priority language → 0.2 events/yr** vs the
frozen ≥6/yr bar. All four bars fail; spread/completion unmeasurable at n=1.

**Why (structural, not a query artifact):** the same query family found 214
filings on SC TO-I — odd-lot preference is an *issuer self-tender* convention
(companies courting their own small holders). Third-party acquirers have no
reason to privilege odd-lots, so the clause is essentially absent. Candidate A
remains the family's only harvestable member on the tender side. FAIL is
final; no phrase-loosening or form-widening re-runs.

### Candidate E census result: **PASS** (2026-06-11) — pricing phase justified

`tools/rights_offering_gate.py` → `reports/rights_offering_census_20260611.json`.
Five-year EDGAR census (both phrase variants, 374 + 6,446 raw hits): **398
offering entities, 299 exchange-listed → 59.8/yr** vs the frozen ≥6/yr bar —
and rising (2024: 67, 2025: 80). Transient FTS 500s near the end of the
hyphenated-phrase pagination mean the count is if anything UNDERSTATED.

**What this does and does not mean:** frequency is the cheapest kill
dimension and it survived — rights offerings with oversubscription privileges
are abundant. The edge itself is still unproven: the pricing phase (frozen
bars: median realized discount ≥3% net at oversubscription fill, ≥70%
completion) is where this class typically dies (TERP-illusory discounts,
dilution, expiry compression). Pricing harness: extract subscription price +
expiry from prospectuses, join to market prices at/after expiry. ~A day of
work, now justified.

### Candidate E pricing result: **FAIL as measured — with a measurement caveat stated plainly** (2026-06-11)

`tools/rights_offering_pricing.py` → `reports/rights_offering_pricing_20260611.json`.

**The honest headline is a coverage failure:** of 163 listed entities, regex
extraction parsed usable terms (subscription price + expiry + in-document
oversubscription clause) for only **10 (6% coverage; 147 terms_unparsed)** —
rights-offering terms live in exhibit structures cheap text regexes don't
reach. The completion bar therefore measured the parser, not the offerings.

**On the measurable slice, the prior was right:** median net discount
**−0.99%** (vs the frozen ≥3% bar), only 3/10 positive, range −14.6% (OPP, a
closed-end fund — a class known to punish non-participants) to +9.2% (SEG).
Subscription prices are set near market and the "discount" is gone or negative
by expiry — the TERP-illusion pattern, exactly where this class was expected
to die.

**Verdict: FAIL at the frozen bars on available evidence.** n=10 is too thin
to call decisive falsification, and is recorded as such — but the burden now
sits on any reopening: it requires a term-extraction method achieving ≥50%
coverage (structured exhibit parsing or paid corporate-actions data) run
against the SAME frozen bars. No bar moves; no third cheap-regex pass after
seeing a negative median (that would be instrument-hunting).

**Register v2 outcome:** the event-family expansion ends with **Candidate A as
the only harvestable class**. D structurally absent, E fails-as-measured with
the burden parked, F (playbook calibration on A's own data) still queued.

## Candidate F — tender deadline-spread persistence (bars frozen 2026-06-11, before any measurement)

**What it really is:** not a standalone edge — a playbook parameter for
Candidate A. Question: how late after the scout alert can you still act and
capture the spread? If positive spreads persist near expiry, the edge is
robust to slow manual execution; if they compress immediately, alerts must be
acted on same-day.

**Method (when run):** on Candidate A's historical qualifying FIXED-price
events with daily price data, measure the spread at T−5 trading days before
the offer's expiry (expiry from the filing's stated date) vs the spread at
filing date.

**Frozen bars:** median spread at T−5 ≥ 1.5% AND ≥ 60% of filing-date-positive
events still positive at T−5 → verdict "ACT-LATE OK"; otherwise "ACT-FAST"
(alerts are same-day-or-lose). Either verdict is operationally useful; this
gate cannot "fail" into a dead end — it calibrates the live playbook.

**Refusals:** no per-event-size or per-exchange slicing; expiry dates from
filings only (no hand-corrections after seeing spreads).
