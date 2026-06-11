#!/usr/bin/env python3
"""Candidate D kill-gate: odd-lot provisions in THIRD-PARTY tenders (SC TO-T).

Pre-registered in docs/edge-candidates-2026-06.md (Register v2, 2026-06-11,
bars frozen BEFORE this script was run). Same method as Candidate A's gate
but over SC TO-T filings; classification regexes (incl. the preferred/series
share-class guard from the NHP artifact) come from the scout's canonical
tender_lib.

PASS bars (all required): >=6 qualifying events/yr; median tradeable
(positive) spread >=2%; >=70% completion proxy; >=$300/yr at 99-share size.

Spec (Rule 1): inputs = EDGAR FTS + filing archives + Yahoo chart API (free);
output = reports/oddlot_tot_gate_<date>.json + console verdict; per-filing
failures skipped + counted, never fatal.
"""
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from statistics import median

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                "..", "services", "tender-scout"))
from tender_lib import UA, fetch, classify_offer, fetch_offer_text  # noqa: E402

FTS = "https://efts.sec.gov/LATEST/search-index"
START, END = "2021-06-11", "2026-06-10"
YEARS = 5.0
BARS = {"events_per_year": 6.0, "median_pos_spread_pct": 2.0,
        "completion_rate": 0.70, "dollars_per_year": 300.0}
OUT = f"reports/oddlot_tot_gate_{date.today().strftime('%Y%m%d')}.json"


def census():
    filings, frm, total = {}, 0, None
    while True:
        params = urllib.parse.urlencode({
            "q": '"odd lots"', "forms": "SC TO-T",
            "startdt": START, "enddt": END, "from": frm})
        raw = fetch(f"{FTS}?{params}")
        if not raw:
            break
        page = json.loads(raw)
        hits = page.get("hits", {}).get("hits", [])
        if total is None:
            total = page.get("hits", {}).get("total", {}).get("value", 0)
            print(f"raw FTS hits: {total}", flush=True)
        for h in hits:
            src = h.get("_source", {})
            if src.get("form") != "SC TO-T":
                continue
            filings.setdefault(src["adsh"], {
                "adsh": src["adsh"], "cik": src["ciks"][0].lstrip("0"),
                "name": src["display_names"][0], "file_date": src["file_date"],
            })
        frm += 10
        if frm >= min(total or 0, 9990) or not hits:
            break
    print(f"distinct initial SC TO-T filings mentioning odd lots: {len(filings)}",
          flush=True)
    return list(filings.values())


def yahoo_prices(ticker, d1, d2):
    p1 = int(time.mktime(d1.timetuple()))
    p2 = int(time.mktime(d2.timetuple()))
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(ticker)}?period1={p1}&period2={p2}&interval=1d")
    raw = fetch(url, retries=2)
    if not raw:
        return []
    try:
        res = json.loads(raw)["chart"]["result"][0]
        return [c for c in res["indicators"]["quote"][0]["close"] if c]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return []


def main():
    filings = census()
    qualifying, skipped = [], 0
    for i, f in enumerate(filings):
        text = fetch_offer_text(f)
        if not text:
            skipped += 1
            continue
        cls = classify_offer(text, f["name"])
        if not cls["odd_lot_priority"]:
            continue
        f.update(cls)
        qualifying.append(f)
        print(f"[{i + 1}/{len(filings)}] QUALIFY {f['file_date']} "
              f"{f['name'][:46]:46s} {cls['offer_type']} "
              f"${cls.get('tender_price')}", flush=True)

    for f in qualifying:
        f["spread_pct"] = None
        if f.get("class_warning") or not (f.get("ticker") and f.get("tender_price")):
            continue
        fd = datetime.strptime(f["file_date"], "%Y-%m-%d").date()
        closes = yahoo_prices(f["ticker"], fd, fd + timedelta(days=60))
        if not closes or closes[0] <= 0:
            continue
        spread = (f["tender_price"] - closes[0]) / closes[0] * 100
        if abs(spread) > 50:   # suspect — audit individually, never auto-count
            f["spread_suspect"] = True
            continue
        f["spread_pct"] = round(spread, 2)
        f["entry_close"] = closes[0]
        f["converged"] = max(closes) >= 0.99 * f["tender_price"]
        f["dollars_99sh"] = round(99 * (f["tender_price"] - closes[0]), 2)

    measured = [f for f in qualifying if f["spread_pct"] is not None]
    pos = [f for f in measured if f["spread_pct"] > 0]
    completion = (sum(1 for f in measured if f.get("converged")) / len(measured)
                  ) if measured else None
    dollars = sum(f["dollars_99sh"] for f in pos)
    coverage = len(measured) / len(qualifying) if qualifying else 0
    summary = {
        "asof": date.today().isoformat(), "window": [START, END],
        "raw_filings": len(filings), "skipped_fetch": skipped,
        "qualifying": len(qualifying),
        "events_per_year": round(len(qualifying) / YEARS, 2),
        "measured": len(measured), "positive_spread": len(pos),
        "median_pos_spread_pct": round(median(f["spread_pct"] for f in pos), 2) if pos else None,
        "completion_proxy": round(completion, 3) if completion is not None else None,
        "dollars_per_year_measured": round(dollars / YEARS, 2),
        "dollars_per_year_scaled": round(dollars / YEARS / coverage, 2) if coverage else None,
        "suspects_excluded": sum(1 for f in qualifying if f.get("spread_suspect")),
        "class_warnings": sum(1 for f in qualifying if f.get("class_warning")),
        "bars": BARS,
    }
    summary["verdict"] = {
        "events_per_year": summary["events_per_year"] >= BARS["events_per_year"],
        "median_pos_spread": (summary["median_pos_spread_pct"] or 0) >= BARS["median_pos_spread_pct"],
        "completion": (summary["completion_proxy"] or 0) >= BARS["completion_rate"],
        "dollars_per_year": summary["dollars_per_year_measured"] >= BARS["dollars_per_year"],
    }
    summary["verdict"]["PASS"] = all(summary["verdict"].values())
    with open(OUT, "w") as fh:
        json.dump({**summary, "events": qualifying}, fh, indent=1, default=str)
    print("\n==== CANDIDATE D GATE SUMMARY ====")
    for k, v in summary.items():
        if k != "bars":
            print(f"{k}: {v}")
    print(f"report: {OUT}")


if __name__ == "__main__":
    sys.exit(main())
