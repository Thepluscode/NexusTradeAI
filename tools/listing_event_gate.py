#!/usr/bin/env python3
"""Candidate B kill-gate: post-listing drift on Kraken (new USD pairs).

Pre-registered in docs/edge-candidates-2026-06.md (method note 2026-06-10,
recorded before any returns were computed).

Event: first daily candle of a new Kraken USD pair (public OHLC history
start). API horizon is 720 daily candles, so the cohort is listings since
~2024-06 — the pre-registered OOS window. Pairs whose history starts at the
horizon are left-censored (listed earlier) and EXCLUDED.

Trade tested (the version this platform's crypto bot could actually run):
buy at first daily close, exit at +1d and +3d closes. Returns are
BTC-adjusted (same-window XBTUSD return subtracted) and netted by 0.82%
round-trip cost (2 x 0.26% taker + 0.30% slippage).

PASS bars (all required, OOS cohort):
  - net mean return > 0 with cluster-robust t >= 2 (clustered by ISO week
    of listing; overlapping listings share market conditions)
  - net mean >= +1% per event

Spec (Rule 1): inputs = Kraken public AssetPairs + OHLC (free, ~1 req/s);
output = reports/listing_event_gate_<date>.json + console verdict; any
per-pair failure is logged and skipped, never fatal.
"""
import json
import math
import sys
import time
import urllib.request
from collections import defaultdict
from datetime import date, datetime, timezone

API = "https://api.kraken.com/0/public"
COST = 0.0082          # round-trip taker + slippage
CENSOR_GUARD_D = 10    # history starting within this many days of the API
                       # horizon => left-censored, excluded
OUT = f"reports/listing_event_gate_{date.today().strftime('%Y%m%d')}.json"
EXCLUDE_BASES = {"USDT", "USDC", "DAI", "EUR", "GBP", "AUD", "CHF", "CAD",
                 "JPY", "PYUSD", "EURT", "TUSD", "USDG", "RLUSD", "USDQ",
                 "EURQ", "USDR", "USTS", "EURR"}


def get(url, retries=3):
    for i in range(retries):
        try:
            time.sleep(1.0)  # Kraken public rate limit safety
            req = urllib.request.Request(url, headers={"User-Agent": "research"})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read())
        except Exception as e:  # noqa: BLE001
            print(f"  retry {i+1}/{retries} after {e} ({url[-60:]})", flush=True)
            time.sleep(2 ** i)
    return None


def daily_ohlc(pair):
    d = get(f"{API}/OHLC?pair={pair}&interval=1440")
    if not d or d.get("error"):
        return []
    rows = next(iter(d.get("result", {}).values()), [])
    if isinstance(rows, list):
        # [time, open, high, low, close, vwap, volume, count]
        return [(int(r[0]), float(r[4])) for r in rows if float(r[4]) > 0]
    return []


def main():
    pairs_resp = get(f"{API}/AssetPairs")
    if not pairs_resp or pairs_resp.get("error"):
        print("FATAL: AssetPairs fetch failed")
        return 1
    usd_pairs = {}
    for key, p in pairs_resp["result"].items():
        ws = p.get("wsname") or ""
        if not ws.endswith("/USD") or ".d" in key:
            continue
        base = ws.split("/")[0]
        if base in EXCLUDE_BASES:
            continue
        usd_pairs[key] = ws
    print(f"USD pairs to scan: {len(usd_pairs)}", flush=True)

    btc = daily_ohlc("XBTUSD")
    btc_close = dict(btc)
    btc_times = sorted(btc_close)
    if not btc_times:
        print("FATAL: no BTC history")
        return 1
    horizon = btc_times[0]  # API horizon timestamp (oldest visible candle)

    events = []
    for i, (key, ws) in enumerate(sorted(usd_pairs.items())):
        rows = daily_ohlc(key)
        if len(rows) < 5:
            continue
        t0 = rows[0][0]
        if t0 - horizon < CENSOR_GUARD_D * 86400:
            continue  # left-censored: listed before the observable window
        closes = [c for _, c in rows]
        times = [t for t, _ in rows]
        ev = {"pair": ws, "listed": datetime.fromtimestamp(
            t0, tz=timezone.utc).strftime("%Y-%m-%d")}
        for h, label in ((1, "r1"), (3, "r3")):
            if len(closes) <= h:
                ev[label] = None
                continue
            raw = closes[h] / closes[0] - 1
            b0, bh = btc_close.get(times[0]), btc_close.get(times[h])
            btc_r = (bh / b0 - 1) if (b0 and bh) else 0.0
            ev[label] = raw - btc_r - COST
            ev[label + "_raw"] = raw
        events.append(ev)
        print(f"  [{i+1}/{len(usd_pairs)}] {ws:14s} listed {ev['listed']} "
              f"r1={ev.get('r1')!r} r3={ev.get('r3')!r}", flush=True)

    def stats(label):
        xs = [(e, e[label]) for e in events if e.get(label) is not None]
        if len(xs) < 10:
            return {"n": len(xs), "insufficient": True}
        vals = [v for _, v in xs]
        n, mean = len(vals), sum(vals) / len(vals)
        sd = math.sqrt(sum((v - mean) ** 2 for v in vals) / (n - 1))
        t_plain = mean / (sd / math.sqrt(n)) if sd else 0.0
        # cluster by ISO week of listing
        weeks = defaultdict(list)
        for e, v in xs:
            y, w, _ = datetime.strptime(e["listed"], "%Y-%m-%d").isocalendar()
            weeks[(y, w)].append(v)
        cm = [sum(v) / len(v) for v in weeks.values()]
        g = len(cm)
        gmean = sum(cm) / g
        gsd = math.sqrt(sum((v - gmean) ** 2 for v in cm) / (g - 1)) if g > 1 else 0
        t_clust = gmean / (gsd / math.sqrt(g)) if gsd else 0.0
        wins = sum(1 for v in vals if v > 0)
        return {"n": n, "clusters": g, "net_mean_pct": round(mean * 100, 3),
                "median_pct": round(sorted(vals)[n // 2] * 100, 3),
                "win_rate": round(wins / n, 3), "t_plain": round(t_plain, 2),
                "t_clustered": round(t_clust, 2),
                "cluster_mean_pct": round(gmean * 100, 3)}

    s1, s3 = stats("r1"), stats("r3")
    verdict = {}
    for label, s in (("hold_1d", s1), ("hold_3d", s3)):
        ok = (not s.get("insufficient") and s["net_mean_pct"] > 0
              and s["t_clustered"] >= 2 and s["net_mean_pct"] >= 1.0)
        verdict[label] = ok
    verdict["PASS"] = any(verdict.values())

    results = {"asof": date.today().isoformat(),
               "cohort_window_start": datetime.fromtimestamp(
                   horizon, tz=timezone.utc).strftime("%Y-%m-%d"),
               "events": len(events), "cost_round_trip": COST,
               "hold_1d": s1, "hold_3d": s3, "verdict": verdict,
               "event_list": events}
    with open(OUT, "w") as fh:
        json.dump(results, fh, indent=1)
    print("\n==== GATE SUMMARY ====")
    print("cohort since:", results["cohort_window_start"], "events:", len(events))
    print("hold_1d:", json.dumps(s1))
    print("hold_3d:", json.dumps(s3))
    print("verdict:", json.dumps(verdict))
    print("report:", OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
