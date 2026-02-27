#!/usr/bin/env python3
"""
NexusTradeAI - Strategy Parameter Optimization
===============================================

Test different parameter combinations to find the best Sharpe ratio.

Parameters to optimize:
- MA periods (fast/slow)
- Profit target
- Stop loss
- Holding period

Usage:
    python3 optimize_strategy.py
"""

import sys
import os
import json
from datetime import datetime
from typing import Dict, List, Tuple
from itertools import product

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import numpy as np
import pandas as pd

from HistoricalDataFetcher import HistoricalDataFetcher
from BacktestEngine import BacktestEngine, Order, OrderSide, OrderType, create_backtest_engine
from PerformanceAnalytics import create_performance_analytics

import logging
logging.basicConfig(level=logging.WARNING)


# =============================================================================
# PARAMETERIZED STRATEGY
# =============================================================================

class OptimizableStrategy:
    """Strategy with tunable parameters."""
    
    def __init__(self, fast_ma: int, slow_ma: int, profit_target: float, stop_loss: float):
        self.fast_ma = fast_ma
        self.slow_ma = slow_ma
        self.profit_target = profit_target
        self.stop_loss = stop_loss
        self.positions = {}
    
    def generate_orders(self, data: Dict[str, pd.DataFrame], portfolio, date) -> List[Order]:
        orders = []
        
        # Manage existing positions
        for symbol in list(self.positions.keys()):
            if symbol not in data or data[symbol] is None:
                continue
            
            try:
                current_price = data[symbol].loc[date, 'close']
                entry_price = self.positions[symbol]['entry']
                quantity = self.positions[symbol]['qty']
                
                pnl_pct = (current_price - entry_price) / entry_price
                
                # Exit on profit target or stop loss
                if pnl_pct >= self.profit_target or pnl_pct <= -self.stop_loss:
                    orders.append(Order(
                        symbol=symbol,
                        side=OrderSide.SELL,
                        quantity=quantity,
                        order_type=OrderType.MARKET
                    ))
                    del self.positions[symbol]
                    
            except KeyError:
                continue
        
        # Look for new entries
        if len(self.positions) >= 5:
            return orders
        
        for symbol, df in data.items():
            if symbol in self.positions or len(self.positions) >= 5:
                continue
                
            if df is None or len(df) < self.slow_ma + 5:
                continue
            
            try:
                hist = df.loc[:date]
                if len(hist) < self.slow_ma + 5:
                    continue
                
                close = hist['close']
                fast = close.rolling(self.fast_ma).mean()
                slow = close.rolling(self.slow_ma).mean()
                
                if len(fast) < 2:
                    continue
                
                # Crossover: fast crosses above slow
                today_cross = fast.iloc[-1] > slow.iloc[-1]
                yesterday_below = fast.iloc[-2] <= slow.iloc[-2]
                
                if today_cross and yesterday_below:
                    current_price = close.iloc[-1]
                    position_value = portfolio.equity * 0.10
                    quantity = int(position_value / current_price)
                    
                    if quantity > 0:
                        orders.append(Order(
                            symbol=symbol,
                            side=OrderSide.BUY,
                            quantity=quantity,
                            order_type=OrderType.MARKET
                        ))
                        self.positions[symbol] = {'entry': current_price, 'qty': quantity}
                        
            except Exception:
                continue
        
        return orders
    
    def reset(self):
        self.positions = {}


def run_backtest_with_params(data: Dict[str, pd.DataFrame], fast_ma: int, slow_ma: int, 
                             profit_target: float, stop_loss: float) -> Dict:
    """Run a single backtest with given parameters."""
    
    # Create fresh copies
    data_copy = {s: df.copy() for s, df in data.items()}
    
    engine = create_backtest_engine(initial_capital=100000.0, broker='conservative')
    strategy = OptimizableStrategy(fast_ma, slow_ma, profit_target, stop_loss)
    
    def strategy_func(d, portfolio, date):
        return strategy.generate_orders(d, portfolio, date)
    
    result = engine.run(data=data_copy, strategy=strategy_func)
    
    analytics = create_performance_analytics(risk_free_rate=0.04)
    metrics = analytics.calculate_all_metrics(result.equity_curve, [])
    
    return {
        'fast_ma': fast_ma,
        'slow_ma': slow_ma,
        'profit_target': profit_target,
        'stop_loss': stop_loss,
        'total_return': metrics.total_return,
        'sharpe': metrics.sharpe_ratio,
        'sortino': metrics.sortino_ratio,
        'max_drawdown': metrics.max_drawdown,
        'total_trades': metrics.total_trades,
        'win_rate': metrics.win_rate,
        'profit_factor': metrics.profit_factor
    }


def main():
    print("\n" + "="*60)
    print("  STRATEGY PARAMETER OPTIMIZATION")
    print("  Finding the best parameter combination")
    print("="*60 + "\n")
    
    # Load data
    print("📊 Loading historical data...")
    fetcher = HistoricalDataFetcher()
    symbols = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'META', 'GOOGL', 'AMZN', 
               'JPM', 'V', 'MA', 'HD', 'UNH', 'TSLA']
    
    data = fetcher.fetch_universe(symbols=symbols, start_date="2019-01-01", min_history_days=252*4)
    
    if not data:
        print("❌ Failed to load data")
        return
    
    # Convert to tz-naive
    for symbol in data:
        if data[symbol].index.tz is not None:
            data[symbol].index = data[symbol].index.tz_localize(None)
    
    print(f"✅ Loaded {len(data)} symbols\n")
    
    # Parameter grid
    fast_mas = [5, 10, 20]
    slow_mas = [20, 50, 100]
    profit_targets = [0.05, 0.10, 0.15, 0.20]
    stop_losses = [0.03, 0.05, 0.08, 0.10]
    
    # Generate valid combinations (fast < slow)
    param_combos = []
    for fast, slow in product(fast_mas, slow_mas):
        if fast < slow:
            for pt, sl in product(profit_targets, stop_losses):
                param_combos.append((fast, slow, pt, sl))
    
    print(f"🔄 Testing {len(param_combos)} parameter combinations...\n")
    
    results = []
    for i, (fast, slow, pt, sl) in enumerate(param_combos):
        try:
            result = run_backtest_with_params(data, fast, slow, pt, sl)
            results.append(result)
            
            # Progress update every 10
            if (i + 1) % 10 == 0 or i == 0:
                print(f"   Progress: {i+1}/{len(param_combos)} ({(i+1)/len(param_combos)*100:.0f}%)")
                
        except Exception as e:
            print(f"   Error with params ({fast},{slow},{pt},{sl}): {e}")
    
    # Sort by Sharpe ratio
    results.sort(key=lambda x: x['sharpe'], reverse=True)
    
    # Print top 10 results
    print("\n" + "="*60)
    print("  TOP 10 PARAMETER COMBINATIONS (by Sharpe Ratio)")
    print("="*60 + "\n")
    
    print(f"{'Rank':<5} {'Fast':<5} {'Slow':<5} {'PT%':<6} {'SL%':<6} {'Return':<10} {'Sharpe':<8} {'Trades':<8} {'WinRate':<8}")
    print("-" * 70)
    
    for i, r in enumerate(results[:10]):
        print(f"{i+1:<5} {r['fast_ma']:<5} {r['slow_ma']:<5} {r['profit_target']*100:<6.0f} {r['stop_loss']*100:<6.0f} "
              f"{r['total_return']*100:<10.1f}% {r['sharpe']:<8.2f} {r['total_trades']:<8} {r['win_rate']*100:<8.1f}%")
    
    # Best result details
    best = results[0]
    print("\n" + "="*60)
    print("  BEST PARAMETERS FOUND")
    print("="*60)
    print(f"""
   Fast MA:        {best['fast_ma']} periods
   Slow MA:        {best['slow_ma']} periods
   Profit Target:  {best['profit_target']*100:.0f}%
   Stop Loss:      {best['stop_loss']*100:.0f}%
   
   📈 PERFORMANCE:
   Total Return:   {best['total_return']*100:.1f}%
   Sharpe Ratio:   {best['sharpe']:.2f}
   Sortino Ratio:  {best['sortino']:.2f}
   Max Drawdown:   {best['max_drawdown']*100:.1f}%
   Total Trades:   {best['total_trades']}
   Win Rate:       {best['win_rate']*100:.1f}%
   Profit Factor:  {best['profit_factor']:.2f}
""")
    
    # Verdict
    print("="*60)
    print("  VERDICT")
    print("="*60)
    
    if best['sharpe'] > 1.0:
        print("   ✅ STRONG EDGE FOUND - Parameters have potential")
    elif best['sharpe'] > 0.5:
        print("   ⚠️ MODERATE EDGE - Better but still needs work")
    else:
        print("   ❌ WEAK EDGE - Even optimized, strategy is marginal")
    
    # Save results
    results_dir = os.path.join(os.path.dirname(__file__), 'backtest_results')
    os.makedirs(results_dir, exist_ok=True)
    
    with open(os.path.join(results_dir, 'optimization_results.json'), 'w') as f:
        json.dump(results[:20], f, indent=2)
    
    print(f"\n💾 Top 20 results saved to backtest_results/optimization_results.json")
    print("\n" + "="*60 + "\n")


if __name__ == "__main__":
    main()
