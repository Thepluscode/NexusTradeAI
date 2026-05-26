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
