#!/usr/bin/env python3
"""Candidate E kill-gate, PRICING PHASE (census passed 2026-06-11, 59.8/yr).

Frozen bars (Register v2, written before any data):
  - median realized discount >= 3% NET at oversubscription fill
  - >= 70% completion

Population (stated before measurement): the 200 most recent exchange-listed
offering entities from the census report — recency-weighted is the honest
population for a live edge; no other selection is applied.

Method per entity:
  1. data.sec.gov submissions JSON -> filings near the census first_date,
     prefer 424B*/S-1/S-3/8-K; fetch primary doc text.
  2. Extract subscription price ("subscription price of $X" family) and
     expiration date; confirm the oversubscription clause in-document; flag
     unit/preferred offerings (class guard — do not price them as common).
  3. Yahoo daily closes: realized discount = (first close ON/AFTER expiry −
     subscription price) / subscription price, minus a flat 1.0% friction
     haircut (sale spread+commission) for the NET bar.
  4. Completion proxy: terms parseable AND price data exists at expiry.

Failure handling: every skip reason counted and reported (Rule 8). Suspect
discounts (|x|>100%) excluded and listed for individual audit.
"""
import json
import re
import sys
import time
import urllib.parse
from datetime import date, datetime, timedelta
from statistics import median

sys.path.insert(0, "services/tender-scout")
from tender_lib import fetch  # noqa: E402

CENSUS = "reports/rights_offering_census_20260611.json"
OUT = f"reports/rights_offering_pricing_{date.today().strftime('%Y%m%d')}.json"
FRICTION_PCT = 1.0
BARS = {"median_net_discount_pct": 3.0, "completion_rate": 0.70}
PREFERRED_FORMS = ("424B", "S-1", "S-3", "8-K", "S-11")

SUB_PRICE_RE = re.compile(
    r"subscription\s+(?:price|right)[^.]{0,80}?\$([0-9]+(?:\.[0-9]+)?)\s*per\s*(share|unit|right)",
    re.I | re.S)
SUB_PRICE_FALLBACK_RE = re.compile(
    r"price\s+of\s+\$([0-9]+(?:\.[0-9]+)?)\s*per\s*(share|unit)[^.]{0,120}subscription", re.I | re.S)
EXPIRY_RE = re.compile(
    r"(?:expire[sd]?|expiration\s+(?:date|time))[^.]{0,160}?"
    r"((?:January|February|March|April|May|June|July|August|September|October"
    r"|November|December)\s+\d{1,2},\s+20\d{2})", re.I | re.S)
OVERSUB_RE = re.compile(r"over-?subscription\s+privilege", re.I)
PREFERRED_CLASS_RE = re.compile(r"preferred\s+stock|depositary\s+share", re.I)


def submissions(cik):
    raw = fetch(f"https://data.sec.gov/submissions/CIK{int(cik):010d}.json")
    if not raw:
        return None
    return json.loads(raw)


def pick_filings(subs, around_date, limit=3):
    r = subs.get("filings", {}).get("recent", {})
    cands = []
    for form, d, adsh, doc in zip(r.get("form", []), r.get("filingDate", []),
                                  r.get("accessionNumber", []),
                                  r.get("primaryDocument", [])):
        if not any(form.startswith(p) for p in PREFERRED_FORMS):
            continue
        gap = abs((datetime.strptime(d, "%Y-%m-%d")
                   - datetime.strptime(around_date, "%Y-%m-%d")).days)
        if gap <= 200:
            cands.append((gap, form, adsh, doc))
    cands.sort()
    return cands[:limit]


def doc_text(cik, adsh, doc):
    base = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{adsh.replace('-', '')}"
    raw = fetch(f"{base}/{doc}", retries=2)
    if not raw:
        return None
    return re.sub(r"<[^>]+>", " ", raw.decode("utf-8", "ignore"))[:400_000]


def yahoo_window(ticker, d1, d2):
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
    census = json.load(open(CENSUS))
    pop = [e for e in census["entities"] if e.get("ticker")][:200]
    print(f"population: {len(pop)} most recent listed entities", flush=True)

    rows, skips = [], {}

    def skip(reason):
        skips[reason] = skips.get(reason, 0) + 1

    for i, ent in enumerate(pop):
        subs = submissions(ent["cik"])
        if not subs:
            skip("submissions_fetch")
            continue
        terms = None
        for _, form, adsh, doc in pick_filings(subs, ent["first_date"]):
            text = doc_text(ent["cik"], adsh, doc)
            if not text or not OVERSUB_RE.search(text):
                continue
            m = SUB_PRICE_RE.search(text) or SUB_PRICE_FALLBACK_RE.search(text)
            em = EXPIRY_RE.search(text)
            if m and em:
                terms = {"form": form, "adsh": adsh,
                         "sub_price": float(m.group(1)), "per": m.group(2).lower(),
                         "expiry_raw": em.group(1),
                         "preferred": bool(PREFERRED_CLASS_RE.search(
                             text[max(0, m.start() - 400):m.end() + 400]))}
                break
        if not terms:
            skip("terms_unparsed")
            continue
        if terms["per"] != "share" or terms["preferred"]:
            skip("unit_or_preferred_class")
            continue
        try:
            expiry = datetime.strptime(terms["expiry_raw"], "%B %d, %Y").date()
        except ValueError:
            skip("expiry_unparsed")
            continue
        if expiry > date.today():
            skip("offering_still_open")
            continue
        px = yahoo_window(ent["ticker"], expiry - timedelta(days=2),
                          expiry + timedelta(days=14))
        post = [(d, c) for d, c in px if d >= expiry]
        if not post:
            skip("no_price_at_expiry")
            continue
        close_at_expiry = post[0][1]
        gross = (close_at_expiry - terms["sub_price"]) / terms["sub_price"] * 100
        if abs(gross) > 100:
            skip("suspect_discount_gt100pct")
            rows.append({**ent, **terms, "expiry": str(expiry),
                         "close_at_expiry": close_at_expiry,
                         "suspect": True})
            continue
        rows.append({**ent, **terms, "expiry": str(expiry),
                     "close_at_expiry": close_at_expiry,
                     "gross_discount_pct": round(gross, 2),
                     "net_discount_pct": round(gross - FRICTION_PCT, 2)})
        print(f"[{i + 1}/{len(pop)}] {ent['ticker']:6s} sub ${terms['sub_price']} "
              f"expiry {expiry} close {close_at_expiry:.2f} "
              f"net {gross - FRICTION_PCT:+.1f}%", flush=True)

    measured = [r for r in rows if not r.get("suspect")]
    nets = [r["net_discount_pct"] for r in measured]
    attempted = len(pop) - skips.get("submissions_fetch", 0)
    completion = len(measured) / max(1, attempted - skips.get("offering_still_open", 0))
    summary = {
        "asof": date.today().isoformat(),
        "population": len(pop), "measured": len(measured),
        "skips": skips,
        "median_net_discount_pct": round(median(nets), 2) if nets else None,
        "positive_net_share": round(sum(1 for n in nets if n > 0) / len(nets), 3) if nets else None,
        "completion_proxy": round(completion, 3),
        "friction_pct": FRICTION_PCT, "bars": BARS,
    }
    summary["verdict"] = {
        "median_net_discount": (summary["median_net_discount_pct"] or -999) >= BARS["median_net_discount_pct"],
        "completion": summary["completion_proxy"] >= BARS["completion_rate"],
    }
    summary["verdict"]["PASS"] = all(v for k, v in summary["verdict"].items() if k != "PASS")
    with open(OUT, "w") as fh:
        json.dump({**summary, "rows": rows}, fh, indent=1, default=str)
    print("\n==== CANDIDATE E PRICING SUMMARY ====")
    for k, v in summary.items():
        print(f"{k}: {v}")
    print(f"report: {OUT}")


if __name__ == "__main__":
    sys.exit(main())
