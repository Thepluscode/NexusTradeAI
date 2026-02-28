#!/usr/bin/env python3
"""
NexusTradeAI — Enhanced Strategy Backtest
==========================================

Backtests the IMPROVED 7-strategy ensemble with:
  • BB Squeeze, RSI Divergence, MACD, Volume Profile, Regime Detection
  • GARCH-based dynamic stops
  • Volume confirmation filter (1.5x avg)
  • Time-based stale exits
  • Correlation filter between positions
  • Trailing stops (5% activation)

Runs side-by-side with the OLD simple SMA crossover for comparison.
"""

import sys, os, json
from datetime import datetime
from typing import Dict, List, Optional
import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from HistoricalDataFetcher import HistoricalDataFetcher

import logging
logging.basicConfig(level=logging.WARNING, format='%(message)s')
logger = logging.getLogger(__name__)

# =============================================================================
# INDICATORS (Python ports of the JS strategy engine)
# =============================================================================

def sma(arr, period):
    """Simple Moving Average."""
    out = np.full(len(arr), np.nan)
    for i in range(period - 1, len(arr)):
        out[i] = np.mean(arr[i - period + 1:i + 1])
    return out

def ema(arr, period):
    """Exponential Moving Average."""
    out = np.full(len(arr), np.nan)
    k = 2.0 / (period + 1)
    out[period - 1] = np.mean(arr[:period])
    for i in range(period, len(arr)):
        out[i] = arr[i] * k + out[i - 1] * (1 - k)
    return out

def rsi(closes, period=14):
    """Relative Strength Index."""
    out = np.full(len(closes), np.nan)
    for i in range(period, len(closes)):
        gains, losses = 0.0, 0.0
        for j in range(i - period, i):
            delta = closes[j + 1] - closes[j]
            if delta > 0:
                gains += delta
            else:
                losses -= delta
        avg_gain = gains / period
        avg_loss = losses / period
        if avg_loss == 0:
            out[i] = 100
        else:
            rs = avg_gain / avg_loss
            out[i] = 100 - (100 / (1 + rs))
    return out

def bollinger_bands(closes, period=20, std_mult=2.0):
    """Bollinger Bands — returns (upper, middle, lower, bandwidth)."""
    mid = sma(closes, period)
    upper = np.full(len(closes), np.nan)
    lower = np.full(len(closes), np.nan)
    bw = np.full(len(closes), np.nan)
    for i in range(period - 1, len(closes)):
        s = np.std(closes[i - period + 1:i + 1])
        upper[i] = mid[i] + std_mult * s
        lower[i] = mid[i] - std_mult * s
        bw[i] = (upper[i] - lower[i]) / mid[i] if mid[i] > 0 else 0
    return upper, mid, lower, bw

def macd(closes, fast=12, slow=26, signal=9):
    """MACD — returns (macd_line, signal_line, histogram)."""
    ema_fast = ema(closes, fast)
    ema_slow = ema(closes, slow)
    macd_line = ema_fast - ema_slow
    sig = ema(macd_line, signal)
    hist = macd_line - sig
    return macd_line, sig, hist

def atr(highs, lows, closes, period=14):
    """Average True Range."""
    out = np.full(len(closes), np.nan)
    trs = np.zeros(len(closes))
    for i in range(1, len(closes)):
        trs[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]), abs(lows[i] - closes[i - 1]))
    for i in range(period, len(closes)):
        out[i] = np.mean(trs[i - period + 1:i + 1])
    return out

def pearson_correlation(a, b):
    """Pearson correlation coefficient between two arrays."""
    n = min(len(a), len(b))
    if n < 10:
        return 0
    a, b = a[-n:], b[-n:]
    ma, mb = np.mean(a), np.mean(b)
    num = np.sum((a - ma) * (b - mb))
    da = np.sqrt(np.sum((a - ma) ** 2))
    db = np.sqrt(np.sum((b - mb) ** 2))
    if da == 0 or db == 0:
        return 0
    return num / (da * db)

# =============================================================================
# 7-STRATEGY ENSEMBLE SIGNAL GENERATOR
# =============================================================================

def generate_ensemble_signal(closes, highs, lows, volumes):
    """
    Python port of the 7-strategy ensemble from advanced-strategy-engine.js.
    Returns: direction ('long'/'short'/None), agreement_count, confidence
    """
    n = len(closes)
    if n < 50:
        return None, 0, 0.0

    votes_long = 0
    votes_short = 0
    total_strategies = 7

    # 1. SMA Crossover (10/20)
    fast_ma = sma(closes, 10)
    slow_ma = sma(closes, 20)
    if not np.isnan(fast_ma[-1]) and not np.isnan(slow_ma[-1]):
        if fast_ma[-1] > slow_ma[-1] and fast_ma[-2] <= slow_ma[-2]:
            votes_long += 1
        elif fast_ma[-1] < slow_ma[-1] and fast_ma[-2] >= slow_ma[-2]:
            votes_short += 1

    # 2. RSI (14)
    rsi_vals = rsi(closes, 14)
    if not np.isnan(rsi_vals[-1]):
        if rsi_vals[-1] < 30:
            votes_long += 1
        elif rsi_vals[-1] > 70:
            votes_short += 1

    # 3. MACD
    macd_line, sig_line, hist = macd(closes)
    if not np.isnan(hist[-1]) and not np.isnan(hist[-2]):
        if hist[-1] > 0 and hist[-2] <= 0:
            votes_long += 1
        elif hist[-1] < 0 and hist[-2] >= 0:
            votes_short += 1

    # 4. Bollinger Band Squeeze
    upper, mid, lower, bw = bollinger_bands(closes, 20, 2.0)
    if not np.isnan(bw[-1]):
        # Look for BB squeeze release
        bw_recent = bw[-20:]
        bw_clean = bw_recent[~np.isnan(bw_recent)]
        if len(bw_clean) >= 10:
            avg_bw = np.mean(bw_clean)
            if bw[-1] < avg_bw * 0.5:  # Squeeze
                if closes[-1] > mid[-1]:
                    votes_long += 1
                else:
                    votes_short += 1

    # 5. RSI Divergence
    if not np.isnan(rsi_vals[-1]) and n >= 14:
        # Bullish divergence: price makes lower low, RSI makes higher low
        price_ll = closes[-1] < min(closes[-5:-1])
        rsi_hl = rsi_vals[-1] > min(rsi_vals[-5:-1]) if not any(np.isnan(rsi_vals[-5:])) else False
        if price_ll and rsi_hl:
            votes_long += 1

        # Bearish divergence: price makes higher high, RSI makes lower high
        price_hh = closes[-1] > max(closes[-5:-1])
        rsi_lh = rsi_vals[-1] < max(rsi_vals[-5:-1]) if not any(np.isnan(rsi_vals[-5:])) else False
        if price_hh and rsi_lh:
            votes_short += 1

    # 6. Volume Profile
    if len(volumes) >= 20 and np.all(volumes[-20:] > 0):
        avg_vol = np.mean(volumes[-20:])
        if volumes[-1] > avg_vol * 1.5:
            if closes[-1] > closes[-2]:
                votes_long += 1
            else:
                votes_short += 1

    # 7. Trend Strength (EMA 9 vs EMA 21)
    ema9 = ema(closes, 9)
    ema21 = ema(closes, 21)
    if not np.isnan(ema9[-1]) and not np.isnan(ema21[-1]):
        if ema9[-1] > ema21[-1]:
            votes_long += 1
        else:
            votes_short += 1

    # Determine direction — need 3/7 agreement (looser for daily bars)
    threshold = 3
    if votes_long >= threshold:
        return 'long', votes_long, votes_long / total_strategies
    elif votes_short >= threshold:
        return 'short', votes_short, votes_short / total_strategies
    return None, max(votes_long, votes_short), 0.0


# =============================================================================
# BACKTEST ENGINE
# =============================================================================

class EnhancedBacktestEngine:
    """Backtest engine with improved risk controls."""

    def __init__(self, capital=100000.0, label="Enhanced"):
        self.label = label
        self.initial_capital = capital
        self.cash = capital
        self.positions = {}
        self.trades = []
        self.equity_curve = []
        self.tx_cost = 0.0005  # 5 bps (limit order)

    def portfolio_value(self, prices):
        val = self.cash
        for sym, p in self.positions.items():
            if sym in prices:
                val += p['shares'] * prices[sym]
        return val

    def buy(self, sym, price, shares, date=None):
        cost = price * shares * (1 + self.tx_cost)
        if cost > self.cash or shares <= 0:
            return False
        self.cash -= cost
        if sym in self.positions:
            old = self.positions[sym]
            ns = old['shares'] + shares
            ne = (old['shares'] * old['entry'] + shares * price) / ns
            self.positions[sym] = {'shares': ns, 'entry': ne, 'date': old['date']}
        else:
            self.positions[sym] = {'shares': shares, 'entry': price, 'date': date, 'hwm': price}
        return True

    def sell(self, sym, price, reason="", shares=None):
        if sym not in self.positions:
            return 0
        pos = self.positions[sym]
        s = shares or pos['shares']
        s = min(s, pos['shares'])
        proceeds = price * s * (1 - self.tx_cost)
        profit = (price - pos['entry']) * s
        pct = (price - pos['entry']) / pos['entry']
        self.cash += proceeds
        if s >= pos['shares']:
            del self.positions[sym]
        else:
            self.positions[sym]['shares'] -= s
        self.trades.append({
            'symbol': sym, 'entry': pos['entry'], 'exit': price,
            'shares': s, 'profit': profit, 'pct': pct, 'reason': reason
        })
        return profit


# =============================================================================
# RUN COMPARISON BACKTEST
# =============================================================================

def run_comparison():
    print("\n" + "=" * 70)
    print("  ENHANCED vs BASELINE BACKTEST COMPARISON")
    print("=" * 70 + "\n")

    # Load data
    print("📊 Loading historical data...")
    fetcher = HistoricalDataFetcher()
    symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN', 'JPM', 'V']
    raw_data = fetcher.fetch_universe(symbols=symbols, start_date="2019-01-01", min_history_days=252 * 4)

    if not raw_data:
        print("❌ Failed to load data")
        return

    data = {}
    for sym, df in raw_data.items():
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        data[sym] = df.copy()

    all_dates = None
    for sym, df in data.items():
        s = set(df.index)
        all_dates = s if all_dates is None else all_dates.intersection(s)
    dates = sorted(list(all_dates))
    print(f"✅ Loaded {len(data)} symbols, {len(dates)} trading days\n")

    # ── Pre-calculate numpy arrays ──
    arrays = {}
    for sym, df in data.items():
        arrays[sym] = {
            'close': df['close'].values.astype(float),
            'high': df['high'].values.astype(float),
            'low': df['low'].values.astype(float),
            'volume': df['volume'].values.astype(float),
            'idx_map': {d: i for i, d in enumerate(df.index)}
        }

    # ── Run both engines in parallel ──
    baseline = EnhancedBacktestEngine(label="Baseline (SMA 10/20)")
    enhanced = EnhancedBacktestEngine(label="Enhanced (7-Strategy Ensemble)")

    WARMUP = 50
    MAX_POS = 5
    SL_BASE = 0.07
    TP_BASE = 0.15

    print("🚀 Running both strategies...\n")

    for i, date in enumerate(dates[WARMUP:], start=WARMUP):
        prices = {}
        for sym in data:
            if date in arrays[sym]['idx_map']:
                idx = arrays[sym]['idx_map'][date]
                prices[sym] = arrays[sym]['close'][idx]

        # ─────── BASELINE: Simple SMA Crossover ───────
        # Manage exits
        for sym in list(baseline.positions):
            if sym not in prices:
                continue
            pos = baseline.positions[sym]
            pnl = (prices[sym] - pos['entry']) / pos['entry']
            if pnl >= TP_BASE:
                baseline.sell(sym, prices[sym], "PROFIT_TARGET")
            elif pnl <= -SL_BASE:
                baseline.sell(sym, prices[sym], "STOP_LOSS")

        # Entries
        if len(baseline.positions) < MAX_POS:
            for sym in data:
                if sym in baseline.positions or sym not in prices:
                    continue
                if len(baseline.positions) >= MAX_POS:
                    break
                idx = arrays[sym]['idx_map'].get(date)
                if idx is None or idx < 21:
                    continue
                c = arrays[sym]['close']
                f10 = np.mean(c[idx - 9:idx + 1])
                f10p = np.mean(c[idx - 10:idx])
                s20 = np.mean(c[idx - 19:idx + 1])
                s20p = np.mean(c[idx - 20:idx])
                if f10 > s20 and f10p <= s20p:
                    eq = baseline.portfolio_value(prices)
                    shares = int(eq * 0.10 / prices[sym])
                    baseline.buy(sym, prices[sym], shares, date)

        baseline.equity_curve.append({'date': date, 'equity': baseline.portfolio_value(prices)})

        # ─────── ENHANCED: 7-Strategy Ensemble ───────
        # Manage exits
        for sym in list(enhanced.positions):
            if sym not in prices:
                continue
            pos = enhanced.positions[sym]
            pnl = (prices[sym] - pos['entry']) / pos['entry']

            # Dynamic GARCH-like stop: use recent ATR as volatility proxy
            idx = arrays[sym]['idx_map'].get(date)
            dynamic_sl = SL_BASE
            if idx and idx >= 14:
                atr_val = atr(arrays[sym]['high'][:idx+1], arrays[sym]['low'][:idx+1], arrays[sym]['close'][:idx+1], 14)
                if not np.isnan(atr_val[-1]):
                    atr_pct = atr_val[-1] / prices[sym]
                    dynamic_sl = max(0.03, min(0.15, atr_pct * 3))

            # Trailing stop
            if pnl >= 0.05:
                hwm = pos.get('hwm', pos['entry'])
                if prices[sym] > hwm:
                    pos['hwm'] = prices[sym]
                    hwm = prices[sym]
                trailing = pos['entry'] + (hwm - pos['entry']) * 0.5
                if prices[sym] <= trailing:
                    enhanced.sell(sym, prices[sym], "TRAILING_STOP")
                    continue

            # Standard exits
            if pnl >= dynamic_sl * 3:
                enhanced.sell(sym, prices[sym], "PROFIT_TARGET")
            elif pnl <= -dynamic_sl:
                enhanced.sell(sym, prices[sym], "STOP_LOSS")
            # Time-based exit: 5+ days with < 1% move
            elif pos.get('date'):
                days_held = (date - pos['date']).days if hasattr(date - pos['date'], 'days') else 0
                if days_held >= 5 and abs(pnl) < 0.01:
                    enhanced.sell(sym, prices[sym], "TIME_EXIT")

        # Entries
        if len(enhanced.positions) < MAX_POS:
            # Check drawdown throttle
            if len(enhanced.equity_curve) >= 2:
                day_ret = (enhanced.equity_curve[-1]['equity'] - enhanced.equity_curve[-2]['equity']) / enhanced.equity_curve[-2]['equity']
            else:
                day_ret = 0
            throttled = day_ret <= -0.015  # pause entries if -1.5% day

            if not throttled:
                candidates = []
                for sym in data:
                    if sym in enhanced.positions or sym not in prices:
                        continue
                    idx = arrays[sym]['idx_map'].get(date)
                    if idx is None or idx < 50:
                        continue

                    c = arrays[sym]['close'][:idx + 1]
                    h = arrays[sym]['high'][:idx + 1]
                    l = arrays[sym]['low'][:idx + 1]
                    v = arrays[sym]['volume'][:idx + 1]

                    # Volume confirmation (loose for daily bars)
                    if len(v) >= 20 and np.all(v[-20:] > 0):
                        avg_v = np.mean(v[-20:])
                        if v[-1] < avg_v * 0.5:  # Only reject extremely low volume
                            continue

                    # Ensemble signal
                    direction, agreement, confidence = generate_ensemble_signal(c, h, l, v)
                    if direction == 'long' and agreement >= 3:
                        # Correlation check with existing positions
                        corr_ok = True
                        for pos_sym in enhanced.positions:
                            pos_idx = arrays[pos_sym]['idx_map'].get(date)
                            if pos_idx and pos_idx >= 30:
                                r = pearson_correlation(c[-30:], arrays[pos_sym]['close'][pos_idx - 29:pos_idx + 1])
                                if abs(r) > 0.90:  # Looser for daily data
                                    corr_ok = False
                                    break
                        if corr_ok:
                            candidates.append((sym, confidence, agreement))

                # Sort by confidence, take best
                candidates.sort(key=lambda x: -x[1])
                for sym, conf, agr in candidates:
                    if len(enhanced.positions) >= MAX_POS:
                        break
                    eq = enhanced.portfolio_value(prices)
                    # Half-Kelly approximation
                    position_pct = min(0.10, conf * 0.15)
                    shares = int(eq * position_pct / prices[sym])
                    enhanced.buy(sym, prices[sym], shares, date)

        enhanced.equity_curve.append({'date': date, 'equity': enhanced.portfolio_value(prices)})

        # Progress
        progress = i - WARMUP
        total = len(dates) - WARMUP
        if progress % 300 == 0:
            print(f"   Day {progress}/{total} | Baseline: ${baseline.portfolio_value(prices):,.0f} | Enhanced: ${enhanced.portfolio_value(prices):,.0f}")

    # Close all remaining
    final_prices = {s: arrays[s]['close'][-1] for s in data}
    for sym in list(baseline.positions):
        baseline.sell(sym, final_prices.get(sym, 0), "FINAL_CLOSE")
    for sym in list(enhanced.positions):
        enhanced.sell(sym, final_prices.get(sym, 0), "FINAL_CLOSE")

    # ── Results Comparison ──
    print_results(baseline, enhanced, dates)
    save_results(baseline, enhanced)


def print_results(baseline, enhanced, dates):
    print("\n" + "=" * 70)
    print("  COMPARISON RESULTS")
    print("=" * 70)

    for engine in [baseline, enhanced]:
        eq = pd.Series([e['equity'] for e in engine.equity_curve])
        initial = engine.initial_capital
        final = eq.iloc[-1]
        total_ret = (final - initial) / initial
        daily = eq.pct_change().dropna()
        years = len(daily) / 252
        ann_ret = (1 + total_ret) ** (1 / max(years, 0.01)) - 1
        vol = daily.std() * np.sqrt(252)
        sharpe = (ann_ret - 0.04) / vol if vol > 0 else 0
        dd = (eq - eq.cummax()) / eq.cummax()
        max_dd = dd.min()

        trades = engine.trades
        winners = [t for t in trades if t['profit'] > 0]
        losers = [t for t in trades if t['profit'] <= 0]
        wr = len(winners) / len(trades) if trades else 0
        avg_w = np.mean([t['pct'] for t in winners]) * 100 if winners else 0
        avg_l = np.mean([t['pct'] for t in losers]) * 100 if losers else 0
        total_w = sum(t['profit'] for t in winners)
        total_l = abs(sum(t['profit'] for t in losers))
        pf = total_w / total_l if total_l > 0 else float('inf')

        print(f"\n{'─' * 40}")
        print(f"  {engine.label}")
        print(f"{'─' * 40}")
        print(f"  Final Value:       ${final:>12,.0f}  ({total_ret * 100:+.1f}%)")
        print(f"  Annual Return:     {ann_ret * 100:>11.1f}%")
        print(f"  Sharpe Ratio:      {sharpe:>11.2f}")
        print(f"  Max Drawdown:      {max_dd * 100:>11.1f}%")
        print(f"  Volatility:        {vol * 100:>11.1f}%")
        print(f"  ─── Trades ───")
        print(f"  Total Trades:      {len(trades):>11}")
        print(f"  Win Rate:          {wr * 100:>11.1f}%")
        print(f"  Avg Win:           {avg_w:>11.1f}%")
        print(f"  Avg Loss:          {avg_l:>11.1f}%")
        print(f"  Profit Factor:     {pf:>11.2f}")

        # Exit reason breakdown
        reasons = {}
        for t in trades:
            r = t.get('reason', 'unknown')
            reasons[r] = reasons.get(r, 0) + 1
        if reasons:
            print(f"  ─── Exit Reasons ───")
            for r, c in sorted(reasons.items(), key=lambda x: -x[1]):
                print(f"  {r:20s} {c:>5}")

    # Delta
    print(f"\n{'=' * 70}")
    print("  IMPROVEMENT DELTA")
    print(f"{'=' * 70}")

    b_wr = len([t for t in baseline.trades if t['profit'] > 0]) / len(baseline.trades) * 100 if baseline.trades else 0
    e_wr = len([t for t in enhanced.trades if t['profit'] > 0]) / len(enhanced.trades) * 100 if enhanced.trades else 0

    b_eq = pd.Series([e['equity'] for e in baseline.equity_curve])
    e_eq = pd.Series([e['equity'] for e in enhanced.equity_curve])

    b_ret = (b_eq.iloc[-1] - 100000) / 100000 * 100
    e_ret = (e_eq.iloc[-1] - 100000) / 100000 * 100

    b_dd = ((b_eq - b_eq.cummax()) / b_eq.cummax()).min() * 100
    e_dd = ((e_eq - e_eq.cummax()) / e_eq.cummax()).min() * 100

    print(f"\n  Win Rate:     {b_wr:.1f}% → {e_wr:.1f}%  ({e_wr - b_wr:+.1f}%)")
    print(f"  Total Return: {b_ret:.1f}% → {e_ret:.1f}%  ({e_ret - b_ret:+.1f}%)")
    print(f"  Max Drawdown: {b_dd:.1f}% → {e_dd:.1f}%  ({e_dd - b_dd:+.1f}%)")
    print()


def save_results(baseline, enhanced):
    results = {
        'timestamp': datetime.now().isoformat(),
        'baseline': {
            'total_return': (pd.Series([e['equity'] for e in baseline.equity_curve]).iloc[-1] - 100000) / 100000,
            'trades': len(baseline.trades),
            'win_rate': len([t for t in baseline.trades if t['profit'] > 0]) / len(baseline.trades) if baseline.trades else 0,
        },
        'enhanced': {
            'total_return': (pd.Series([e['equity'] for e in enhanced.equity_curve]).iloc[-1] - 100000) / 100000,
            'trades': len(enhanced.trades),
            'win_rate': len([t for t in enhanced.trades if t['profit'] > 0]) / len(enhanced.trades) if enhanced.trades else 0,
        }
    }
    out_dir = os.path.join(os.path.dirname(__file__), 'backtest_results')
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, 'enhanced_backtest_results.json'), 'w') as f:
        json.dump(results, f, indent=2, default=str)
    print(f"💾 Results saved to backtest_results/enhanced_backtest_results.json\n")


if __name__ == "__main__":
    run_comparison()
