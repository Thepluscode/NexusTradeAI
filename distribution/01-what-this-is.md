# What NexusTradeAI Is (v1 draft — edit before publishing)

> First-person honest doc. Reads like a founder note, not marketing.
> Goal: plant the credibility flag now so on 2026-05-24 the audience
> already knows the methodology, not just the result.

---

## The short version

I'm running three autonomous trading bots — one each for stocks, forex, and crypto — and I'm trying to find out whether any of them have a statistically real edge, not just lucky weeks.

Today is **day 3 of a 14-day hands-off window**. From 2026-05-10 to 2026-05-24, I am not allowed to change bot code, tune thresholds, add filters, or introduce new strategies. The bots run as-is. On 2026-05-24, I read one number and make a binary decision.

That number is the lower bound of the 95% confidence interval on the per-trade P&L of my most-active strategy (crypto/momentum, n≈42, currently inconclusive). The rule was written down on 2026-05-10, before I knew the answer.

## Why I'm doing it this way

Most retail trading systems fail not because the strategies don't work — they fail because the operator keeps **tuning the strategy to recent results**. Every losing streak triggers a "small filter," every winning streak triggers a "scale up." The cumulative effect is curve-fitting to noise.

So I built three pieces of infrastructure first, before letting any strategy run unsupervised:

1. **Edge attribution** — every trade is tagged with its bot, strategy, regime, and market regime, so I can ask "did *this specific strategy* have edge in *this specific regime*?" instead of looking at aggregate P&L.
2. **Statistical confidence bounds** — every strategy bucket reports a 95% CI on per-trade return. A strategy with a positive average over 20 trades and a CI that straddles zero is *not* evidence of edge. A strategy with a CI low > 0 is.
3. **Auto-kill switches** — running in shadow mode for now, will enforce automatically once I trust the table. A strategy whose CI upper goes below zero gets disabled without me clicking anything.

Then I wrote down the binary rules and locked myself out for two weeks.

## The rule for 2026-05-24

Query: `GET /api/edge-attribution?window=30&minN=30` for crypto/momentum.

- If `pnl_pct_ci_low > 0` → scale to 0.5% Kelly position size. The edge is real enough to act on.
- If `pnl_pct_ci_high < 0` → retire the strategy. The "wins" were noise.
- If the CI straddles zero → extend the window 7 days. The data is genuinely inconclusive.

No discretion. No "well, the trend is..." No "but yesterday was..."

## What I'm doing for the next 11 days

Not bot code. The bots are off-limits. The work right now is:

- **The dashboard** — already redesigned today. It shows the live edge attribution table as the visual anchor, so on 2026-05-24 I read one number from one cell.
- **The methodology page you're reading** — so the discipline is public, not retrofitted to the result.
- **A strategy backlog** — 3-5 candidate strategies I'd test next *if* crypto/momentum retires. Designed in advance, so I don't scramble.
- **Three pre-written posts** — one per possible outcome on 2026-05-24. The result of a controlled experiment shouldn't take a week to communicate.

## What I will *not* claim

- I will not claim "1,000+ users" or "99.9% uptime SLA" until both are true and verifiable.
- I will not claim profitability before the CI lower bound clears zero on a strategy with n ≥ 30.
- I will not retroactively change the rules of the experiment on 2026-05-24 if the result is uncomfortable.

If 2026-05-24 says "retire," I will retire crypto/momentum, publish that fact, and move to the strategy backlog. The discipline is the product. The trades are how I find out whether the discipline pays.

## Who this is for

Right now: me. One operator, one account, one user_id in the database.

Eventually, if the discipline produces edge: traders who'd rather trust a transparent, hypothesis-first system than a black box. People who want to see the CI bounds, not just the equity curve.

But I am not selling that yet. I'm building the evidence first.

— Theophilus
