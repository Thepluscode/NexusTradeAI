# Distribution prep — 2026-05-12 → 2026-05-24

Five docs prepared while the 14-day hands-off window runs.
None of them touch bot code. Each is a draft ready for the user to edit and publish on or after 2026-05-24.

| File | Purpose | When to use |
|---|---|---|
| `01-what-this-is.md` | First-person founder doc explaining the methodology and the 14-day rule | Publish *before* 2026-05-24 — plant the credibility flag before the result |
| `02-first-operator.md` | Worksheet to identify and reach out to the first non-you operator | Fill in by 2026-05-21; outreach by 2026-05-23 |
| `03a-thread-edge-confirmed.md` | 10-tweet thread for the win scenario | If `pnl_pct_ci_low > 0` on 2026-05-24 |
| `03b-thread-edge-failed.md` | 8-tweet thread for the retire scenario | If `pnl_pct_ci_high < 0` on 2026-05-24 |
| `03c-thread-extended.md` | 5-post status update for the inconclusive scenario | If the CI straddles zero — extend 7 days |
| `04-strategy-backlog.md` | 5 candidate strategies pre-designed for the next cycle | Reference on 2026-05-25 regardless of outcome |

## Recommended sequence

**Now (2026-05-12 → 2026-05-15)**:
- Edit `01-what-this-is.md` to your voice and publish (LinkedIn post + blog/Notion page)
- Fill in `02-first-operator.md` — at least the names section

**2026-05-15 → 2026-05-20**:
- Refine all three threads to your voice
- Reach out to first-operator candidate (use the template in `02-first-operator.md`)
- Pre-read `04-strategy-backlog.md` and decide if you'd add/remove candidates

**2026-05-23 (1 day before)**:
- Confirm first-operator commitment
- Re-read all three threads, decide which numbers go in [BRACKETS]

**2026-05-24 (decision day)**:
- 09:00 UTC: query `/api/edge-attribution?window=30&minN=30` for crypto/momentum
- Apply the binary rule
- Within 4 hours: publish the corresponding thread
- Within 24 hours: send first operator their access (if win) or the "here's what I learned" thread (if not)

## What's intentionally NOT in this directory

- Pricing / billing copy — disabled in the landing page; not part of pre-launch prep
- Stripe / payment integration — out of scope for pre-launch
- Public docs site — `/public-docs` route exists in the dashboard; verify it actually renders something before linking to it externally
- SDK code — landing page claims Python + TypeScript SDKs exist. Verify or remove the claim before launch.
