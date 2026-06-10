#!/usr/bin/env python3
"""Candidate A kill-gate: odd-lot tender-offer arbitrage feasibility.

Pre-registered in docs/edge-candidates-2026-06.md (2026-06-10). Measures,
from SEC EDGAR full-text search over the trailing 5 years of SC TO-I filings:

  (a) qualifying events/year            PASS bar: >= 8/yr
  (b) median net spread per event       PASS bar: >= 2% at 99-share size
  (c) completion rate (price-converge proxy)  PASS bar: >= 80%
  (d) implied $/year at 99-share size   PASS bar: >= $400/yr

"Qualifying" = initial SC TO-I whose offer document contains odd-lot
priority/proration-exemption language (not mere boilerplate mention).

Spec (Rule 1):
  Inputs : EDGAR FTS JSON API (efts.sec.gov), filing archives
           (www.sec.gov/Archives), Stooq daily OHLC CSV. All free.
  Outputs: reports/oddlot_tender_gate_<date>.json + console verdict.
  Constraints: <= 5 req/s to SEC (declared UA), graceful skip on any
           per-filing failure (a skipped filing is logged, never fatal).
  Failure modes: FTS pagination capped at 10k (actual universe ~hundreds);
           delisted/foreign tickers lack Stooq data -> excluded from spread
           sample but counted in frequency; NAV-based CEF tenders are
           classified separately (spread not computable from price alone).
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timedelta
from statistics import median

UA = {"User-Agent": "ThePlusTech Research ogievatheophilus@gmail.com"}
FTS = "https://efts.sec.gov/LATEST/search-index"
START, END = "2021-06-10", "2026-06-09"
QUERIES = ['"odd lots"', '"odd lot"']
REQ_GAP_S = 0.25  # <= 4 req/s, under SEC's 10/s guidance
OUT = f"reports/oddlot_tender_gate_{date.today().strftime('%Y%m%d')}.json"

BARS = {"events_per_year": 8.0, "median_spread_pct": 2.0,
        "completion_rate": 0.80, "dollars_per_year": 400.0}


def get(url, retries=3):
    for i in range(retries):
        try:
            time.sleep(REQ_GAP_S)
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 - log + retry, never silent
            wait = 2 ** i
            print(f"  retry {i+1}/{retries} after {e} ({url[:90]})", flush=True)
            time.sleep(wait)
    return None


def fts_page(q, frm):
    params = urllib.parse.urlencode(
        {"q": q, "forms": "SC TO-I", "startdt": START, "enddt": END, "from": frm})
    raw = get(f"{FTS}?{params}")
    return json.loads(raw) if raw else {"hits": {"hits": [], "total": {"value": 0}}}


def collect_filings():
    """Union of FTS hits across queries, deduped to initial SC TO-I filings."""
    filings = {}
    for q in QUERIES:
        frm, total = 0, None
        while True:
            page = fts_page(q, frm)
            hits = page.get("hits", {}).get("hits", [])
            if total is None:
                total = page.get("hits", {}).get("total", {}).get("value", 0)
                print(f"query {q}: {total} raw hits", flush=True)
            for h in hits:
                src = h.get("_source", {})
                if src.get("form") != "SC TO-I":   # initial filings only
                    continue
                adsh = src["adsh"]
                if adsh not in filings:
                    filings[adsh] = {
                        "adsh": adsh,
                        "cik": src["ciks"][0].lstrip("0"),
                        "name": src["display_names"][0],
                        "file_date": src["file_date"],
                    }
            frm += 10
            if frm >= min(total or 0, 9990) or not hits:
                break
    print(f"distinct initial SC TO-I filings mentioning odd lot(s): {len(filings)}",
          flush=True)
    return list(filings.values())


TICKER_RE = re.compile(r"\((?!CIK\b)([A-Z][A-Z0-9.\-]{0,6})(?:,| |\))")
PRIORITY_RE = re.compile(
    r"odd\s+lots?[^.]{0,400}?(?:not\s+be\s+subject\s+to\s+proration"
    r"|priority|before\s+proration|accepted\s+(?:first|in\s+full))",
    re.I | re.S)
FIXED_RE = re.compile(r"purchase\s+price\s+of\s+\$([0-9]+(?:\.[0-9]+)?)", re.I)
DUTCH_RE = re.compile(
    r"not\s+(?:less|lower)\s+than\s+\$([0-9]+(?:\.[0-9]+)?)\s+"
    r"(?:per\s+share\s+)?(?:and|nor|or)\s+not\s+(?:greater|more|higher)\s+than"
    r"\s+\$([0-9]+(?:\.[0-9]+)?)", re.I)
NAV_RE = re.compile(r"net\s+asset\s+value", re.I)


def fetch_offer_text(f):
    """Primary offer document text (first sizeable .htm/.txt in the filing)."""
    base = f"https://www.sec.gov/Archives/edgar/data/{f['cik']}/" \
           f"{f['adsh'].replace('-', '')}"
    raw = get(f"{base}/index.json")
    if not raw:
        return None
    try:
        items = json.loads(raw)["directory"]["item"]
    except Exception:
        return None
    docs = [i for i in items
            if i["name"].lower().endswith((".htm", ".html", ".txt"))
            and "index" not in i["name"].lower()]
    docs.sort(key=lambda i: -int(i.get("size") or 0))
    text = ""
    for d in docs[:3]:   # offer doc is usually the largest exhibit
        raw = get(f"{base}/{d['name']}")
        if raw:
            text += re.sub(r"<[^>]+>", " ", raw.decode("utf-8", "ignore"))
        if len(text) > 200_000:
            break
    return text or None


def classify(f, text):
    f["odd_lot_priority"] = bool(PRIORITY_RE.search(text))
    m = TICKER_RE.search(f["name"])
    f["ticker"] = m.group(1) if m else None
    if NAV_RE.search(text) and not FIXED_RE.search(text):
        f["offer_type"], f["tender_price"] = "nav_based", None
        return
    dm = DUTCH_RE.search(text)
    if dm:
        f["offer_type"] = "dutch"
        f["tender_price"] = float(dm.group(1))   # conservative: low end
        return
    fm = FIXED_RE.search(text)
    if fm:
        f["offer_type"], f["tender_price"] = "fixed", float(fm.group(1))
    else:
        f["offer_type"], f["tender_price"] = "unknown", None


def yahoo_prices(ticker, d1, d2):
    """Daily closes from Yahoo chart API (Stooq is JS-walled as of 2026-06).
    Caveat: closes are split-adjusted; a later (reverse) split corrupts the
    nominal comparison — absurd spreads are filtered downstream."""
    p1 = int(time.mktime(d1.timetuple()))
    p2 = int(time.mktime(d2.timetuple()))
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(ticker)}?period1={p1}&period2={p2}"
           f"&interval=1d&events=history")
    raw = get(url, retries=2)
    if not raw:
        return []
    try:
        res = json.loads(raw)["chart"]["result"][0]
        ts = res["timestamp"]
        closes = res["indicators"]["quote"][0]["close"]
        return [(datetime.utcfromtimestamp(t).strftime("%Y-%m-%d"), c)
                for t, c in zip(ts, closes) if c]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return []


def measure_spread(f):
    """Spread at first close on/after filing date vs (conservative) tender price.
    Completion proxy: market converges to >=99% of tender within 60 days."""
    if not (f.get("ticker") and f.get("tender_price")):
        return
    fd = datetime.strptime(f["file_date"], "%Y-%m-%d").date()
    px = yahoo_prices(f["ticker"], fd, fd + timedelta(days=60))
    if not px:
        f["spread_pct"] = None
        return
    entry = px[0][1]
    if entry <= 0:
        f["spread_pct"] = None
        return
    f["entry_close"] = entry
    f["spread_pct"] = round((f["tender_price"] - entry) / entry * 100, 3)
    f["converged"] = max(c for _, c in px) >= 0.99 * f["tender_price"]
    f["notional_99sh"] = round(99 * entry, 2)
    f["dollars_99sh"] = round(99 * (f["tender_price"] - entry), 2)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--respread":
        # Reuse a completed EDGAR phase; redo only price measurement + summary.
        prior = json.load(open(sys.argv[2]))
        qualifying = prior["filings"]
        for f in qualifying:
            for k in ("spread_pct", "entry_close", "converged",
                      "notional_99sh", "dollars_99sh"):
                f.pop(k, None)
        summarize(qualifying, raw_count=prior["raw_initial_filings"])
        return
    filings = collect_filings()
    qualifying = []
    for i, f in enumerate(filings):
        text = fetch_offer_text(f)
        if not text:
            print(f"  [{i+1}/{len(filings)}] {f['adsh']} fetch FAILED — skipped",
                  flush=True)
            continue
        classify(f, text)
        tag = "QUALIFY" if f["odd_lot_priority"] else "boilerplate"
        print(f"  [{i+1}/{len(filings)}] {f['file_date']} {f['name'][:48]:48s} "
              f"{tag} {f['offer_type']}"
              + (f" ${f['tender_price']}" if f.get("tender_price") else ""),
              flush=True)
        if f["odd_lot_priority"]:
            qualifying.append(f)
    summarize(qualifying, raw_count=len(filings))


def summarize(qualifying, raw_count):
    for f in qualifying:
        measure_spread(f)
        # Split-adjustment / ticker-misparse artifacts produce absurd spreads —
        # exclude the event entirely (spread AND dollars, else $/yr is corrupted).
        if f.get("spread_pct") is not None and abs(f["spread_pct"]) > 50:
            f["spread_suspect"] = True
            for k in ("spread_pct", "converged", "dollars_99sh", "notional_99sh"):
                f.pop(k, None)

    years = (datetime.strptime(END, "%Y-%m-%d")
             - datetime.strptime(START, "%Y-%m-%d")).days / 365.25
    by_year = defaultdict(int)
    for f in qualifying:
        by_year[f["file_date"][:4]] += 1
    spreads = [f["spread_pct"] for f in qualifying if f.get("spread_pct") is not None]
    pos = [s for s in spreads if s > 0]
    conv = [f for f in qualifying if f.get("spread_pct") is not None]
    completion = (sum(1 for f in conv if f.get("converged")) / len(conv)) if conv else None
    dollars = [f["dollars_99sh"] for f in qualifying
               if f.get("dollars_99sh") is not None and f["dollars_99sh"] > 0]
    epy = len(qualifying) / years
    med = median(spreads) if spreads else None
    med_pos = median(pos) if pos else None
    dpy = (sum(dollars) / years) if dollars else 0.0

    results = {
        "asof": date.today().isoformat(), "window": [START, END],
        "raw_initial_filings": raw_count,
        "qualifying_events": len(qualifying), "events_per_year": round(epy, 2),
        "by_year": dict(sorted(by_year.items())),
        "spread_sample_n": len(spreads),
        "median_spread_pct_all": med,
        "median_spread_pct_positive_only": med_pos,
        "positive_spread_events": len(pos),
        "completion_rate_proxy": completion,
        "implied_dollars_per_year_99sh_positive_spreads": round(dpy, 2),
        "bars": BARS,
        "verdict": {
            "events_per_year": epy >= BARS["events_per_year"],
            "median_spread": (med is not None and med >= BARS["median_spread_pct"]),
            "completion": (completion is not None
                           and completion >= BARS["completion_rate"]),
            "dollars_per_year": dpy >= BARS["dollars_per_year"],
        },
        "filings": qualifying,
    }
    results["verdict"]["PASS"] = all(
        v for k, v in results["verdict"].items() if k != "PASS")
    with open(OUT, "w") as fh:
        json.dump(results, fh, indent=1, default=str)
    print("\n==== GATE SUMMARY ====")
    for k in ("raw_initial_filings", "qualifying_events", "events_per_year",
              "by_year", "spread_sample_n", "median_spread_pct_all",
              "median_spread_pct_positive_only", "positive_spread_events",
              "completion_rate_proxy",
              "implied_dollars_per_year_99sh_positive_spreads"):
        print(f"{k}: {results[k]}")
    print("verdict:", json.dumps(results["verdict"]))
    print(f"report: {OUT}")


if __name__ == "__main__":
    sys.exit(main())
