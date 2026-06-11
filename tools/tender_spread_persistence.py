#!/usr/bin/env python3
"""Candidate F gate: tender deadline-spread persistence (bars frozen
2026-06-11 in docs/edge-candidates-2026-06.md BEFORE this run).

Question: how late after the scout alert can you still act? Population:
Candidate A's qualifying FIXED-price events whose spread was POSITIVE at the
filing date. Measure the spread at T-5 trading days before the offer's
stated expiry.

Frozen verdict rule: median T-5 spread >= 1.5% AND >= 60% of events still
positive at T-5 -> "ACT-LATE OK"; otherwise "ACT-FAST". Either outcome is
operationally useful (this calibrates the live playbook; it cannot fail into
a dead end).

Method notes recorded before running: expiry comes from re-classifying each
filing with the canonical tender_lib (the original A gate didn't extract
expiry); the class guard now also applies, so preferred-class artifacts the
old report priced are excluded here. Events whose expiry can't be parsed or
whose price series lacks T-5 coverage are skipped and counted.
"""
import json
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta
from statistics import median

sys.path.insert(0, "services/tender-scout")
from tender_lib import classify_offer, fetch, fetch_offer_text  # noqa: E402

A_REPORT = "reports/oddlot_tender_gate_20260610.json"
OUT = f"reports/tender_spread_persistence_{date.today().strftime('%Y%m%d')}.json"
BARS = {"median_t5_spread_pct": 1.5, "positive_share_at_t5": 0.60}


def yahoo_closes(ticker, d1, d2):
    p1 = int(time.mktime(d1.timetuple()))
    p2 = int(time.mktime(d2.timetuple()))
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(ticker)}?period1={p1}&period2={p2}&interval=1d")
    raw = fetch(url, retries=2)
    if not raw:
        return []
    try:
        res = json.loads(raw)["chart"]["result"][0]
        return [(datetime.utcfromtimestamp(t).date(), c) for t, c in
                zip(res["timestamp"], res["indicators"]["quote"][0]["close"]) if c]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return []


def main():
    events = [f for f in json.load(open(A_REPORT))["filings"]
              if f.get("ticker") and f.get("tender_price")
              and f.get("offer_type") == "fixed"]
    print(f"candidate events (fixed-price, ticker+price): {len(events)}", flush=True)

    rows, skips = [], {}

    def skip(r):
        skips[r] = skips.get(r, 0) + 1

    for i, ev in enumerate(events):
        text = fetch_offer_text(ev)
        if not text:
            skip("refetch_failed")
            continue
        cls = classify_offer(text, ev["name"])
        if cls.get("class_warning"):
            skip("class_warning")
            continue
        if not cls.get("expiry_hint"):
            skip("no_expiry")
            continue
        try:
            expiry = datetime.strptime(cls["expiry_hint"], "%B %d, %Y").date()
        except ValueError:
            skip("expiry_unparsed")
            continue
        fd = datetime.strptime(ev["file_date"], "%Y-%m-%d").date()
        if expiry <= fd or expiry > date.today():
            skip("expiry_out_of_range")
            continue
        tp = float(cls.get("tender_price") or ev["tender_price"])
        px = yahoo_closes(ev["ticker"], fd, expiry + timedelta(days=3))
        if len(px) < 7:
            skip("insufficient_prices")
            continue
        entry = px[0][1]
        spread0 = (tp - entry) / entry * 100
        if abs(spread0) > 50:
            skip("suspect_spread")
            continue
        if spread0 <= 0:
            skip("not_positive_at_filing")   # outside F's population by frozen rule
            continue
        pre = [c for d, c in px if d <= expiry]
        if len(pre) < 6:
            skip("no_t5_coverage")
            continue
        t5_close = pre[-6]   # 5 trading days before the last close at/before expiry
        spread_t5 = (tp - t5_close) / t5_close * 100
        rows.append({"ticker": ev["ticker"], "file_date": ev["file_date"],
                     "expiry": str(expiry), "tender_price": tp,
                     "spread_filing_pct": round(spread0, 2),
                     "spread_t5_pct": round(spread_t5, 2)})
        print(f"[{i + 1}/{len(events)}] {ev['ticker']:6s} filing {spread0:+5.1f}% "
              f"-> T-5 {spread_t5:+5.1f}% (expiry {expiry})", flush=True)

    t5s = [r["spread_t5_pct"] for r in rows]
    summary = {
        "asof": date.today().isoformat(), "candidates": len(events),
        "population_positive_at_filing": len(rows), "skips": skips,
        "median_t5_spread_pct": round(median(t5s), 2) if t5s else None,
        "positive_share_at_t5": round(sum(1 for s in t5s if s > 0) / len(t5s), 3) if t5s else None,
        "bars": BARS,
    }
    ok = (t5s and summary["median_t5_spread_pct"] >= BARS["median_t5_spread_pct"]
          and summary["positive_share_at_t5"] >= BARS["positive_share_at_t5"])
    summary["verdict"] = "ACT-LATE OK" if ok else "ACT-FAST"
    if not t5s:
        summary["verdict"] = "UNMEASURED"
    with open(OUT, "w") as fh:
        json.dump({**summary, "rows": rows}, fh, indent=1, default=str)
    print("\n==== CANDIDATE F SUMMARY ====")
    for k, v in summary.items():
        print(f"{k}: {v}")
    print(f"report: {OUT}")


if __name__ == "__main__":
    sys.exit(main())
