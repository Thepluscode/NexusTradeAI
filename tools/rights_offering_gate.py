#!/usr/bin/env python3
"""Candidate E kill-gate, CENSUS PHASE: rights offerings with oversubscription
privileges (pre-registered in docs/edge-candidates-2026-06.md Register v2).

Cheapest kill dimension first: the frequency bar (>=6 retail-accessible
offerings/yr). Pricing/discount measurement (the >=3% net bar) is a separate
phase, built ONLY if the census survives.

Method: EDGAR FTS for the exact clause phrase, trailing 5 years, all filing
types. One offering produces many filings (S-1 + amendments + 424B + 8-K), so
events are deduped to (CIK, year-half) entities — a deliberately COARSE
offering proxy that if anything OVERCOUNTS (two offerings by the same issuer
in one half-year collapse to one; an offering spanning a half boundary counts
twice). Retail-accessible proxy: the EDGAR display name carries an exchange
ticker. Both proxies recorded; neither may be tightened post-hoc to rescue a
verdict.
"""
import json
import sys
import urllib.parse
from collections import Counter
from datetime import date

sys.path.insert(0, "services/tender-scout")
from tender_lib import TICKER_RE, fetch  # noqa: E402

FTS = "https://efts.sec.gov/LATEST/search-index"
START, END = "2021-06-11", "2026-06-10"
YEARS = 5.0
PHRASES = ['"oversubscription privilege"', '"over-subscription privilege"']
BAR_EVENTS_PER_YEAR = 6.0
OUT = f"reports/rights_offering_census_{date.today().strftime('%Y%m%d')}.json"


def main():
    entities = {}           # (cik, half) -> {name, ticker, first_date, filings}
    raw_totals = {}
    for q in PHRASES:
        frm, total = 0, None
        while True:
            params = urllib.parse.urlencode({
                "q": q, "startdt": START, "enddt": END, "from": frm})
            raw = fetch(f"{FTS}?{params}")
            if not raw:
                break
            page = json.loads(raw)
            hits = page.get("hits", {}).get("hits", [])
            if total is None:
                total = page.get("hits", {}).get("total", {}).get("value", 0)
                raw_totals[q] = total
                print(f"{q}: {total} raw hits", flush=True)
            for h in hits:
                src = h.get("_source", {})
                cik = src["ciks"][0].lstrip("0")
                d = src["file_date"]
                half = f"{d[:4]}H{1 if d[5:7] <= '06' else 2}"
                key = (cik, half)
                ent = entities.setdefault(key, {
                    "cik": cik, "half": half, "name": src["display_names"][0],
                    "first_date": d, "filings": 0, "forms": Counter()})
                ent["filings"] += 1
                ent["forms"][src.get("form", "?")] += 1
                ent["first_date"] = min(ent["first_date"], d)
            frm += 10
            if frm >= min(total or 0, 9990) or not hits:
                break

    for ent in entities.values():
        m = TICKER_RE.search(ent["name"])
        ent["ticker"] = m.group(1) if m else None
        ent["forms"] = dict(ent["forms"])

    all_ents = list(entities.values())
    listed = [e for e in all_ents if e["ticker"]]
    per_year = Counter(e["first_date"][:4] for e in listed)
    summary = {
        "asof": date.today().isoformat(), "window": [START, END],
        "raw_hits": raw_totals,
        "offering_entities_total": len(all_ents),
        "offering_entities_listed": len(listed),
        "events_per_year_listed": round(len(listed) / YEARS, 2),
        "per_year": dict(sorted(per_year.items())),
        "bar_events_per_year": BAR_EVENTS_PER_YEAR,
        "census_pass": len(listed) / YEARS >= BAR_EVENTS_PER_YEAR,
        "note": "census phase only — pricing/discount phase gated on census_pass",
    }
    with open(OUT, "w") as fh:
        json.dump({**summary, "entities": sorted(
            all_ents, key=lambda e: e["first_date"], reverse=True)[:200]},
            fh, indent=1, default=str)
    print("\n==== CANDIDATE E CENSUS ====")
    for k, v in summary.items():
        print(f"{k}: {v}")
    print(f"report: {OUT}")


if __name__ == "__main__":
    sys.exit(main())
