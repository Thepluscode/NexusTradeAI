# Launch Thread — IF crypto/momentum clears CI bar on 2026-05-24

> Tweet/X thread format. 10 posts. Drop the canned numbers in [BRACKETS]
> for the live values from /api/edge-attribution on 5/24.

---

**1/**
14 days ago I locked myself out of my trading bot.

No tuning. No new strategies. No filter changes.

A binary rule on day 14 would decide whether my most-active strategy had real edge — or whether I'd been fooled by noise.

Today is day 14. Here's the result.

---

**2/**
The setup:

3 autonomous bots (stock, forex, crypto).

The candidate: crypto/momentum.

The metric: lower bound of the 95% confidence interval on per-trade P&L %, with n ≥ 30 trades.

The rule (written down on 2026-05-10, before I knew):
- CI low > 0 → scale up
- CI high < 0 → retire
- straddles → extend 7 days

---

**3/**
Why the rule existed:

Most retail trading systems don't fail because the strategies don't work. They fail because the operator keeps tuning to recent results.

Every loss → "small filter." Every win → "scale up." The cumulative effect is curve-fitting to noise.

So I built the rule before the data, and locked the code.

---

**4/**
The result:

crypto/momentum, 30-day window:
- n = [N]
- win rate = [WR]%
- total P&L = $[PNL]
- avg per-trade = [AVG]%
- **95% CI: [[LOW]%, [HIGH]%]**
- CI low [LOW]% > 0 ✓

The edge is statistically real at 95% confidence. Not lucky weeks.

---

**5/**
What this means in plain English:

If I ran this strategy 100 more times over similar 30-day windows, in at least 95 of them the average per-trade return would be above zero.

That's the bar. It's a low bar. It's also higher than most retail systems clear.

---

**6/**
What I'm doing now:

Scaling crypto/momentum position size to 0.5% Kelly (capped — Kelly assumes correct estimates, mine are noisy).

The auto-kill switch stays armed. If the CI deteriorates back to inconclusive, the bot disables itself without me clicking anything.

The discipline doesn't relax because the strategy works.

---

**7/**
What still might break:

- Regime shift. The 30 days that proved edge might not be representative of the next 30.
- Concept drift. The same signal that worked in one market structure may stop working when structure changes.
- Slippage scaling. 0.25% risk → 0.5% Kelly means bigger fills. The edge has to survive worse execution.

I'll be watching. The dashboard shows the CI evolving in near-real-time.

---

**8/**
What I'm NOT doing:

I am not claiming this is "1000% returns" or "the next quant fund." It's one strategy that cleared one statistical bar. The CI lower bound is [LOW]%, which is *just barely* positive.

This is the start of the experiment, not the end.

---

**9/**
What's next:

Backlog of 5 candidate strategies queued for the next hands-off cycle. Each one will go through the same 14-day rule.

If you want to see the methodology in detail (including the rule I wrote on 5/10 before I knew the answer): [LINK TO 01-what-this-is.md]

---

**10/**
The thing I'm trying to prove isn't that any one strategy works.

It's that a solo operator can run a hypothesis-first trading system with statistical discipline — and the result is visible, public, and survives the next 30 days of scrutiny.

Day 15 starts now.

— Theophilus

---

## Adaptation notes

- **LinkedIn post**: combine tweets 1, 2, 4, 6, 8, 10 into 3 paragraphs. Add screenshot of the OverviewPage EdgeAttribution row with the green CI bar.
- **Email to first operator**: skip the thread, write 3 paragraphs (the result + what changes + what I want from them this week).
- **HN/Reddit**: lead with tweet 3 (the methodology), put tweet 4 second. Reddit hates a buried lede less than X does.
- **Don't post yet** — sit on this draft. The exact numbers in [BRACKETS] come from `/api/edge-attribution` at 09:00 UTC on 2026-05-24.
