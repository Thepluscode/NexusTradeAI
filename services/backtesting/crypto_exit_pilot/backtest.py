"""Counterfactual backtest of CRYPTO_HARD_TIMESTOP_MIN / CRYPTO_MOMENTUM_FADE_EXIT.

Pulls closed crypto trades from the live prod API and replays each one against
Binance 5-minute OHLC bars under several hypothetical exit configurations.
Reports the aggregate change in win-rate, total P&L, profit factor.

Earlier versions used Kraken's public OHLC endpoint, but Kraken returns only
the most recent ~720 bars regardless of `since` — useless for backtesting old
trades. Binance supports startTime/endTime windows and does this correctly.

Caveat: replay only re-evaluates the time-stop / momentum-fade decisions. The
actual stop-loss and take-profit prices are taken from the trade record, so
trades that hit SL or TP first remain unchanged across configs. This isolates
the change attributable to the new exit knobs.

Usage: python3 backtest.py
"""

from __future__ import annotations

import json
import math
import sys
import time
import urllib.parse
import urllib.request
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

API_TRADES = "https://nexus-crypto-bot-production.up.railway.app/api/trades?limit=500"
# Switched from Kraken to Binance. Kraken's REST OHLC returns only the most
# recent ~720 bars regardless of `since` — useless for backtesting historical
# trades. Binance supports startTime/endTime windows for true historical OHLC.
BINANCE_KLINES = "https://api.binance.com/api/v3/klines"
PILOT_DIR = Path(__file__).resolve().parent
RESULTS_PATH = PILOT_DIR / "results.json"
REPORT_PATH = PILOT_DIR / "report.md"
KLINE_CACHE = PILOT_DIR / "klines_cache_binance.json"

# DB symbol -> Binance USDT-pair mapping. Binance uses USDT not USD.
# Bot's "XBTUSD" = Bitcoin → Binance "BTCUSDT".
BINANCE_PAIR_MAP = {
    "XBTUSD": "BTCUSDT",
    "ETHUSD": "ETHUSDT",
    "SOLUSD": "SOLUSDT",
    "XRPUSD": "XRPUSDT",
}

# Configurations to compare. Each tuple is (name, dict of overrides).
CONFIGS = [
    ("baseline_480_240_no_fade", {"hard_min": 480, "soft_min": 240, "fade": False}),
    ("hard_360_soft_180_no_fade", {"hard_min": 360, "soft_min": 180, "fade": False}),
    ("hard_240_soft_120_no_fade", {"hard_min": 240, "soft_min": 120, "fade": False}),
    ("hard_240_soft_120_fade_60_03pct", {"hard_min": 240, "soft_min": 120, "fade": True, "fade_after_min": 60, "fade_pct": 0.003}),
    ("hard_180_soft_90_fade_45_03pct",  {"hard_min": 180, "soft_min": 90,  "fade": True, "fade_after_min": 45, "fade_pct": 0.003}),
]

INTERVAL_MIN = 5  # 5-minute bars


# ---------- helpers ----------

def parse_ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def http_get_json(url: str, retries: int = 3) -> Any:
    last_err: Optional[Exception] = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "nexus-backtest/1.0"})
            with urllib.request.urlopen(req, timeout=20) as resp:
                return json.loads(resp.read())
        except Exception as e:
            last_err = e
            time.sleep(2 ** attempt)
    raise RuntimeError(f"GET {url} failed: {last_err}")


def fetch_trades() -> list[dict]:
    print(f"fetching trades from {API_TRADES}")
    payload = http_get_json(API_TRADES)
    trades = payload.get("trades", [])
    closed = [
        t for t in trades
        if t.get("bot") == "crypto"
        and t.get("status") == "closed"
        and t.get("exit_time") is not None
        and t.get("entry_time") is not None
        and t.get("pnl_pct") is not None
        and t.get("close_reason") not in (None, "orphaned_restart")
    ]
    print(f"  {len(closed)} closed crypto trades suitable for replay")
    return closed


def load_kline_cache() -> dict:
    if KLINE_CACHE.exists():
        return json.loads(KLINE_CACHE.read_text())
    return {}


def save_kline_cache(cache: dict) -> None:
    KLINE_CACHE.write_text(json.dumps(cache))


_LAST_BINANCE_CALL = [0.0]
_BINANCE_MIN_INTERVAL = 0.1  # Binance allows ~10/s comfortably for klines

def fetch_klines(pair: str, since_unix: int, cache: dict, window_min: int = 600) -> list[list[float]]:
    """Return [[ts_seconds, open, high, low, close], ...] for the window.

    `since_unix` is the start of the window in seconds. `window_min` controls
    how many minutes forward to fetch — must comfortably exceed the largest
    hard time-stop we want to test (default 600 = 10h).
    """
    binance_pair = BINANCE_PAIR_MAP.get(pair)
    if not binance_pair:
        raise RuntimeError(f"no Binance mapping for {pair}")
    cache_key = f"{binance_pair}|{since_unix}|{window_min}"
    if cache_key in cache:
        return cache[cache_key]

    elapsed = time.time() - _LAST_BINANCE_CALL[0]
    if elapsed < _BINANCE_MIN_INTERVAL:
        time.sleep(_BINANCE_MIN_INTERVAL - elapsed)

    start_ms = since_unix * 1000
    end_ms = (since_unix + window_min * 60) * 1000
    qs = urllib.parse.urlencode({
        "symbol": binance_pair,
        "interval": f"{INTERVAL_MIN}m",
        "startTime": start_ms,
        "endTime": end_ms,
        "limit": 1000,
    })
    raw = http_get_json(f"{BINANCE_KLINES}?{qs}")
    _LAST_BINANCE_CALL[0] = time.time()

    if isinstance(raw, dict) and raw.get("code"):
        raise RuntimeError(f"Binance error for {binance_pair}: {raw}")

    # Normalise to [ts_seconds, open, high, low, close]
    bars = [[int(b[0]) // 1000, float(b[1]), float(b[2]), float(b[3]), float(b[4])] for b in raw]
    cache[cache_key] = bars
    return bars


# ---------- replay ----------

@dataclass
class ReplayOutcome:
    trade_id: int
    symbol: str
    actual_pnl_pct: float
    actual_minutes_held: int
    actual_close_reason: str
    new_pnl_pct: float
    new_minutes_held: int
    new_close_reason: str
    changed: bool


def replay_trade(trade: dict, cfg: dict, klines_cache: dict) -> Optional[ReplayOutcome]:
    """Replay one trade against given config; return outcome or None if data missing."""
    entry_time = parse_ts(trade["entry_time"])
    actual_exit_time = parse_ts(trade["exit_time"])
    entry_price = float(trade["entry_price"])
    actual_exit_price = float(trade["exit_price"])
    actual_pnl_pct = float(trade["pnl_pct"])
    direction = trade["direction"]  # 'long' or 'short'
    sl = float(trade["stop_loss"]) if trade.get("stop_loss") else None
    tp = float(trade["take_profit"]) if trade.get("take_profit") else None
    actual_minutes = int((actual_exit_time - entry_time).total_seconds() // 60)
    actual_close_reason = trade.get("close_reason", "")
    symbol = trade["symbol"]

    # Fetch enough bars to cover the largest hard time-stop we'll test (8h+slack).
    # Cached on (symbol, since, window) so repeated configs share the same fetch.
    since = int(entry_time.timestamp()) - 60  # 1 min before entry to be safe
    window_min = 600  # 10h — comfortably above max hard_min (480)

    try:
        bars = fetch_klines(symbol, since, klines_cache, window_min=window_min)
    except Exception as e:
        print(f"  trade {trade['id']} {symbol}: kline fetch failed: {e}")
        return None

    if not bars:
        return None

    entry_unix = int(entry_time.timestamp())
    soft_trailed = False
    soft_min = cfg["soft_min"]
    hard_min = cfg["hard_min"]
    fade_on = cfg.get("fade", False)
    fade_after_min = cfg.get("fade_after_min", 60)
    fade_pct = cfg.get("fade_pct", 0.003)

    # Effective stop. If soft trail trips we move it to entry (breakeven).
    effective_sl = sl

    new_pnl_pct: Optional[float] = None
    new_minutes: Optional[int] = None
    new_reason: Optional[str] = None

    for bar in bars:
        ts = int(bar[0])
        if ts < entry_unix:
            continue
        minutes_held = (ts - entry_unix) // 60
        bar_high = float(bar[2])
        bar_low = float(bar[3])
        bar_close = float(bar[4])

        # 1. Stop-loss / take-profit hit during the bar — assume conservative fill at SL/TP price
        if direction == "long":
            if effective_sl is not None and bar_low <= effective_sl:
                new_pnl_pct = (effective_sl - entry_price) / entry_price
                new_minutes = minutes_held
                new_reason = "Stop Loss" if effective_sl == sl else "Trailed Stop (BE)"
                break
            if tp is not None and bar_high >= tp:
                new_pnl_pct = (tp - entry_price) / entry_price
                new_minutes = minutes_held
                new_reason = "Take Profit"
                break
        else:  # short
            if effective_sl is not None and bar_high >= effective_sl:
                new_pnl_pct = (entry_price - effective_sl) / entry_price
                new_minutes = minutes_held
                new_reason = "Stop Loss" if effective_sl == sl else "Trailed Stop (BE)"
                break
            if tp is not None and bar_low <= tp:
                new_pnl_pct = (entry_price - tp) / entry_price
                new_minutes = minutes_held
                new_reason = "Take Profit"
                break

        # 2. Momentum-fade exit (if enabled and not yet trailed)
        if fade_on and not soft_trailed and minutes_held >= fade_after_min:
            move = abs(bar_close - entry_price) / entry_price
            if move < fade_pct:
                pct = (bar_close - entry_price) / entry_price
                if direction == "short":
                    pct = -pct
                new_pnl_pct = pct
                new_minutes = minutes_held
                new_reason = "Momentum Fade Exit"
                break

        # 3. Soft time-stop — trail to BE (only if currently in profit)
        if not soft_trailed and minutes_held >= soft_min:
            soft_trailed = True
            in_profit = (bar_close > entry_price) if direction == "long" else (bar_close < entry_price)
            if in_profit:
                effective_sl = entry_price  # trail to breakeven

        # 4. Hard time-stop — force close at this bar's close
        if minutes_held >= hard_min:
            pct = (bar_close - entry_price) / entry_price
            if direction == "short":
                pct = -pct
            new_pnl_pct = pct
            new_minutes = minutes_held
            new_reason = f"Time Stop ({minutes_held}min)"
            break

    if new_pnl_pct is None:
        # No exit triggered within available data — fall back to actual outcome
        new_pnl_pct = actual_pnl_pct
        new_minutes = actual_minutes
        new_reason = f"insufficient_data ({actual_close_reason})"

    return ReplayOutcome(
        trade_id=trade["id"],
        symbol=symbol,
        actual_pnl_pct=actual_pnl_pct,
        actual_minutes_held=actual_minutes,
        actual_close_reason=actual_close_reason,
        new_pnl_pct=new_pnl_pct,
        new_minutes_held=new_minutes,
        new_close_reason=new_reason,
        changed=(abs(new_pnl_pct - actual_pnl_pct) > 1e-6),
    )


# ---------- aggregate ----------

def aggregate(outcomes: list[ReplayOutcome]) -> dict:
    if not outcomes:
        return {"trades": 0}
    pnls = [o.new_pnl_pct for o in outcomes]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    flats = [p for p in pnls if p == 0]
    total_pnl_pct = sum(pnls)
    win_rate = len(wins) / len(pnls) if pnls else 0
    avg_win = sum(wins) / len(wins) if wins else 0
    avg_loss = sum(losses) / len(losses) if losses else 0
    profit_factor = (sum(wins) / abs(sum(losses))) if losses else float("inf")
    avg_minutes = sum(o.new_minutes_held for o in outcomes) / len(outcomes)
    return {
        "trades": len(outcomes),
        "wins": len(wins),
        "losses": len(losses),
        "flats": len(flats),
        "win_rate": round(win_rate, 4),
        "total_pnl_pct": round(total_pnl_pct, 4),
        "avg_win_pct": round(avg_win, 4),
        "avg_loss_pct": round(avg_loss, 4),
        "profit_factor": round(profit_factor, 3) if profit_factor != float("inf") else None,
        "avg_minutes_held": round(avg_minutes, 1),
        "changed": sum(1 for o in outcomes if o.changed),
    }


def main() -> int:
    trades = fetch_trades()
    if not trades:
        print("no trades to backtest")
        return 1

    cache = load_kline_cache()
    print(f"using kline cache with {len(cache)} entries")

    config_results: dict[str, dict] = {}
    config_outcomes: dict[str, list[ReplayOutcome]] = {}

    for cfg_name, cfg in CONFIGS:
        print(f"\n=== {cfg_name} ===")
        outcomes: list[ReplayOutcome] = []
        for i, t in enumerate(trades):
            if i and i % 25 == 0:
                save_kline_cache(cache)
                print(f"  [{i}/{len(trades)}]")
            o = replay_trade(t, cfg, cache)
            if o:
                outcomes.append(o)
        save_kline_cache(cache)
        config_outcomes[cfg_name] = outcomes
        config_results[cfg_name] = aggregate(outcomes)
        print(f"  → {config_results[cfg_name]}")

    RESULTS_PATH.write_text(json.dumps({
        "configs": dict(CONFIGS),
        "summary": config_results,
        "n_input_trades": len(trades),
    }, indent=2))

    # Markdown report
    lines = ["# Crypto Exit Knobs — Counterfactual Backtest\n"]
    lines.append(f"- Source trades: {len(trades)} closed crypto trades from prod (`bot=crypto`, `status=closed`, ex-orphaned).")
    lines.append("- Method: per-trade Binance 5-min OHLC replay (`/api/v3/klines` with `startTime`/`endTime`). SL/TP carried over from trade record. Soft-stop trails to breakeven on profit at `soft_min`. Optional momentum-fade exit at `fade_after_min` if `|move|/entry < fade_pct`. Hard time-stop at `hard_min`.")
    lines.append("- Limitations: bot's existing Profit Protection / Smart BB Exit / ATR Adverse exits are NOT modelled — both baseline and tightened configs therefore overstate trades that drift to time-stop. Trust the **delta** between configs more than absolute numbers. Slippage/fees not modelled. Symbols mapped: XBTUSD→BTCUSDT, ETHUSD→ETHUSDT, SOLUSD→SOLUSDT, XRPUSD→XRPUSDT.\n")
    lines.append("## Results\n")
    lines.append("| Config | Trades | Win rate | Total P&L (sum %) | Avg win % | Avg loss % | PF | Avg min held | Trades changed vs actual |")
    lines.append("|---|---|---|---|---|---|---|---|---|")
    for cfg_name, _ in CONFIGS:
        r = config_results[cfg_name]
        lines.append(
            f"| `{cfg_name}` | {r['trades']} | {r['win_rate']:.2%} | {r['total_pnl_pct']*100:+.2f} | "
            f"{r['avg_win_pct']*100:+.2f} | {r['avg_loss_pct']*100:+.2f} | "
            f"{r['profit_factor']} | {r['avg_minutes_held']:.0f} | {r['changed']} |"
        )
    REPORT_PATH.write_text("\n".join(lines) + "\n")
    print(f"\nresults → {RESULTS_PATH}")
    print(f"report  → {REPORT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
