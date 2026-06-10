"""Tender Scout — pure logic library (no side effects beyond HTTP fetch).

Operationalizes the ONLY evidence-positive edge in this workspace: odd-lot
tender-offer arbitrage (EDGE_FINDINGS / docs/edge-candidates-2026-06.md,
Candidate A — real but capacity-capped at the ~99-share odd-lot limit).
This library powers a DECISION-SUPPORT bot: it finds and prices
opportunities; it never places trades. The register's "no automation"
verdict applies to trade execution, which this deliberately does not do.

Spec (Rule 1):
  Inputs : SEC EDGAR full-text search JSON API + filing archives (free,
           throttled <=4 req/s, declared UA); Yahoo chart API for last close.
  Outputs: list of opportunity dicts (see evaluate_filing) + text report.
  Invariants: pure classification given text; deterministic; per-filing
           failures are skipped and counted, never fatal.
  Failure modes: network errors -> None returns handled by callers; absent
           ticker/price -> opportunity excluded from pricing, kept in census.

Classification regexes are the validated ones from the 2026-06-10 gate
(tools/oddlot_tender_gate.py — kept frozen as the evidence artifact; this is
their canonical home going forward).
"""

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

UA = {"User-Agent": "ThePlusTech Research ogievatheophilus@gmail.com"}
FTS = "https://efts.sec.gov/LATEST/search-index"
REQ_GAP_S = 0.25
ALERT_SPREAD_PCT = 2.0   # the register's pre-registered action bar
ODD_LOT_SHARES = 99

# "(CIK 0001234567)" must never be parsed as a ticker (the gate's misparse bug).
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
EXPIRY_RE = re.compile(
    r"(?:expire[sd]?|expiration)[^.]{0,120}?"
    r"((?:January|February|March|April|May|June|July|August|September|October"
    r"|November|December)\s+\d{1,2},\s+20\d{2})", re.I | re.S)


def fetch(url, retries=3, log=print):
    for i in range(retries):
        try:
            time.sleep(REQ_GAP_S)
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001 — logged, bounded retry (Rule: no silent failures)
            log(f"[fetch] retry {i + 1}/{retries} after {e} ({url[:90]})")
            time.sleep(2 ** i)
    return None


def recent_tender_filings(days, log=print, _fetch=fetch):
    """Initial SC TO-I filings mentioning odd lots within the last `days`."""
    end = datetime.now(timezone.utc).date()
    start = end - timedelta(days=days)
    filings, frm, total = {}, 0, None
    while True:
        params = urllib.parse.urlencode({
            "q": '"odd lots"', "forms": "SC TO-I",
            "startdt": start.isoformat(), "enddt": end.isoformat(), "from": frm})
        raw = _fetch(f"{FTS}?{params}", log=log)
        if not raw:
            break
        page = json.loads(raw)
        hits = page.get("hits", {}).get("hits", [])
        if total is None:
            total = page.get("hits", {}).get("total", {}).get("value", 0)
        for h in hits:
            src = h.get("_source", {})
            if src.get("form") != "SC TO-I":
                continue
            filings.setdefault(src["adsh"], {
                "adsh": src["adsh"],
                "cik": src["ciks"][0].lstrip("0"),
                "name": src["display_names"][0],
                "file_date": src["file_date"],
            })
        frm += 10
        if frm >= min(total or 0, 9990) or not hits:
            break
    return list(filings.values())


def fetch_offer_text(filing, log=print, _fetch=fetch):
    base = (f"https://www.sec.gov/Archives/edgar/data/{filing['cik']}/"
            f"{filing['adsh'].replace('-', '')}")
    raw = _fetch(f"{base}/index.json", log=log)
    if not raw:
        return None
    try:
        items = json.loads(raw)["directory"]["item"]
    except (KeyError, json.JSONDecodeError):
        return None
    docs = [i for i in items
            if i["name"].lower().endswith((".htm", ".html", ".txt"))
            and "index" not in i["name"].lower()]
    docs.sort(key=lambda i: -int(i.get("size") or 0))
    text = ""
    for d in docs[:3]:
        raw = _fetch(f"{base}/{d['name']}", log=log)
        if raw:
            text += re.sub(r"<[^>]+>", " ", raw.decode("utf-8", "ignore"))
        if len(text) > 200_000:
            break
    return text or None


def classify_offer(text, display_name):
    """Pure classification of an offer document. Deterministic."""
    m = TICKER_RE.search(display_name)
    out = {
        "odd_lot_priority": bool(PRIORITY_RE.search(text)),
        "ticker": m.group(1) if m else None,
        "expiry_hint": None,
    }
    em = EXPIRY_RE.search(text)
    if em:
        out["expiry_hint"] = em.group(1)
    if NAV_RE.search(text) and not FIXED_RE.search(text):
        out["offer_type"], out["tender_price"] = "nav_based", None
        return out
    dm = DUTCH_RE.search(text)
    m = dm or FIXED_RE.search(text)
    if dm:
        # Conservative: the low end is the guaranteed minimum if accepted.
        out["offer_type"], out["tender_price"] = "dutch", float(dm.group(1))
    elif m:
        out["offer_type"], out["tender_price"] = "fixed", float(m.group(1))
    else:
        out["offer_type"], out["tender_price"] = "unknown", None
        return out
    # Share-class guard (the NHP artifact, 2026-06-10): if the text around the
    # matched price names preferred/Series shares, the tender price likely
    # belongs to a DIFFERENT security than the display ticker (usually the
    # common). Comparing them manufactures fake spreads — flag, don't price.
    ctx = text[max(0, m.start() - 300):m.end() + 300]
    out["class_warning"] = bool(
        re.search(r"preferred\s+stock|series\s+[a-z]\s+(?:shares|preferred)", ctx, re.I))
    return out


def latest_close(ticker, log=print, _fetch=fetch):
    p2 = int(time.time())
    p1 = p2 - 14 * 86400
    url = (f"https://query1.finance.yahoo.com/v8/finance/chart/"
           f"{urllib.parse.quote(ticker)}?period1={p1}&period2={p2}&interval=1d")
    raw = _fetch(url, retries=2, log=log)
    if not raw:
        return None
    try:
        res = json.loads(raw)["chart"]["result"][0]
        closes = [c for c in res["indicators"]["quote"][0]["close"] if c]
        return float(closes[-1]) if closes else None
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        return None


def evaluate_filing(filing, classification, price):
    """Combine census + classification + live price into an opportunity."""
    opp = {**filing, **classification, "current_price": price,
           "spread_pct": None, "profit_99sh": None, "actionable": False}
    tp = classification.get("tender_price")
    if classification.get("class_warning"):
        # Tender price belongs to a preferred/Series class — pricing it
        # against the common ticker fakes a spread. Surface for manual read.
        opp["spread_pct"], opp["actionable"] = None, False
        opp["offer_type"] = f"{classification['offer_type']} (preferred/series — verify class)"
        return opp
    if tp and price and price > 0:
        spread = (tp - price) / price * 100
        opp["spread_pct"] = round(spread, 2)
        opp["profit_99sh"] = round(ODD_LOT_SHARES * (tp - price), 2)
        opp["actionable"] = spread >= ALERT_SPREAD_PCT
    return opp


def format_report(opps, days):
    """Human-friendly report. Plain language — the user-facing surface."""
    lines = [f"ODD-LOT TENDER SCOUT — last {days} days, "
             f"{len(opps)} odd-lot-priority tender offer(s) found"]
    actionable = [o for o in opps if o["actionable"]]
    watch = [o for o in opps if o["spread_pct"] is not None and not o["actionable"]]
    unpriced = [o for o in opps if o["spread_pct"] is None]
    if not opps:
        lines.append("Nothing active right now. The scout will keep watching.")
    if actionable:
        lines.append(f"\n🎯 ACTIONABLE NOW ({len(actionable)}) — spread ≥ {ALERT_SPREAD_PCT}%:")
        for o in sorted(actionable, key=lambda x: -x["spread_pct"]):
            lines += [
                f"  {o['ticker']} — {o['name'][:60]}",
                f"    Tender ${o['tender_price']:.2f} ({o['offer_type']}) vs market "
                f"${o['current_price']:.2f} → spread +{o['spread_pct']:.1f}%, "
                f"≈ ${o['profit_99sh']:.0f} on a {ODD_LOT_SHARES}-share lot",
                f"    Filed {o['file_date']}"
                + (f" · expires ~{o['expiry_hint']}" if o["expiry_hint"] else ""),
                f"    Do: buy ≤{ODD_LOT_SHARES} shares, then submit a TENDER "
                f"instruction with your broker. Verify the odd-lot preference "
                f"clause in the offer doc first:",
                f"    https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany"
                f"&CIK={o['cik']}&type=SC+TO-I&dateb=&owner=include&count=10",
            ]
    if watch:
        lines.append(f"\n👀 WATCHLIST ({len(watch)}) — priced but spread < {ALERT_SPREAD_PCT}%:")
        for o in watch:
            lines.append(f"  {o['ticker']}: tender ${o['tender_price']:.2f} vs "
                         f"${o['current_price']:.2f} ({o['spread_pct']:+.1f}%)")
    if unpriced:
        lines.append(f"\n❔ UNPRICED ({len(unpriced)}) — NAV-based/unknown terms or no quote; "
                     "read the filing if curious:")
        for o in unpriced:
            lines.append(f"  {o.get('ticker') or '?'}: {o['name'][:60]} ({o['offer_type']})")
    lines.append("\nHonest expectations (from the 2026-06-10 gate): ~9 actionable "
                 "events/yr, ≈ $200–1,400/yr total at odd-lot size. Small, real, "
                 "structurally protected — the 99-share cap IS why it persists.")
    return "\n".join(lines)
