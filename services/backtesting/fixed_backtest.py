#!/usr/bin/env python3
"""
NexusTradeAI - FIXED Strategy Backtest
=======================================

This version ACTUALLY executes trades by fixing the date indexing issue.

The problem: Using df.loc[date] fails when date formats don't match exactly.
The fix: Use iloc with a date-to-index mapping.
"""

import sys
import os
import json
from datetime import datetime
from typing import Dict, List

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd

from HistoricalDataFetcher import HistoricalDataFetcher
from PerformanceAnalytics import create_performance_analytics

import logging
logging.basicConfig(level=logging.INFO, format='%(message)s')
logger = logging.getLogger(__name__)


# =============================================================================
# FIXED BACKTEST ENGINE - PROPERLY EXECUTES TRADES
# =============================================================================

class FixedBacktestEngine:
    """Simple backtest engine that WORKS."""
    
    def __init__(self, initial_capital: float = 100000.0):
        self.initial_capital = initial_capital
        self.cash = initial_capital
        self.positions = {}  # symbol -> {'shares': int, 'entry': float}
        self.trades = []
        self.equity_curve = []
        self.transaction_costs = 0.001  # 0.1% per trade (10 bps)
    
    def get_portfolio_value(self, prices: Dict[str, float]) -> float:
        """Calculate total portfolio value."""
        value = self.cash
        for symbol, pos in self.positions.items():
            if symbol in prices:
                value += pos['shares'] * prices[symbol]
        return value
    
    def buy(self, symbol: str, price: float, shares: int) -> bool:
        """Execute buy order."""
        cost = price * shares * (1 + self.transaction_costs)
        if cost > self.cash:
            return False
        
        self.cash -= cost
        
        if symbol in self.positions:
            # Average into position
            old_shares = self.positions[symbol]['shares']
            old_entry = self.positions[symbol]['entry']
            new_shares = old_shares + shares
            new_entry = (old_shares * old_entry + shares * price) / new_shares
            self.positions[symbol] = {'shares': new_shares, 'entry': new_entry}
        else:
            self.positions[symbol] = {'shares': shares, 'entry': price}
        
        return True
    
    def sell(self, symbol: str, price: float, shares: int = None) -> float:
        """Execute sell order. Returns profit."""
        if symbol not in self.positions:
            return 0
        
        pos = self.positions[symbol]
        if shares is None:
            shares = pos['shares']
        
        shares = min(shares, pos['shares'])
        proceeds = price * shares * (1 - self.transaction_costs)
        profit = (price - pos['entry']) * shares
        
        self.cash += proceeds
        
        if shares >= pos['shares']:
            del self.positions[symbol]
        else:
            self.positions[symbol]['shares'] -= shares
        
        self.trades.append({
            'symbol': symbol,
            'entry': pos['entry'],
            'exit': price,
            'shares': shares,
            'profit': profit,
            'pct': (price - pos['entry']) / pos['entry']
        })
        
        return profit


def run_fixed_backtest():
    """Run a backtest that ACTUALLY trades."""
    
    print("\n" + "="*60)
    print("  FIXED BACKTEST - This One Actually Trades")
    print("="*60 + "\n")
    
    # Load data
    print("📊 Loading data...")
    fetcher = HistoricalDataFetcher()
    symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN', 'JPM', 'V']
    
    raw_data = fetcher.fetch_universe(symbols=symbols, start_date="2019-01-01", min_history_days=252*4)
    
    if not raw_data:
        print("❌ Failed to load data")
        return
    
    # Convert to numpy arrays for speed and fix timezone
    data = {}
    for symbol, df in raw_data.items():
        if df.index.tz is not None:
            df.index = df.index.tz_localize(None)
        data[symbol] = df.copy()
    
    # Get common dates
    all_dates = None
    for symbol, df in data.items():
        if all_dates is None:
            all_dates = set(df.index)
        else:
            all_dates = all_dates.intersection(set(df.index))
    
    dates = sorted(list(all_dates))
    print(f"✅ Loaded {len(data)} symbols, {len(dates)} trading days\n")
    
    # Strategy parameters (optimized from earlier)
    FAST_MA = 10
    SLOW_MA = 20
    PROFIT_TARGET = 0.15  # 15%
    STOP_LOSS = 0.10      # 10%
    MAX_POSITIONS = 5
    
    print(f"Strategy: SMA{FAST_MA}/SMA{SLOW_MA} Crossover")
    print(f"Exit: {PROFIT_TARGET*100:.0f}% profit OR {STOP_LOSS*100:.0f}% loss")
    print()
    
    # Initialize engine
    engine = FixedBacktestEngine(100000.0)
    
    # Pre-calculate MAs
    print("📈 Calculating indicators...")
    mas = {}
    for symbol, df in data.items():
        close = df['close']
        mas[symbol] = {
            'fast': close.rolling(FAST_MA).mean(),
            'slow': close.rolling(SLOW_MA).mean()
        }
    
    # Run backtest
    print("\n🚀 Running backtest...\n")
    
    trades_executed = 0
    signals_generated = 0
    
    for i, date in enumerate(dates[SLOW_MA:], start=SLOW_MA):
        # Get current prices
        prices = {}
        for symbol, df in data.items():
            try:
                idx = df.index.get_loc(date)
                prices[symbol] = df.iloc[idx]['close']
            except KeyError:
                continue
        
        # 1. Manage existing positions
        for symbol in list(engine.positions.keys()):
            if symbol not in prices:
                continue
            
            pos = engine.positions[symbol]
            current_price = prices[symbol]
            pnl_pct = (current_price - pos['entry']) / pos['entry']
            
            # Check exits
            if pnl_pct >= PROFIT_TARGET:
                engine.sell(symbol, current_price)
                trades_executed += 1
                logger.info(f"   ✅ {date.date()} PROFIT EXIT {symbol}: +{pnl_pct*100:.1f}%")
            elif pnl_pct <= -STOP_LOSS:
                engine.sell(symbol, current_price)
                trades_executed += 1
                logger.info(f"   ❌ {date.date()} STOP LOSS {symbol}: {pnl_pct*100:.1f}%")
        
        # 2. Look for entries
        if len(engine.positions) >= MAX_POSITIONS:
            continue
        
        for symbol in data.keys():
            if symbol in engine.positions:
                continue
            if len(engine.positions) >= MAX_POSITIONS:
                break
            if symbol not in prices:
                continue
            
            try:
                idx = data[symbol].index.get_loc(date)
                if idx < 1:
                    continue
                
                fast_today = mas[symbol]['fast'].iloc[idx]
                fast_yesterday = mas[symbol]['fast'].iloc[idx-1]
                slow_today = mas[symbol]['slow'].iloc[idx]
                slow_yesterday = mas[symbol]['slow'].iloc[idx-1]
                
                # Skip if NaN
                if pd.isna(fast_today) or pd.isna(slow_today):
                    continue
                
                # Crossover: fast crosses above slow
                cross_above = fast_today > slow_today and fast_yesterday <= slow_yesterday
                
                if cross_above:
                    signals_generated += 1
                    current_price = prices[symbol]
                    
                    # Position size: 10% of equity
                    equity = engine.get_portfolio_value(prices)
                    position_value = equity * 0.10
                    shares = int(position_value / current_price)
                    
                    if shares > 0 and engine.buy(symbol, current_price, shares):
                        trades_executed += 1
                        logger.info(f"   📈 {date.date()} BUY {symbol} @ ${current_price:.2f} ({shares} shares)")
                        
            except Exception:
                continue
        
        # Record equity
        equity = engine.get_portfolio_value(prices)
        engine.equity_curve.append({'date': date, 'equity': equity})
        
        # Progress
        if (i - SLOW_MA) % 300 == 0:
            print(f"   Progress: {(i-SLOW_MA)}/{len(dates)-SLOW_MA} days | Trades: {trades_executed} | Equity: ${equity:,.0f}")
    
    # Final close all positions
    final_prices = {s: data[s].iloc[-1]['close'] for s in data.keys()}
    for symbol in list(engine.positions.keys()):
        if symbol in final_prices:
            engine.sell(symbol, final_prices[symbol])
    
    # Calculate results
    print("\n" + "="*60)
    print("  RESULTS")
    print("="*60)
    
    equity_df = pd.DataFrame(engine.equity_curve)
    equity_df.set_index('date', inplace=True)
    equity_series = equity_df['equity']
    
    # Calculate metrics
    initial = engine.initial_capital
    final = equity_series.iloc[-1]
    total_return = (final - initial) / initial
    
    # Daily returns
    daily_returns = equity_series.pct_change().dropna()
    
    # Annualized metrics
    trading_days = len(daily_returns)
    years = trading_days / 252
    annualized_return = (1 + total_return) ** (1/years) - 1
    volatility = daily_returns.std() * np.sqrt(252)
    sharpe = (annualized_return - 0.04) / volatility if volatility > 0 else 0
    
    # Drawdown
    rolling_max = equity_series.cummax()
    drawdown = (equity_series - rolling_max) / rolling_max
    max_drawdown = drawdown.min()
    
    # Trade stats
    trades = engine.trades
    if trades:
        winners = [t for t in trades if t['profit'] > 0]
        losers = [t for t in trades if t['profit'] <= 0]
        win_rate = len(winners) / len(trades)
        avg_win = np.mean([t['profit'] for t in winners]) if winners else 0
        avg_loss = np.mean([t['profit'] for t in losers]) if losers else 0
        profit_factor = abs(sum(t['profit'] for t in winners) / sum(t['profit'] for t in losers)) if losers and sum(t['profit'] for t in losers) != 0 else float('inf')
    else:
        win_rate = 0
        avg_win = avg_loss = 0
        profit_factor = 0
    
    print(f"\n📈 RETURNS")
    print(f"   Initial Capital:   ${initial:,.0f}")
    print(f"   Final Value:       ${final:,.0f}")
    print(f"   Total Return:      {total_return*100:.1f}%")
    print(f"   Annualized Return: {annualized_return*100:.1f}%")
    
    print(f"\n📊 RISK METRICS")
    print(f"   Volatility:        {volatility*100:.1f}%")
    print(f"   Max Drawdown:      {max_drawdown*100:.1f}%")
    print(f"   Sharpe Ratio:      {sharpe:.2f}")
    
    print(f"\n🎯 TRADE STATISTICS")
    print(f"   Signals Generated: {signals_generated}")
    print(f"   Trades Executed:   {len(trades)}")
    print(f"   Win Rate:          {win_rate*100:.1f}%")
    print(f"   Avg Win:           ${avg_win:,.0f}")
    print(f"   Avg Loss:          ${avg_loss:,.0f}")
    print(f"   Profit Factor:     {profit_factor:.2f}")
    
    # VERDICT
    print("\n" + "="*60)
    print("  VERDICT")
    print("="*60)
    
    score = 0
    checks = [
        ("Sharpe > 1.0", sharpe > 1.0),
        ("Return > 10%", total_return > 0.10),
        ("Max DD < 25%", abs(max_drawdown) < 0.25),
        ("Win Rate > 45%", win_rate > 0.45),
        ("Profit Factor > 1.2", profit_factor > 1.2),
        ("Trades > 20", len(trades) > 20)
    ]
    
    for name, passed in checks:
        status = "✅" if passed else "❌"
        print(f"   {status} {name}")
        if passed:
            score += 1
    
    print(f"\n   Score: {score}/6")
    
    if score >= 5:
        print("\n   🎉 STRONG EDGE - Strategy shows real potential!")
    elif score >= 3:
        print("\n   ⚠️ MARGINAL EDGE - Some improvements needed")
    else:
        print("\n   🚫 NO EDGE - Strategy not ready for real money")
    
    # Save results
    results = {
        'total_return': total_return,
        'annualized_return': annualized_return,
        'sharpe': sharpe,
        'max_drawdown': max_drawdown,
        'volatility': volatility,
        'total_trades': len(trades),
        'win_rate': win_rate,
        'profit_factor': profit_factor,
        'trades': trades[:50]  # First 50 trades
    }
    
    results_dir = os.path.join(os.path.dirname(__file__), 'backtest_results')
    os.makedirs(results_dir, exist_ok=True)
    
    with open(os.path.join(results_dir, 'fixed_backtest_results.json'), 'w') as f:
        json.dump(results, f, indent=2, default=str)
    
    print(f"\n💾 Results saved to backtest_results/fixed_backtest_results.json")
    print("\n" + "="*60 + "\n")
    
    return results


if __name__ == "__main__":
    run_fixed_backtest()
