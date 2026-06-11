# Tender Scout 🎯

A small, honest bot that watches SEC EDGAR for **odd-lot tender offers** —
the only trading edge in this workspace that survived its evidence gate
(EDGE_FINDINGS.md + `docs/edge-candidates-2026-06.md`, Candidate A,
2026-06-10). It finds the opportunities, verifies the odd-lot priority
clause, prices the spread, and tells you exactly what to do. **It never
places trades** — you act through your broker in two clicks.

## Why this edge is real (and why it stays small)

Companies running self-tender offers usually accept holders of **fewer than
100 shares ("odd lots") without proration**. Institutions can't harvest a
99-share trade — the cap that protects the edge also caps it. Measured over
5 years of filings: ~27 qualifying offers/yr, ~9/yr trading below the tender
price, **+8% median spread**, ~91% completion. Honest total: **≈ $200–1,400
per year per account.** Real money, small money — beer-and-pizza arbitrage
with evidence behind it.

## Use it

```bash
cd services/tender-scout

# one scan, report to console (~2-5 min: throttled SEC requests)
python3 scout.py --once

# scan daily and alert on Telegram when something is actionable
TELEGRAM_BOT_TOKEN=... TELEGRAM_CHAT_ID=... python3 scout.py --watch --telegram
```

No dependencies — Python 3 stdlib only. Cron alternative to `--watch`:

```cron
0 14 * * 1-5 cd <repo>/services/tender-scout && python3 scout.py --once --telegram >> /tmp/tender-scout.log 2>&1
```

## What an alert means

```
🎯 ACTIONABLE NOW (1) — spread ≥ 2%:
  OPY — OPPENHEIMER HOLDINGS INC
    Tender $40.00 (fixed) vs market $36.02 → spread +11.0%, ≈ $394 on a 99-share lot
    Do: buy ≤99 shares, then submit a TENDER instruction with your broker.
```

The playbook, every time:

1. **Read the filing first** (link in the alert). Confirm the odd-lot
   preference clause and the expiration date yourself.
2. **Buy at most 99 shares** — going over loses the proration exemption.
3. **Tender ALL of them** via your broker's corporate-actions desk
   ("voluntary corporate action" / "tender offer instruction"). Some brokers
   charge $0–38 for this — factor it against the expected ~$50–400.
4. Cash arrives shortly after the offer expires. Dutch auctions pay at least
   the low end shown (the scout prices conservatively at the minimum).
5. **Timing (Candidate F calibration, 2026-06-11, n=7):** spreads historically
   persisted into expiry week (median +3.7% at T−5 days), so acting within a
   few days of an alert is usually fine — re-check the spread at order time.

## What it deliberately is NOT

- Not trade automation (the evidence register bars that; the edge doesn't
  pay enough to justify execution risk).
- Not a get-rich bot. The honest-expectations line is printed in every
  report on purpose.

## Tests

```bash
python3 -m unittest test_tender_lib -v   # 14 deterministic tests, no network
```

Classification regexes are the gate-validated ones from
`tools/oddlot_tender_gate.py` (kept frozen as the evidence artifact;
`tender_lib.py` is their canonical home going forward).
