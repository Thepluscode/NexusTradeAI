#!/usr/bin/env python3
"""Tender Scout — the user-facing bot. Finds live odd-lot tender opportunities.

Usage:
    python3 scout.py --once [--days 45] [--telegram]   # one scan, print report
    python3 scout.py --watch [--interval-hours 24]      # daemon: scan on interval

It is decision support, not trade automation: it never places orders.
Telegram alerts use the existing TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID env
vars (same as the trading bots); without them, --telegram is a logged no-op.
"""

import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from tender_lib import (ALERT_SPREAD_PCT, classify_offer, evaluate_filing,
                        fetch_offer_text, format_report, latest_close,
                        recent_tender_filings)


def log(msg):
    print(msg, flush=True)


def scan(days):
    filings = recent_tender_filings(days, log=log)
    log(f"[scout] {len(filings)} initial SC TO-I filings mentioning odd lots "
        f"in the last {days} days")
    opps, skipped = [], 0
    for i, f in enumerate(filings):
        text = fetch_offer_text(f, log=log)
        if not text:
            skipped += 1
            log(f"[scout] [{i + 1}/{len(filings)}] {f['adsh']} fetch failed — skipped")
            continue
        cls = classify_offer(text, f["name"])
        if not cls["odd_lot_priority"]:
            log(f"[scout] [{i + 1}/{len(filings)}] {f['name'][:50]} — no odd-lot "
                "priority clause (boilerplate mention only)")
            continue
        price = latest_close(cls["ticker"], log=log) if cls["ticker"] else None
        opp = evaluate_filing(f, cls, price)
        opps.append(opp)
        tag = "ACTIONABLE" if opp["actionable"] else "found"
        log(f"[scout] [{i + 1}/{len(filings)}] {tag}: {cls.get('ticker')} "
            f"{cls['offer_type']} tender={cls.get('tender_price')} "
            f"px={price} spread={opp['spread_pct']}")
    if skipped:
        log(f"[scout] {skipped} filing(s) skipped on fetch failure")
    return opps


def send_telegram(text):
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not token or not chat:
        log("[scout] --telegram requested but TELEGRAM_BOT_TOKEN/CHAT_ID not set — skipping send")
        return False
    try:
        data = urllib.parse.urlencode({"chat_id": chat, "text": text[:4000]}).encode()
        req = urllib.request.Request(
            f"https://api.telegram.org/bot{token}/sendMessage", data=data)
        with urllib.request.urlopen(req, timeout=20) as r:
            ok = json.loads(r.read()).get("ok", False)
        log(f"[scout] telegram send ok={ok}")
        return ok
    except Exception as e:  # noqa: BLE001 — alerting is optional (Rule 9); log, never crash
        log(f"[scout] telegram send failed: {e}")
        return False


def run_once(days, telegram):
    opps = scan(days)
    report = format_report(opps, days)
    print("\n" + report)
    actionable = [o for o in opps if o["actionable"]]
    if telegram and actionable:
        send_telegram(report)
    return opps


def main():
    ap = argparse.ArgumentParser(description="Odd-lot tender opportunity scout")
    ap.add_argument("--once", action="store_true", help="single scan and exit")
    ap.add_argument("--watch", action="store_true", help="scan on an interval, forever")
    ap.add_argument("--days", type=int, default=45,
                    help="lookback window in days (tenders stay open 20-35 days)")
    ap.add_argument("--interval-hours", type=float, default=24)
    ap.add_argument("--telegram", action="store_true",
                    help="send Telegram alert when actionable (spread >= "
                         f"{ALERT_SPREAD_PCT} pct)")
    args = ap.parse_args()
    if not args.once and not args.watch:
        ap.error("choose --once or --watch")
    if args.once:
        run_once(args.days, args.telegram)
        return 0
    while True:
        try:
            run_once(args.days, args.telegram)
        except Exception as e:  # noqa: BLE001 — daemon must survive a bad scan; logged
            log(f"[scout] scan failed: {e}")
        log(f"[scout] sleeping {args.interval_hours}h")
        time.sleep(args.interval_hours * 3600)


if __name__ == "__main__":
    sys.exit(main())
