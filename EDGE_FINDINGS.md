# EDGE FINDINGS — NexusTradeAI (live-trade audit, 2026-05-26)

> **Read this before tuning or adding any strategy in this repo.**
> Evidence, not opinion. Do not reopen these conclusions from optimism, and do
> not let an autonomous agent restart strategy tuning without overturning this
> evidence first. Companion to the sibling project's `theplus-bot/EDGE_FINDINGS.md`.

## TL;DR

An honest audit of **396 closed live (paper) trades** pulled from the production
bots on 2026-05-26 found **no demonstrated tradeable edge.** Every bot is
net-negative, every profit factor is < 1, and no strategy's per-trade expectancy
is statistically distinguishable from (or is significantly below) zero. The
engineering platform is solid; the alpha is absent — the same verdict reached
for theplus-bot.

| Bot | n | Win rate | Total PnL | Profit factor | per-trade t-stat |
|-----|--:|---------:|----------:|--------------:|-----------------:|
| stock  | 90  | 37% | −$82.79  | 0.77 | −0.88 |
| crypto | 275 | 32% | −$53.51  | 0.87 | −0.42 |
| forex  | 31  | 0%  | −$744.87 | 0.00 | −1.61 |

By strategy (n ≥ 15):
- `crypto / momentum` — n=264, 33% WR, PF 0.90, t=−0.28 → no edge
- `stock / openingRangeBreakout` — n=78, 37% WR, PF 0.96, t=−0.13 → no edge
- `forex / pullbackContinuation` — n=22, **0% WR**, PF 0.00, t=−1.74 → actively destructive (legacy/orphan path)

## The decisive test — out-of-sample collapse

Chronological in-sample → out-of-sample split (the overfit detector):

| Bot | In-sample | Out-of-sample |
|-----|-----------|---------------|
| stock  | PF 1.04, t=0.09 (breakeven) | PF 0.49, t=−1.69 |
| crypto | PF 1.00, t=0.01 (breakeven) | **PF 0.09, t=−6.36** (significantly losing) |
| forex  | PF 0.00 (0% WR) | PF 0.00 (0% WR) |

The crypto IS→OOS collapse (t 0.01 → −6.36) is the textbook no-edge / overfit
signature — the same pattern that overturned theplus-bot's `box_symmetric`.

## Method

- Source: `GET /api/trades?limit=5000` from each production bot (stock/crypto/forex).
- Per (bot, strategy): count, win rate, total + mean PnL (expectancy), profit
  factor, and a per-trade t-stat (mean / (std/√n)) — i.e. "is mean PnL
  significantly > 0?". Plus a chronological 50/50 IS/OOS split.
- **Costs:** computed on the bots' recorded paper PnL. Real fees + slippage make
  reality **worse**, not better — so this audit, if anything, overstates results.
- Reproduce: re-pull `/api/trades` and recompute; the bots' own
  `GET /api/edge-attribution` (forex) gives a corroborating per-strategy view.

## What this project IS / IS NOT

- **IS:** a working multi-broker paper-trading platform with honest measurement
  hooks (`decision_run_id` linkage, the edge-attribution endpoint, stationary-
  bootstrap CI / DSR in PR #44) — the right harness to *test* edge hypotheses.
- **IS NOT:** a profit engine. The current strategies (momentum, ORB, the legacy
  forex paths) have no demonstrated edge on their own live results.

## Operating rules that follow

1. **Do not chase profitability by tuning these strategies.** They have no edge;
   tuning a zero-edge signal on its own history is overfitting (see the IS→OOS
   collapse above).
2. **No agent may restart strategy tuning** to chase profit without first
   producing evidence that overturns this audit to the same standard
   (full live history, out-of-sample, real costs, statistical significance).
3. The edge-attribution work (Items 3 + 4) is the *right* instinct — it exists to
   answer "is there an edge?" honestly. It just answered: not yet.
4. **`forex / pullbackContinuation` (0% WR, −$309)** is a specific red flag —
   it is a disabled legacy path; confirm no live capital can route to it.
5. Strategic: NexusTradeAI is a near-duplicate of theplus-bot's dead-edge
   premise. Profitability, if pursued, is a NEW edge source (differentiated
   data / structural niche / non-retail execution), not a continuation of these
   strategies. Cross-ref `theplus-bot/EDGE_FINDINGS.md` and `PIVOT_SCOPE.md`.

## Appendix — Why it fails (reverse-engineered, 2026-05-26)

Decomposing the live-trade P&L into win-rate × payoff geometry shows the failure
is **mechanical**, not a tuning miss.

| Strategy | WR | payoff (avgW / avgL) | breakeven WR | gap | expectancy |
|----------|---:|---------------------:|-------------:|----:|-----------:|
| crypto / momentum | 33% | 1.71 (3.89 / 2.28) | 37% | −4 pts | −$0.135 |
| stock / openingRangeBreakout | 37% | 1.49 (8.76 / 5.88) | 40% | −3 pts | −$0.137 |
| forex / pullbackContinuation | 0% | n/a (0 / 102.97) | n/a | broken | −$14.04 |

*breakeven WR = 1 / (1 + payoff); payoff = avg win ÷ |avg loss|; gap = actual WR − breakeven WR (must be > 0 to profit).*

**Root cause.** A breakout/trend system with payoff ~1.6 and win rate ~35% is
exactly what *random entries* produce. With a fixed stop:target, win rate is set
by geometry — P(hit target before stop) — not by signal quality. These land
precisely where no-signal entries would, and cost/slippage drag tips the small
remainder negative (the −3 to −4 pt gap). The in-sample → out-of-sample collapse
(crypto t 0.01 → −6.36) confirms it: the entries carry no predictive information.

**Why tuning can't fix it (the inverse).** Expectancy = WR·avgW − (1−WR)·|avgL|.
Three levers, two are dead ends here:
1. *Raise WR above breakeven* (crypto 33→37%, stock 37→40%, net of cost) — needs
   entries that actually predict direction. There is no signal to amplify (OOS
   proves it), so this is unreachable by tuning.
2. *Raise payoff* (crypto 1.71→2.03, stock 1.49→1.70) — on a no-signal base,
   widening the target lowers WR proportionally; you slide *along* the
   random-entry frontier and expectancy stays pinned at ≈ −cost.
3. *Cut cost* — at zero cost crypto ≈ breakeven; helpful, but reaches breakeven,
   not profit, and the gap is too wide to close with retail cost savings.

So a profitable version requires a **genuine predictive edge or a structural/cost
advantage** — a NEW edge source, not these price-pattern entries. This makes
rule #2 (no restarting strategy tuning) *mathematically*, not just empirically,
correct: on a no-signal base, parameter/geometry tuning cannot create expectancy.

**The broken one.** `forex/pullbackContinuation` (0% WR, −$103/trade) is a bug,
not a marginal edge — confirm no live capital can route to it, then retire it.

---

## ✅ EDGE HUNT CLOSED — 2026-05-26 (joint with theplus-bot)

The combined trade-bots edge hunt across this repo and the sibling
`theplus-bot` is now CLOSED. Five hypotheses were tested across both repos
under the same falsifiable discipline; **5/5 produced no deployable edge**
(4 NO EDGE; the S&P-600 index-reconstitution effect formally PASSED its gate
but is real-and-arbitraged-to-marginal at retail today, 2026 +0.7% gross).
See the full results table, meta-insight, and **binding operating rules** in
`theplus-bot/EDGE_FINDINGS.md` (the canonical joint record).

NexusTradeAI's contribution to the joint conclusion is the live-trade audit
above: the same no-edge reality proven on this project's real paper-trade
history (396 trades; crypto IS → OOS t collapse 0.01 → −6.36 — textbook
overfit signature). The verdict here is unchanged: no tradeable edge in these
strategies; the platform's value is the honest-evaluation harness, not the
strategies.

The reopening bar defined in `theplus-bot/EDGE_FINDINGS.md` ("Operating rules
going forward") applies here too. Energy goes to the honesty-detector product,
not to re-tuning these bots.

---

## Addendum — 2026-06-04: the stubbed `qualifyEntry` gate has no edge either

While wiring the `/api/health/detailed` monitoring endpoint, production verification
exposed that the shared `require('../../services/signals/…')` block **fails silently
on Railway** (each bot is served from `deploy/<bot>/`, so that path doesn't resolve).
Several secondary gates were therefore running as permissive inline stubs in prod:
`qualifyEntry` (EV/threshold gate) = always `qualified:true`, `computePortfolioHeat` =
always `canOpen`, `calibrateConfidence` = passthrough. The **primary** safety gate —
`canTrade()` anti-churning — is inline and was never affected.

Before enabling `qualifyEntry`, it was backtested (Rule 4 FP/FN) by replaying the real
committee inputs stored in each trade's `entry_context` through the actual module.
Harness: `services/trading/qualifier-backtest.js` (+ tests). Verdict — **no discriminative power:**

| Bot | n (committee-instrumented) | blocked | block precision | base loser rate | kept-trade win rate |
|-----|--:|--:|--:|--:|--:|
| crypto | 289 | 287 (99%) | 70.6% | **70.8%** | 0% (2 kept, both lost) |
| stock  | 17  | 17 (100%) | 64.7% | ~64.7% | — (0 kept) |
| forex  | 3   | 0 | — | — | — |

**Block precision ≈ the base loser rate** → the gate does not select bad trades, it
suppresses ~99–100% of *all* trades at the base rate. The apparent +$287 crypto P&L
"improvement" is entirely *"trade almost nothing on a negative-edge strategy"* — the
job of the existing strategy auto-disable, not a per-trade entry gate. Dominant cause:
257/289 crypto blocks are the 0.45 confidence floor, i.e. the committee confidence
distribution sits below 0.45 in this period (no high-conviction setups), consistent
with the no-edge audit above.

**Decision: do NOT enable `qualifyEntry` / heat / calibration as a "fix."** Enabling them
is a trade-selection change with zero demonstrated discrimination — it confirms, not
overturns, the closed edge audit. The correct lever for a losing strategy remains
strategy-level enable/disable, which already exists. Only the read-only health modules
(`health-monitor`, `health-pnl`) were moved to local-first loading so monitoring reports
real data; no trade-decision module loading was changed.

---

## Addendum — 2026-06-04: kill-switch enforcement DOES discriminate (OOS), wired opt-in

Unlike the per-trade `qualifyEntry` gate, the **statistical kill-switch** — disable a
`(strategy, market_regime)` bucket when n≥30 AND the 95% CI upper bound on pnl_pct < 0,
re-evaluated daily with a 7-day TTL — was tested **out-of-sample, walk-forward** (each
decision uses only trades that closed before it; zero look-ahead). Harness:
`services/signals/backtest/kill-switch-oos.js` (+ tests).

| Bot | n | blocked | block precision | base loser rate | blocked WR | kept WR | OOS P&L improvement |
|-----|--:|--:|--:|--:|--:|--:|--:|
| crypto | 318 | 147 | **80.4%** | 68.8% | 19.6% | 41.8% | **+$40.95** (−64.83 → −23.88) |
| stock  | 90  | 0 | — | — | — | — | $0 (nothing met n≥30 ∧ CI<0) |
| forex  | 31  | 0 | — | — | — | — | $0 |

The decisive contrast with `qualifyEntry`: here **block precision (80.4%) exceeds the base
loser rate (68.8%)** — the gate preferentially removes losers (blocked WR 19.6% vs kept WR
41.8%). That is genuine, if modest, selection skill on held-out data, because the n≥30 +
95%-CI test isolates buckets that are *confidently* losing rather than blocking per-trade
noise. **But it reduces losses, it does not create profit** — the kept book is still −$23.88,
and per the OOS-collapse evidence above that residual is not a demonstrated edge.

**Action: enforcement wired, default OFF** (`ENFORCE_KILL_SWITCHES`, per bot). This does not
reopen strategy tuning — it operationalises the *existing* statistical auto-disable as an
opt-in loss-reducer, with the OOS backtest as its gate. Today only
`crypto/momentum/MEAN_REVERTING` is flagged. The reopening bar for *adding/tuning* strategies
is unchanged; this only lets the operator stop a bucket the evidence already condemns, and it
auto-resumes when the bucket stops being statistically losing.
