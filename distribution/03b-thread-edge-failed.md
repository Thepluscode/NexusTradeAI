# Launch Thread — IF crypto/momentum is retired on 2026-05-24

> Use this thread if CI high < 0. The strategy didn't work. The methodology did.
> 8 posts. Brackets for live values from /api/edge-attribution.

---

**1/**
14 days ago I locked myself out of my trading bot.

A binary statistical rule, written down before I knew the answer, would decide whether my most-active strategy had real edge or whether I'd been fooled by noise.

Today is day 14. The rule says: retire it.

Here's why that's the win.

---

**2/**
The setup:

The candidate: crypto/momentum, my most-active strategy.

The metric: 95% confidence interval on per-trade P&L %.

The rule from 2026-05-10:
- CI low > 0 → scale up
- **CI high < 0 → retire**
- straddles → extend

The result:
- n = [N]
- 95% CI: [[LOW]%, [HIGH]%]
- CI high [HIGH]% < 0

---

**3/**
The strategy had been showing positive total P&L. It "looked like it was working."

That's exactly the trap.

Total P&L over a short window is dominated by 2-3 large winners. The CI tells you what would happen if you kept running the strategy — and the math said: net negative, with 95% confidence.

The "wins" were noise. The losses were the signal.

---

**4/**
Why I'm publishing this anyway:

Most retail trading operators would have:
- Added a filter to remove the bad trades retrospectively
- Convinced themselves "the recent ones were different"
- Quietly stopped tracking but kept running it

I wrote the rule down before the data. Now the data says retire. I retire.

The discipline is the product. The strategy was a hypothesis I tested.

---

**5/**
What I learned (the actual value):

1. crypto/momentum on 5-min bars with [CURRENT FILTERS] does not have edge in the regime we ran through.
2. The bandit-based committee scorer was correctly assigning low confidence to many of the trades that lost — the issue was that the strategy was firing too often.
3. The kill-switch infrastructure works. If I hadn't been hands-off, I'd have intervened 3 times in 14 days and never gotten clean signal.

---

**6/**
What I'm doing now:

- crypto/momentum: disabled.
- crypto bot service: still online (other crypto strategies in the backlog will run).
- The 14-day hands-off window resets on the next candidate. Same rule. Same discipline.

The backlog (in order):
1. [STRATEGY-1 NAME] — [ONE-LINE HYPOTHESIS]
2. [STRATEGY-2 NAME] — [ONE-LINE HYPOTHESIS]
3. [STRATEGY-3 NAME] — [ONE-LINE HYPOTHESIS]

---

**7/**
What this isn't:

- Not a failure of the system. The system did its job — it caught a non-edge strategy and retired it before I scaled it.
- Not the end of NexusTradeAI. It's iteration 1 of N.
- Not a reason to abandon hypothesis-first trading. It's exactly *why* you do hypothesis-first trading.

---

**8/**
The thing I'm trying to prove isn't that any one strategy works.

It's that a solo operator can run a hypothesis-first trading system with statistical discipline — and the result, including negative ones, is visible, public, and survives scrutiny.

The methodology page is here: [LINK TO 01-what-this-is.md]

Strategy #2's 14-day window starts now.

— Theophilus

---

## Adaptation notes

- **Pin this**. People who only read the title will think it's a sad post. The actual thesis (the negative result is the proof of the method) needs to be visible without scrolling.
- **LinkedIn / longer-form**: lead with "I just retired my most-active trading strategy. Here's why that's the win." Skip the thread cadence.
- **Don't apologize**. The whole point is that this outcome was *built into* the design from day one. An apologetic tone undermines the methodology claim.
- **Numbers go in on the morning of 2026-05-24** from `/api/edge-attribution` and the strategy backlog file (`04-strategy-backlog.md`).
