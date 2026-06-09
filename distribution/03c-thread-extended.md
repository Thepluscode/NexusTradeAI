# Status Post — IF the 2026-05-24 CI straddles zero

> Shorter. More procedural. 5 posts. Use when the data is genuinely inconclusive
> and the rule says extend 7 days. You can't fake a result you don't have.

---

**1/**
14 days ago I locked myself out of my trading bot to find out whether my most-active strategy had real edge.

Today is day 14. The rule says: the data is inconclusive. Extend.

Here's what that means and why I'm not pretending otherwise.

---

**2/**
The metric was the 95% CI on per-trade P&L % for crypto/momentum.

The rule from 2026-05-10:
- CI low > 0 → scale up
- CI high < 0 → retire
- **CI straddles zero → extend 7 days**

The result:
- n = [N]
- 95% CI: [[LOW]%, [HIGH]%]

The interval crosses zero. The data does not support either decision.

---

**3/**
This is the boring outcome and it's the most common one.

Trading edge claims usually come with cherry-picked windows where the data happened to land on the right side. A real CI on real trades, on a strategy that's actually unproven, will straddle zero a lot of the time.

The honest move is to wait, not to round in either direction.

---

**4/**
What I'm doing:

- Bot code: still untouched. Same strategy, same parameters.
- New decision date: **2026-05-31**, same rule.
- Position sizing: stays at the conservative 0.25% risk. No scale-up until CI clears zero.
- Auto-kill switch: stays armed. Still nothing flagged.

The dashboard's EdgeAttribution panel keeps updating as new trades close. You can watch the CI evolve.

---

**5/**
The reason I'm posting this even though there's no headline result:

The methodology is the product. If I only published when the answer was clean, the published record would be biased toward dramatic outcomes — which is exactly the noise-amplification I'm trying to defeat.

Boring updates are part of the discipline. Day 22 starts now.

— Theophilus

---

## Adaptation notes

- **Tone is the trickiest part**. Avoid sounding either disappointed (which implies the answer should've been positive) or smug (which implies the answer not being negative is a win). Aim for "calmly observing what the data says."
- **No "stay tuned" CTAs.** They sound salesy and undermine the methodology framing.
- **Single LinkedIn post** of ~150 words works fine — this isn't viral-thread material.
- **Numbers from `/api/edge-attribution`** at 09:00 UTC on 2026-05-24.
- **Update the in-app SubtitleStrip** to read "Day N of 21 hands-off" (the existing component computes from a constant — update the constant in `clients/bot-dashboard/src/components/overview/SubtitleStrip.tsx` line ~8: `HANDS_OFF_DURATION_DAYS = 21`).
